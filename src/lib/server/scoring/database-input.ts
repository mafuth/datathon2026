import type { ResidentialDemandPoint, ScoringSnapshot, TransportRouteStop, TransportStop } from './types';

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { withResidentialDemandPoints } from './scoring-snapshot';

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
type IslandContext = { island: typeof Island.$inferSelect; atollName: string };
type IslandContextCache = {
  values: Map<string, IslandContext>;
  requests: Map<string, Promise<IslandContext | null>>;
};
let islandContexts = new WeakMap<ScoringSnapshot, IslandContextCache>();
let artifactCacheVersion: string | undefined;
let cacheGeneration = 0;
const REMOTE_REFRESH_MS = 15_000;
type SnapshotCache = {
  version: string;
  artifactVersion: string;
  loadedAt: number;
  snapshot: ScoringSnapshot;
  spatialSnapshot?: ScoringSnapshot;
};
let snapshotCache: SnapshotCache | undefined;
let scoringSnapshotRequest:
  | { sourceVersion: string | null; artifactVersion: string; generation: number; request: Promise<SnapshotCache> }
  | undefined;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fileStamp(path: string): Promise<string> {
  try {
    const info = await stat(path, { bigint: true });
    return `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

type SourceStamp = { sourceVersion: string | null; artifactVersion: string };
let sourceStampRequest: Promise<SourceStamp> | undefined;

async function readScoringSourceStamp(): Promise<SourceStamp> {
  const directory = resolve(process.cwd(), 'data/mobility/normalized');
  let files: string[];
  try {
    files = (await readdir(directory)).filter((entry) => entry.endsWith('.json')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    files = [];
  }
  const artifactStamps = await Promise.all(
    files.map(async (name) => [name, await fileStamp(resolve(directory, name))])
  );
  const artifactVersion = digest(JSON.stringify(artifactStamps));
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:') || url.slice(5).startsWith(':memory:')) {
    return { sourceVersion: null, artifactVersion };
  }
  const path = url.startsWith('file://')
    ? fileURLToPath(url)
    : resolve(process.cwd(), decodeURIComponent(url.slice(5).split('?')[0]));
  const [databaseStamp, walStamp] = await Promise.all([fileStamp(path), fileStamp(`${path}-wal`)]);
  // SQLite readers can change SHM lock metadata. Only the database and WAL contain source writes.
  return {
    sourceVersion: digest(JSON.stringify([path, databaseStamp, walStamp, artifactVersion])),
    artifactVersion
  };
}

function scoringSourceStamp(): Promise<SourceStamp> {
  if (!sourceStampRequest) {
    // Coalesce simultaneous API requests without delaying source invalidation.
    const request = readScoringSourceStamp().finally(() => {
      if (sourceStampRequest === request) sourceStampRequest = undefined;
    });
    sourceStampRequest = request;
  }
  return sourceStampRequest;
}

/** Cheap local source stamp; remote data is revalidated at most every fifteen seconds. */
export async function getScoringSourceVersion(options: { fresh?: boolean } = {}): Promise<string> {
  const stamp = await (options.fresh ? readScoringSourceStamp() : scoringSourceStamp());
  if (stamp.sourceVersion !== null) return stamp.sourceVersion;
  await loadScoringSnapshot();
  return snapshotCache ? snapshotCache.version : getScoringSourceVersion(options);
}

function refreshArtifactCaches(version: string): void {
  if (artifactCacheVersion === version) return;
  rtlBusStopsCache = undefined;
  residentialDemandPointsCache = undefined;
  artifactCacheVersion = version;
}

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

export async function loadScoringSnapshot(
  options: { includeResidentialDemandPoints?: boolean } = {}
): Promise<ScoringSnapshot> {
  const generation = cacheGeneration;
  const stamp = await scoringSourceStamp();
  const fresh =
    snapshotCache &&
    snapshotCache.artifactVersion === stamp.artifactVersion &&
    (stamp.sourceVersion !== null
      ? snapshotCache.version === stamp.sourceVersion
      : Date.now() - snapshotCache.loadedAt < REMOTE_REFRESH_MS);
  let cache = fresh ? snapshotCache! : undefined;
  if (!cache) {
    let pending = scoringSnapshotRequest;
    if (
      !pending ||
      pending.generation !== generation ||
      pending.sourceVersion !== stamp.sourceVersion ||
      pending.artifactVersion !== stamp.artifactVersion
    ) {
      const request = (async (): Promise<SnapshotCache> => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const before = await scoringSourceStamp();
          refreshArtifactCaches(before.artifactVersion);
          const snapshot = await loadScoringSnapshotUncached();
          // Atoll labels appear in public payloads even though calculators do not consume them.
          const atolls = before.sourceVersion === null ? await db.select().from(Atoll) : undefined;
          // This check must start after loading, rather than join an earlier read.
          const after = await readScoringSourceStamp();
          if (before.sourceVersion !== after.sourceVersion || before.artifactVersion !== after.artifactVersion)
            continue;
          const version = after.sourceVersion ?? digest(JSON.stringify([snapshot, atolls, after.artifactVersion]));
          if (generation === cacheGeneration && snapshotCache?.version === version) {
            snapshotCache.loadedAt = Date.now();
            return snapshotCache;
          }
          const next: SnapshotCache = {
            version,
            artifactVersion: after.artifactVersion,
            loadedAt: Date.now(),
            snapshot
          };
          if (generation === cacheGeneration) snapshotCache = next;
          return next;
        }
        throw new Error('Scoring source data changed while loading. Please retry.');
      })();
      pending = { ...stamp, generation, request };
      scoringSnapshotRequest = pending;
      void request
        .finally(() => {
          if (scoringSnapshotRequest?.request === request) scoringSnapshotRequest = undefined;
        })
        .catch(() => {});
    }
    cache = await pending.request;
  }
  // A manual reset must not let an earlier in-flight read repopulate the active cache.
  if (generation !== cacheGeneration) return loadScoringSnapshot(options);
  if (!options.includeResidentialDemandPoints) return cache.snapshot;
  if (cache.spatialSnapshot) return cache.spatialSnapshot;
  refreshArtifactCaches(cache.artifactVersion);
  const points = residentialDemandPoints();
  const after = await readScoringSourceStamp();
  if (
    after.artifactVersion !== cache.artifactVersion ||
    (after.sourceVersion !== null && after.sourceVersion !== cache.version)
  ) {
    return loadScoringSnapshot(options);
  }
  return (cache.spatialSnapshot = withResidentialDemandPoints(cache.snapshot, points));
}

export function clearScoringSnapshotCache(): void {
  cacheGeneration += 1;
  rtlBusStopsCache = undefined;
  artifactCacheVersion = undefined;
  snapshotCache = undefined;
  scoringSnapshotRequest = undefined;
  sourceStampRequest = undefined;
  residentialDemandPointsCache = undefined;
  islandContexts = new WeakMap();
}

export async function loadIslandContext(islandId: string): Promise<IslandContext | null> {
  const normalizedId = islandId.trim();
  if (!normalizedId) return null;
  const snapshot = await loadScoringSnapshot();
  let contextCache = islandContexts.get(snapshot);
  if (!contextCache) {
    contextCache = { values: new Map(), requests: new Map() };
    islandContexts.set(snapshot, contextCache);
  }
  const { values, requests } = contextCache;
  const cached = values.get(normalizedId);
  if (cached) return cached;
  const pending = requests.get(normalizedId);
  if (pending) return pending;

  const request = db
    .select({ island: Island, atollName: Atoll.name })
    .from(Island)
    .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
    .where(eq(Island.id, normalizedId))
    .limit(1)
    .then((rows) => {
      const context = rows[0] ?? null;
      if (context) values.set(normalizedId, context);
      return context;
    });
  requests.set(normalizedId, request);
  void request.then(
    () => requests.delete(normalizedId),
    () => requests.delete(normalizedId)
  );
  return request;
}
