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
    db.select().from(Island),
    db.select().from(Population),
    db.select().from(VehicleCount),
    db.select().from(Service),
    db.select().from(JobLocation),
    db.select().from(TransportConnection),
    db.select().from(TransportRoute)
  ]);

  const rtl = rtlBusStops();
  const stops = new Map(databaseTransportStops(services).map((stop) => [stop.id, stop]));
  for (const stop of rtl.transportStops) {
    const existing = stops.get(stop.id);
    if (existing) {
      existing.routeIds = [...new Set([...existing.routeIds, ...stop.routeIds])];
    } else {
      stops.set(stop.id, stop);
    }
  }

  return {
    islands,
    population,
    vehicleCounts,
    services,
    jobLocations,
    connections,
    routes,
    transportStops: [...stops.values()],
    routeStops: rtl.routeStops
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
