import type { ResidentialDemandPoint, ScoringSnapshot, TransportRouteStop, TransportStop } from './types';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';

import {
  Atoll,
  Island,
  JobLocation,
  Population,
  Service,
  TransportConnection,
  TransportRoute,
  VehicleCount
} from '../../db/models';
import db from '../database';
import { loadLandTopology } from '../mobility/land-topology-data';
import { retainEvidencedAirportLinks } from './airport-evidence';

type RtlBusArtifact = {
  routes?: Array<{ id?: unknown; stop_ids?: unknown }>;
  stops?: Array<{
    id?: unknown;
    source_stop_id?: unknown;
    name?: unknown;
    island_id?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  }>;
};

type RtlFerryArtifact = {
  islands?: Array<{
    rtl_stop_name?: unknown;
    rtl_stop_code?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    official_island_id?: unknown;
    reconciliation_status?: unknown;
  }>;
  routes?: Array<{
    route_id?: unknown;
    route_code?: unknown;
    stop_names?: unknown;
    schedule_entries?: Array<{
      stop_timings?: Array<{ stopName?: unknown; order?: unknown }>;
    }>;
  }>;
};

type OsmBuildingArtifact = {
  island?: { id?: unknown };
  elements?: Array<{
    type?: unknown;
    id?: unknown;
    tags?: Record<string, unknown>;
    center?: { lat?: unknown; lon?: unknown };
  }>;
};

let rtlBusStopsCache: { transportStops: TransportStop[]; routeStops: TransportRouteStop[] } | undefined;
let rtlFerryStopsCache: { transportStops: TransportStop[]; routeStops: TransportRouteStop[] } | undefined;
let residentialDemandPointsCache: ResidentialDemandPoint[] | undefined;
let scoringSnapshotCache: ScoringSnapshot | null = null;
let scoringSnapshotRequest: Promise<ScoringSnapshot> | null = null;
let residentialSnapshotRequest: Promise<ScoringSnapshot> | null = null;
type IslandContext = { island: typeof Island.$inferSelect; atollName: string };
const islandContextCache = new Map<string, IslandContext>();
const islandContextRequests = new Map<string, Promise<IslandContext | null>>();

function rtlBusStops(): { transportStops: TransportStop[]; routeStops: TransportRouteStop[] } {
  const empty = { transportStops: [], routeStops: [] };
  if (rtlBusStopsCache) return rtlBusStopsCache;
  const path = resolve(process.cwd(), 'data/mobility/normalized/rtl-bus.json');
  if (!existsSync(path)) {
    rtlBusStopsCache = empty;
    return empty;
  }

  const artifact = JSON.parse(readFileSync(path, 'utf8')) as RtlBusArtifact;
  const stops = new Map<string, TransportStop>();
  for (const stop of artifact.stops ?? []) {
    const sourceStopId = typeof stop.source_stop_id === 'string' ? stop.source_stop_id : null;
    const id = typeof stop.id === 'string' ? stop.id : sourceStopId ? `rtl:bus-stop:${sourceStopId}` : null;
    const islandId = typeof stop.island_id === 'string' ? stop.island_id : null;
    if (!id || !islandId) continue;
    stops.set(id, {
      id,
      name: typeof stop.name === 'string' ? stop.name : null,
      islandId,
      subtype: 'bus_stop',
      latitude: typeof stop.latitude === 'number' ? stop.latitude : null,
      longitude: typeof stop.longitude === 'number' ? stop.longitude : null,
      routeIds: []
    });
  }

  const routeStops: TransportRouteStop[] = [];
  for (const route of artifact.routes ?? []) {
    const routeId = typeof route.id === 'string' ? route.id : null;
    const stopIds = Array.isArray(route.stop_ids) ? route.stop_ids : [];
    if (!routeId) continue;
    stopIds.forEach((rawStopId, sequence) => {
      const sourceStopId = typeof rawStopId === 'string' ? rawStopId : String(rawStopId);
      const stopId = sourceStopId.startsWith('rtl:bus-stop:') ? sourceStopId : `rtl:bus-stop:${sourceStopId}`;
      const stop = stops.get(stopId);
      if (!stop) return;
      if (!stop.routeIds.includes(routeId)) stop.routeIds.push(routeId);
      routeStops.push({ routeId, stopId, islandId: stop.islandId, sequence });
    });
  }

  rtlBusStopsCache = { transportStops: [...stops.values()], routeStops };
  return rtlBusStopsCache;
}

type MarineGeometry = { type: string; coordinates: unknown };

function geometryPoints(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') return [value];
  return value.flatMap(geometryPoints);
}

function rtlFerryStops(services: ScoringSnapshot['services']): {
  transportStops: TransportStop[];
  routeStops: TransportRouteStop[];
} {
  if (rtlFerryStopsCache) return rtlFerryStopsCache;
  const empty = { transportStops: [], routeStops: [] };
  const path = resolve(process.cwd(), 'data/mobility/transport/rtl-ferry-coverage.json');
  if (!existsSync(path)) {
    rtlFerryStopsCache = empty;
    return empty;
  }

  const artifact = JSON.parse(readFileSync(path, 'utf8')) as RtlFerryArtifact;
  const sourceStops = new Map<string, NonNullable<RtlFerryArtifact['islands']>[number]>();
  for (const stop of artifact.islands ?? []) {
    const name = typeof stop.rtl_stop_name === 'string' ? stop.rtl_stop_name : null;
    const code =
      typeof stop.rtl_stop_code === 'string' || typeof stop.rtl_stop_code === 'number'
        ? String(stop.rtl_stop_code)
        : null;
    const islandId = typeof stop.official_island_id === 'string' ? stop.official_island_id : null;
    if (!name || !code || !islandId || stop.reconciliation_status !== 'matched_exact_atoll_name') continue;
    sourceStops.set(name, stop);
  }

  const marineServices = services.filter(
    (service) =>
      service.serviceType === 'transport' &&
      service.islandId &&
      (service.subtype === 'jetty' || service.subtype === 'port')
  );
  const transportStops = new Map<string, TransportStop>();
  const routeStops: TransportRouteStop[] = [];

  // A route name identifies the RTL service; an exact shared OSM geometry vertex
  // identifies its terminal. Proximity and island-name similarity are not evidence.
  const marinePath = resolve(process.cwd(), 'data/mobility/normalized/osm-marine.json');
  const marine = existsSync(marinePath)
    ? (JSON.parse(readFileSync(marinePath, 'utf8')) as {
        services: Array<{ id: string; geometry: MarineGeometry }>;
        routes: Array<{ id: string; name: string | null; geometry: MarineGeometry; tags?: Record<string, string> }>;
      })
    : { services: [], routes: [] };
  const geometries = new Map(
    marine.services.map((service) => [service.id, geometryPoints(service.geometry.coordinates)])
  );

  const resolveServiceId = (
    sourceStop: NonNullable<RtlFerryArtifact['islands']>[number],
    routeCode: string
  ): { id: string; evidence: string } => {
    const islandId = sourceStop.official_island_id as string;
    const sameIsland = marineServices.filter((service) => service.islandId === islandId);
    const candidates = new Map<string, Set<string>>();
    for (const route of marine.routes) {
      const references = `${route.tags?.ref ?? ''} ${route.name ?? ''}`.toUpperCase().split(/[^A-Z0-9]+/);
      if (!references.includes(routeCode.toUpperCase()) || route.geometry.type !== 'LineString') continue;
      const points = geometryPoints(route.geometry.coordinates);
      const endpoints = [points[0], points.at(-1)].filter((point) => point !== undefined);
      for (const service of sameIsland) {
        const vertices = geometries.get(service.id) ?? [];
        if (!endpoints.some((point) => vertices.some((vertex) => vertex[0] === point[0] && vertex[1] === point[1])))
          continue;
        const evidence = candidates.get(service.id) ?? new Set<string>();
        evidence.add(route.id);
        candidates.set(service.id, evidence);
      }
    }
    if (candidates.size === 1) {
      const [id, evidence] = [...candidates][0];
      return {
        id,
        evidence: `Exact OSM route endpoint / terminal geometry: ${[...evidence].sort().join(', ')}; ${id}`
      };
    }
    return {
      id: `rtl:ferry-stop:${routeCode}:${String(sourceStop.rtl_stop_code)}`,
      evidence: 'RTL island call; physical terminal unresolved'
    };
  };

  for (const route of artifact.routes ?? []) {
    const routeCode = typeof route.route_code === 'string' ? route.route_code : null;
    if (!routeCode || !Array.isArray(route.stop_names)) continue;
    const routeId = `rtl:ferry:${routeCode}`;
    route.stop_names.forEach((rawName, sequence) => {
      if (typeof rawName !== 'string') return;
      const sourceStop = sourceStops.get(rawName);
      if (!sourceStop) return;
      const islandId = sourceStop.official_island_id as string;
      const { id: stopId, evidence } = resolveServiceId(sourceStop, routeCode);
      const existing = transportStops.get(stopId) ?? services.find((service) => service.id === stopId);
      if (!transportStops.has(stopId)) {
        transportStops.set(stopId, {
          id: stopId,
          name: existing
            ? (existing.name ?? `Unnamed ${existing.subtype} (${stopId})`)
            : `${sourceStop.rtl_stop_name as string} — terminal unresolved`,
          islandId: existing?.islandId ?? islandId,
          subtype: existing?.subtype ?? 'jetty',
          latitude: existing?.latitude ?? null,
          longitude: existing?.longitude ?? null,
          routeIds: []
        });
      }
      const stop = transportStops.get(stopId);
      if (stop && !stop.routeIds.includes(routeId)) stop.routeIds.push(routeId);
      routeStops.push({ routeId, stopId, islandId, sequence, terminalEvidence: evidence });
    });
  }

  rtlFerryStopsCache = { transportStops: [...transportStops.values()], routeStops };
  return rtlFerryStopsCache;
}

function scheduledRtlFerryConnections(
  existing: ScoringSnapshot['connections'],
  routeStops: TransportRouteStop[]
): ScoringSnapshot['connections'] {
  const path = resolve(process.cwd(), 'data/mobility/transport/rtl-ferry-coverage.json');
  if (!existsSync(path)) return existing;

  const artifact = JSON.parse(readFileSync(path, 'utf8')) as RtlFerryArtifact;
  const scheduledRouteIds = new Set<string>();
  const generated: ScoringSnapshot['connections'] = [];

  for (const route of artifact.routes ?? []) {
    const routeCode = typeof route.route_code === 'string' ? route.route_code : null;
    if (!routeCode || !Array.isArray(route.stop_names)) continue;
    const schedules = route.schedule_entries ?? [];
    if (schedules.length === 0) continue;

    const routeId = `rtl:ferry:${routeCode}`;
    const callsByName = new Map<string, TransportRouteStop[]>();
    for (const call of routeStops.filter((entry) => entry.routeId === routeId)) {
      const name = route.stop_names[call.sequence];
      if (typeof name !== 'string') continue;
      const calls = callsByName.get(name) ?? [];
      calls.push(call);
      callsByName.set(name, calls);
    }
    let generatedForRoute = false;

    schedules.forEach((schedule, scheduleIndex) => {
      const timings = [...(schedule.stop_timings ?? [])]
        .filter(
          (timing): timing is { stopName: string; order: number } =>
            typeof timing.stopName === 'string' && Number.isInteger(timing.order)
        )
        .sort((left, right) => left.order - right.order);

      for (let index = 1; index < timings.length; index += 1) {
        const fromTiming = timings[index - 1];
        const toTiming = timings[index];
        if (toTiming.order !== fromTiming.order + 1) continue;

        // Schedule order describes this trip and may be the reverse of the
        // catalogue order. Resolve names to canonical route calls, then only
        // accept an unambiguous adjacent pair in the route topology.
        const adjacentPairs = (callsByName.get(fromTiming.stopName) ?? []).flatMap((from) =>
          (callsByName.get(toTiming.stopName) ?? [])
            .filter((to) => Math.abs(to.sequence - from.sequence) === 1 && to.islandId !== from.islandId)
            .map((to) => ({ from, to }))
        );
        const pair = adjacentPairs.length === 1 ? adjacentPairs[0] : undefined;
        const from = pair?.from;
        const to = pair?.to;
        if (!from || !to || from.islandId === to.islandId) {
          continue;
        }

        generated.push({
          id: `${routeId}:schedule:${scheduleIndex}:leg:${fromTiming.order}`,
          routeId,
          tripId: `${routeId}:schedule:${scheduleIndex}`,
          sequence: Math.max(from.sequence, to.sequence),
          fromIslandId: from.islandId,
          toIslandId: to.islandId,
          connectionType: 'ferry',
          directionality: 'forward',
          distanceM: null,
          geoJson: null,
          source: 'RTL',
          sourceObjectId: `${route.route_id ?? routeCode}:schedule:${scheduleIndex}:orders:${fromTiming.order}-${toTiming.order}`,
          modeled: false,
          scoreEligible: true
        });
        generatedForRoute = true;
      }
    });
    if (generatedForRoute) scheduledRouteIds.add(routeId);
  }

  return [
    ...existing.filter(
      (connection) =>
        connection.source !== 'RTL' ||
        connection.connectionType !== 'ferry' ||
        !connection.routeId ||
        !scheduledRouteIds.has(connection.routeId)
    ),
    ...generated
  ];
}

function databaseTransportStops(services: ScoringSnapshot['services']): TransportStop[] {
  const transportSubtypes = new Set([
    'bus_station',
    'bus_stop',
    'public_transport',
    'port',
    'jetty',
    'airport',
    'air_terminal',
    'helipad'
  ]);
  return services.flatMap((service) => {
    if (service.serviceType !== 'transport' || !service.islandId || !transportSubtypes.has(service.subtype)) return [];
    return [
      {
        id: service.id,
        name: service.name,
        islandId: service.islandId,
        subtype: service.subtype,
        latitude: service.latitude,
        longitude: service.longitude,
        routeIds: []
      }
    ];
  });
}

const RESIDENTIAL_BUILDING_TYPES = new Set([
  'apartments',
  'bungalow',
  'cabin',
  'detached',
  'dormitory',
  'house',
  'residential',
  'semidetached_house',
  'terrace'
]);

const NON_RESIDENTIAL_TAG_KEYS = new Set([
  'amenity',
  'craft',
  'education',
  'healthcare',
  'industrial',
  'landuse',
  'leisure',
  'man_made',
  'military',
  'office',
  'power',
  'public_transport',
  'religion',
  'shop',
  'tourism'
]);

function isResidentialBuilding(tags: Record<string, unknown>): boolean {
  const building = typeof tags.building === 'string' ? tags.building.toLowerCase() : '';
  if (RESIDENTIAL_BUILDING_TYPES.has(building)) return true;
  if (building !== 'yes') return false;
  return !Object.keys(tags).some((key) => NON_RESIDENTIAL_TAG_KEYS.has(key));
}

function residentialDemandPoints(): ResidentialDemandPoint[] {
  if (residentialDemandPointsCache) return residentialDemandPointsCache;

  const directory = resolve(process.cwd(), 'data/mobility/normalized');
  if (!existsSync(directory)) {
    residentialDemandPointsCache = [];
    return residentialDemandPointsCache;
  }

  const points: ResidentialDemandPoint[] = [];
  for (const filename of readdirSync(directory)
    .filter((entry) => /^osm-sample-.*\.json$/i.test(entry))
    .sort()) {
    try {
      const artifact = JSON.parse(readFileSync(resolve(directory, filename), 'utf8')) as OsmBuildingArtifact;
      const islandId = typeof artifact.island?.id === 'string' ? artifact.island.id : null;
      if (!islandId) continue;

      for (const element of artifact.elements ?? []) {
        if (element.type !== 'way' || typeof element.id !== 'number' || !isResidentialBuilding(element.tags ?? {})) {
          continue;
        }
        const latitude = element.center?.lat;
        const longitude = element.center?.lon;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
        points.push({
          id: `osm-building:${islandId}:${element.id}`,
          islandId,
          coordinates: [longitude, latitude],
          weight: 1
        });
      }
    } catch {
      // One malformed optional artifact must not prevent the map from loading.
    }
  }

  residentialDemandPointsCache = points;
  return residentialDemandPointsCache;
}

async function loadScoringSnapshotUncached(): Promise<ScoringSnapshot> {
  const [islands, population, vehicleCounts, services, jobLocations, connections, routes] = await Promise.all([
    db.select({ island: Island, atollName: Atoll.name }).from(Island).innerJoin(Atoll, eq(Island.atollId, Atoll.id)),
    db.select().from(Population),
    db.select().from(VehicleCount),
    db.select().from(Service),
    db.select().from(JobLocation),
    db.select().from(TransportConnection),
    db.select().from(TransportRoute)
  ]);

  const rtl = rtlBusStops();
  const rtlFerry = rtlFerryStops(services);
  const stops = new Map(databaseTransportStops(services).map((stop) => [stop.id, stop]));
  for (const stop of rtl.transportStops) {
    const existing = stops.get(stop.id);
    if (existing) {
      existing.routeIds = [...new Set([...existing.routeIds, ...stop.routeIds])];
    } else {
      stops.set(stop.id, stop);
    }
  }
  for (const stop of rtlFerry.transportStops) {
    const existing = stops.get(stop.id);
    if (existing) {
      existing.routeIds = [...new Set([...existing.routeIds, ...stop.routeIds])];
    } else {
      stops.set(stop.id, stop);
    }
  }

  const baseConnections = loadLandTopology(
    islands.map(({ island }) => island),
    retainEvidencedAirportLinks(connections, services)
  ).map((connection) =>
    connection.source === 'RTL' && connection.connectionType === 'ferry' && connection.scoreEligible === false
      ? { ...connection, scoreEligible: true }
      : connection
  );

  return {
    islands: islands.map(({ island, atollName }) => ({ ...island, atollName })),
    population,
    vehicleCounts,
    services,
    jobLocations,
    connections: scheduledRtlFerryConnections(baseConnections, rtlFerry.routeStops),
    routes,
    transportStops: [...stops.values()],
    routeStops: [...rtl.routeStops, ...rtlFerry.routeStops]
  };
}

function loadBaseScoringSnapshot(): Promise<ScoringSnapshot> {
  if (scoringSnapshotCache) return Promise.resolve(scoringSnapshotCache);
  if (scoringSnapshotRequest) return scoringSnapshotRequest;

  const request = loadScoringSnapshotUncached();
  scoringSnapshotRequest = request;
  void request.then(
    (snapshot) => {
      if (scoringSnapshotRequest !== request) return;
      scoringSnapshotRequest = null;
      scoringSnapshotCache = snapshot;
    },
    () => {
      if (scoringSnapshotRequest === request) scoringSnapshotRequest = null;
    }
  );
  return request;
}

export function loadScoringSnapshot(
  options: { includeResidentialDemandPoints?: boolean } = {}
): Promise<ScoringSnapshot> {
  const includeResidentialDemandPoints = options.includeResidentialDemandPoints === true;
  if (scoringSnapshotCache?.residentialDemandPoints && includeResidentialDemandPoints) {
    return Promise.resolve(scoringSnapshotCache);
  }

  const snapshotRequest = loadBaseScoringSnapshot();
  if (!includeResidentialDemandPoints) return snapshotRequest;
  if (residentialSnapshotRequest) return residentialSnapshotRequest;

  const request = snapshotRequest.then((snapshot) => {
    snapshot.residentialDemandPoints ??= residentialDemandPoints();
    return snapshot;
  });
  residentialSnapshotRequest = request;
  void request.then(
    () => {
      if (residentialSnapshotRequest === request) residentialSnapshotRequest = null;
    },
    () => {
      if (residentialSnapshotRequest === request) residentialSnapshotRequest = null;
    }
  );
  return request;
}

export function clearScoringSnapshotCache(): void {
  rtlBusStopsCache = undefined;
  rtlFerryStopsCache = undefined;
  scoringSnapshotCache = null;
  scoringSnapshotRequest = null;
  residentialSnapshotRequest = null;
  residentialDemandPointsCache = undefined;
  islandContextCache.clear();
  islandContextRequests.clear();
}

export function loadIslandContext(islandId: string): Promise<IslandContext | null> {
  const normalizedId = islandId.trim();
  if (!normalizedId) return Promise.resolve(null);
  const cached = islandContextCache.get(normalizedId);
  if (cached) return Promise.resolve(cached);
  const pending = islandContextRequests.get(normalizedId);
  if (pending) return pending;

  const request = db
    .select({ island: Island, atollName: Atoll.name })
    .from(Island)
    .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
    .where(eq(Island.id, normalizedId))
    .limit(1)
    .then((rows) => {
      const context = rows[0] ?? null;
      if (context) islandContextCache.set(normalizedId, context);
      return context;
    });
  islandContextRequests.set(normalizedId, request);
  void request.then(
    () => islandContextRequests.delete(normalizedId),
    () => islandContextRequests.delete(normalizedId)
  );
  return request;
}
