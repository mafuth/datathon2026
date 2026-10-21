import type {
  NewAtoll,
  NewIsland,
  NewJobLocation,
  NewPopulation,
  NewService,
  NewTransportConnection,
  NewTransportRoute
} from '../src/lib/db/models';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  Atoll,
  Island,
  JobLocation,
  Population,
  Service,
  TransportConnection,
  TransportRoute,
  VehicleCount
} from '../src/lib/db/models';
import db from '../src/lib/server/database';

type Position = [number, number];
type Ring = Position[];
type IslandShape = {
  id: string;
  polygons: Ring[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type BaselineArtifact = {
  schema_version: string;
  atolls: NewAtoll[];
  islands: NewIsland[];
  population: NewPopulation[];
  services: NewService[];
  jobLocations?: NewJobLocation[];
  transportRoutes: NewTransportRoute[];
  transportConnections: NewTransportConnection[];
};
type ForeignPopulationArtifact = {
  rows?: Array<{ island_id?: unknown; amount?: unknown }>;
};
type OSMService = {
  id: string;
  service_type: 'health' | 'education' | 'transport';
  subtype: string;
  marine_evidence?: 'port' | 'jetty' | 'breakwater' | 'ferry_stop';
  name: string | null;
  latitude: number;
  longitude: number;
  geometry?: { type: 'Point' | 'LineString'; coordinates: Position | Position[] };
  tags: Record<string, string>;
  source: 'OpenStreetMap';
  source_object_id: string;
  source_url: string;
};
type MarineEvidence = 'baseline' | 'explicit_osm' | 'expanded_osm' | 'inferred_ferry_endpoint' | 'missing';
type OSMRoute = {
  id: string;
  name: string | null;
  route_type: 'ferry';
  geometry: { type: 'LineString'; coordinates: Position[] };
  passenger_eligible: boolean;
  source: 'OpenStreetMap';
  source_object_id: string;
  source_url: string;
  modeled: false;
};
type OSMConnection = {
  id: string;
  from_island_id: string;
  to_island_id: string;
  connection_type: 'bridge' | 'causeway';
  directionality: 'forward' | 'bidirectional';
  sequence: number | null;
  distance_m: number | null;
  geometry: unknown;
  source: 'OpenStreetMap';
  source_object_id: string;
  modeled: false;
};
type OSMServicesArtifact = { services: OSMService[] };
type OSMMarineArtifact = { services: OSMService[]; routes: OSMRoute[] };
type OSMConnectionsArtifact = { connections: OSMConnection[] };
type RtlFerryStop = {
  rtl_stop_name: string;
  official_island_id: string | null;
  reconciliation_status: string;
};
type RtlFerryRoute = {
  route_id: number;
  route_code: string;
  route_name: string;
  stop_names: string[];
};
type RtlFerryArtifact = {
  schema_version: string;
  islands: RtlFerryStop[];
  routes: RtlFerryRoute[];
};

const SEARCH_AREA_MULTIPLIER = 100;
const SEARCH_LINEAR_MULTIPLIER = Math.sqrt(SEARCH_AREA_MULTIPLIER);
const MAX_EXPANDED_SEARCH_DISTANCE_DEGREES = 1.5;
const baselinePath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
const osmServicesPath = resolve(process.env.MOBILITY_OSM_SERVICES_PATH ?? 'data/mobility/normalized/osm-services.json');
const foreignPopulationPath = resolve(
  process.env.MOBILITY_FOREIGN_POPULATION_PATH ?? 'data/mobility/derived/foregner-population-island-insert.json'
);
const osmMarinePath = resolve(process.env.MOBILITY_OSM_MARINE_PATH ?? 'data/mobility/normalized/osm-marine.json');
const osmConnectionsPath = resolve(
  process.env.MOBILITY_OSM_CONNECTIONS_PATH ?? 'data/mobility/normalized/transport-connections.json'
);
const rtlFerryPath = resolve(process.env.MOBILITY_RTL_FERRY_PATH ?? 'data/mobility/transport/rtl-ferry-coverage.json');
const servicePatchAuditPath = resolve(
  process.env.MOBILITY_SERVICE_PATCH_AUDIT_PATH ?? 'data/mobility/derived/osm-service-patch.json'
);
const marineCoveragePath = resolve(
  process.env.MOBILITY_MARINE_COVERAGE_PATH ?? 'data/mobility/derived/osm-marine-coverage.json'
);
const requireMarineCoverage = process.env.MOBILITY_REQUIRE_INHABITED_MARINE === 'true';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function polygonRings(geoJson: string): Ring[][] {
  const geometry = JSON.parse(geoJson) as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates.filter(Array.isArray).map((ring) => ring.filter(position))];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) =>
      Array.isArray(polygon) ? [polygon.filter(Array.isArray).map((ring) => ring.filter(position))] : []
    );
  }
  return [];
}

function bounds(polygons: Ring[][]): [number, number, number, number] {
  const points = polygons.flat(2);
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1]))
  ];
}

function pointInRing(point: Position, ring: Ring): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    const crosses = current[1] > point[1] !== prior[1] > point[1];
    if (
      crosses &&
      point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInIsland(point: Position, shape: IslandShape): boolean {
  if (point[0] < shape.minX || point[0] > shape.maxX || point[1] < shape.minY || point[1] > shape.maxY) return false;
  return shape.polygons.some((rings) => {
    const [outer, ...holes] = rings;
    return Boolean(outer && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
  });
}

function distanceToBoundsSquared(point: Position, shape: IslandShape): number {
  const deltaX = point[0] < shape.minX ? shape.minX - point[0] : point[0] > shape.maxX ? point[0] - shape.maxX : 0;
  const deltaY = point[1] < shape.minY ? shape.minY - point[1] : point[1] > shape.maxY ? point[1] - shape.maxY : 0;
  return deltaX ** 2 + deltaY ** 2;
}

function expandedSearchDistance(maxDistanceDegrees: number, distanceSquared: number): number | null {
  let searchDistance = maxDistanceDegrees * SEARCH_LINEAR_MULTIPLIER;
  while (searchDistance <= MAX_EXPANDED_SEARCH_DISTANCE_DEGREES) {
    if (distanceSquared <= searchDistance ** 2) return searchDistance;
    searchDistance *= 2;
  }
  return null;
}

function islandAt(point: Position, shapes: IslandShape[], maxDistanceDegrees: number): string | null {
  const exact = shapes.find((shape) => pointInIsland(point, shape));
  if (exact) return exact.id;
  if (maxDistanceDegrees <= 0) return null;

  const nearest = shapes
    .map((shape) => ({ shape, distance: distanceToBoundsSquared(point, shape) }))
    .sort((first, second) => first.distance - second.distance)[0];
  if (!nearest) return null;

  // Start with a 100x search area, then keep widening the envelope for inaccurate polygons.
  return expandedSearchDistance(maxDistanceDegrees, nearest.distance) === null ? null : nearest.shape.id;
}

function distanceSquared(first: Position, second: Position): number {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2;
}

function distanceM(first: Position, second: Position): number {
  const radius = 6_371_000;
  const latitude = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = latitude(second[1] - first[1]);
  const deltaLongitude = latitude(second[0] - first[0]);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude(first[1])) * Math.cos(latitude(second[1])) * Math.sin(deltaLongitude / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function normalizeName(value: string | null): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? '';
}

function routeCoordinates(route: OSMRoute): Position[] {
  return route.geometry.coordinates.filter(position);
}

function routeIslandSequence(route: OSMRoute, shapes: IslandShape[]): Array<{ islandId: string; point: Position }> {
  const exact: Array<{ islandId: string; point: Position }> = [];
  for (const point of routeCoordinates(route)) {
    const islandId = islandAt(point, shapes, 0);
    if (islandId && exact.at(-1)?.islandId !== islandId) exact.push({ islandId, point });
  }
  if (exact.length >= 2) return exact;

  const endpoints = routeCoordinates(route).filter((point) => point.length === 2);
  const fallback: Array<{ islandId: string; point: Position }> = [];
  for (const point of [endpoints[0], endpoints.at(-1)]) {
    if (!point) continue;
    const islandId = islandAt(point, shapes, 0.03);
    if (islandId && fallback.at(-1)?.islandId !== islandId) fallback.push({ islandId, point });
  }
  return fallback;
}

function serviceRowFromOSM(record: OSMService, islandId: string | null): NewService {
  return {
    id: record.id,
    islandId,
    serviceType: record.service_type,
    subtype: record.subtype,
    name: record.name,
    latitude: record.latitude,
    longitude: record.longitude
  };
}

function servicePoints(record: OSMService): Position[] {
  const geometry = record.geometry?.coordinates;
  const points =
    Array.isArray(geometry) && geometry.length > 0 && Array.isArray(geometry[0])
      ? (geometry as Position[])
      : [geometry as Position];
  return [...points, [record.longitude, record.latitude]].filter(position);
}

function expandedMarineDistance(record: OSMService, shape: IslandShape, maxDistanceDegrees: number): number | null {
  const distanceSquared = Math.min(
    ...servicePoints(record).map((point) => distanceToBoundsSquared(point, shape)),
    Number.POSITIVE_INFINITY
  );
  return expandedSearchDistance(maxDistanceDegrees, distanceSquared) === null ? null : Math.sqrt(distanceSquared);
}

function serviceIslandId(record: OSMService, shapes: IslandShape[], maxDistanceDegrees: number): string | null {
  const points = servicePoints(record);
  return (
    points.map((point) => islandAt(point, shapes, 0)).find((islandId): islandId is string => islandId !== null) ??
    points
      .map((point) => islandAt(point, shapes, maxDistanceDegrees))
      .find((islandId): islandId is string => islandId !== null) ??
    null
  );
}

function insertCoverageService(services: NewService[], route: OSMRoute, islandId: string, point: Position): NewService {
  const service: NewService = {
    id: `osm:inferred:ferry-endpoint:${route.id}:${islandId}`,
    islandId,
    serviceType: 'transport',
    subtype: 'jetty',
    name: route.name ? `${route.name} ferry endpoint` : 'OSM ferry route endpoint',
    latitude: point[1],
    longitude: point[0]
  };
  services.push(service);
  return service;
}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await insert(rows.slice(offset, offset + 250));
  }
}

const baseline = readJson<BaselineArtifact>(baselinePath);
if (!baseline.schema_version.startsWith('current-db-mobility-baseline-')) {
  throw new Error(`Unsupported mobility baseline: ${baseline.schema_version}`);
}
const osmServices = readJson<OSMServicesArtifact>(osmServicesPath).services;
if (!existsSync(foreignPopulationPath)) {
  throw new Error(`Missing foreign-population artifact: ${foreignPopulationPath}`);
}
const foreignPopulationRows = (readJson<ForeignPopulationArtifact>(foreignPopulationPath).rows ?? []).flatMap((row) => {
  const islandId = typeof row.island_id === 'string' ? row.island_id : null;
  const amount = typeof row.amount === 'number' ? row.amount : null;
  return islandId && amount !== null && Number.isInteger(amount) && amount >= 0
    ? [{ islandId, ageCategory: 'foregner', amount } satisfies NewPopulation]
    : [];
});
const osmMarine = readJson<OSMMarineArtifact>(osmMarinePath);
const osmConnections = readJson<OSMConnectionsArtifact>(osmConnectionsPath).connections;
const rtlFerry = readJson<RtlFerryArtifact>(rtlFerryPath);
if (!rtlFerry.schema_version.startsWith('rtl_ferry_coverage.')) {
  throw new Error(`Unsupported RTL ferry artifact: ${rtlFerry.schema_version}`);
}

const islandShapes: IslandShape[] = baseline.islands.flatMap((island) => {
  const polygons = polygonRings(island.geoJson);
  if (polygons.length === 0) return [];
  const [minX, minY, maxX, maxY] = bounds(polygons);
  return [{ id: island.id, polygons, minX, minY, maxX, maxY }];
});
const inhabitedIslandIds = new Set(
  baseline.islands.filter((island) => island.islandType === 'inhabited').map((island) => island.id)
);
const population = [
  ...baseline.population.filter((record) => record.ageCategory !== 'foregner'),
  ...foreignPopulationRows
];
const jobLocations = baseline.jobLocations ?? [];
const services: NewService[] = baseline.services.map((service) => ({ ...service }));
const baselineServiceById = new Map(baseline.services.map((service) => [service.id, service] as const));
const patchedServiceIds = new Set<string>();
const osmEvidenceServiceIds = new Set<string>();
const patchDetails: Array<{ serviceId: string; osmId: string; fields: string[] }> = [];
const addedServiceIds: string[] = [];
const unmappedOsmServices: Array<{ id: string; serviceType: string; subtype: string; name: string | null }> = [];

for (const record of osmServices) {
  const point: Position = [record.longitude, record.latitude];
  const mappingDistance = record.service_type === 'transport' ? 0.03 : 0.01;
  const mappedIslandId = serviceIslandId(record, islandShapes, mappingDistance);
  const exactMatch = baselineServiceById.get(record.id);
  const name = normalizeName(record.name);
  const fuzzyMatch =
    exactMatch ??
    (name
      ? baseline.services.find((service) => {
          if (service.serviceType !== record.service_type || service.subtype !== record.subtype) return false;
          if (normalizeName(service.name) !== name) return false;
          if (mappedIslandId && service.islandId === mappedIslandId) return true;
          if (service.latitude === null || service.longitude === null) return true;
          return distanceSquared([service.longitude, service.latitude], point) <= 0.01 ** 2;
        })
      : undefined);

  if (fuzzyMatch) {
    const current = services.find((service) => service.id === fuzzyMatch.id);
    if (!current) continue;
    osmEvidenceServiceIds.add(current.id);
    const fields: string[] = [];
    if (current.islandId === null && mappedIslandId) {
      current.islandId = mappedIslandId;
      fields.push('islandId');
    }
    if (current.latitude === null && current.longitude === null) {
      current.latitude = record.latitude;
      current.longitude = record.longitude;
      fields.push('coordinates');
    }
    if (current.name === null && record.name) {
      current.name = record.name;
      fields.push('name');
    }
    if (fields.length > 0) {
      patchedServiceIds.add(current.id);
      patchDetails.push({ serviceId: current.id, osmId: record.id, fields });
    }
    continue;
  }

  if (!mappedIslandId) {
    unmappedOsmServices.push({
      id: record.id,
      serviceType: record.service_type,
      subtype: record.subtype,
      name: record.name
    });
    continue;
  }

  const hasMarineCoverage =
    record.service_type === 'transport' &&
    services.some(
      (service) =>
        service.islandId === mappedIslandId &&
        service.serviceType === 'transport' &&
        ['port', 'jetty'].includes(service.subtype)
    );
  const hasSameCoverage = services.some(
    (service) =>
      service.islandId === mappedIslandId &&
      service.serviceType === record.service_type &&
      (record.service_type === 'transport' ? hasMarineCoverage : service.subtype === record.subtype)
  );
  if (hasSameCoverage) continue;

  const added = serviceRowFromOSM(record, mappedIslandId);
  services.push(added);
  osmEvidenceServiceIds.add(added.id);
  addedServiceIds.push(added.id);
}

const marineCoverage = new Map<
  string,
  {
    evidence: MarineEvidence;
    serviceId: string | null;
    routeId: string | null;
  }
>();
for (const islandId of inhabitedIslandIds) {
  const explicit = services.find(
    (service) =>
      service.islandId === islandId &&
      service.serviceType === 'transport' &&
      ['port', 'jetty'].includes(service.subtype)
  );
  if (explicit) {
    marineCoverage.set(islandId, {
      evidence: osmEvidenceServiceIds.has(explicit.id) ? 'explicit_osm' : 'baseline',
      serviceId: explicit.id,
      routeId: null
    });
    continue;
  }

  const routeEndpoint = osmMarine.routes
    .filter((route) => route.passenger_eligible)
    .flatMap((route) => {
      const sequence = routeIslandSequence(route, islandShapes);
      return sequence.filter((entry) => entry.islandId === islandId).map((entry) => ({ route, ...entry }));
    })[0];
  if (routeEndpoint) {
    const inferred = insertCoverageService(services, routeEndpoint.route, islandId, routeEndpoint.point);
    marineCoverage.set(islandId, {
      evidence: 'inferred_ferry_endpoint',
      serviceId: inferred.id,
      routeId: routeEndpoint.route.id
    });
  } else {
    const shape = islandShapes.find((candidate) => candidate.id === islandId);
    const expandedMatch = shape
      ? osmMarine.services
          .map((record) => ({ record, distance: expandedMarineDistance(record, shape, 0.03) }))
          .filter((entry): entry is { record: OSMService; distance: number } => entry.distance !== null)
          .sort((first, second) => first.distance - second.distance)[0]
      : undefined;
    if (expandedMatch) {
      const inferred = serviceRowFromOSM(expandedMatch.record, islandId);
      inferred.id = `osm:inferred:expanded:${expandedMatch.record.id}:${islandId}`;
      inferred.name = expandedMatch.record.name
        ? `${expandedMatch.record.name} (expanded OSM search)`
        : 'Expanded OSM marine search result';
      services.push(inferred);
      osmEvidenceServiceIds.add(inferred.id);
      marineCoverage.set(islandId, {
        evidence: 'expanded_osm',
        serviceId: inferred.id,
        routeId: null
      });
    } else {
      marineCoverage.set(islandId, { evidence: 'missing', serviceId: null, routeId: null });
    }
  }
}

mkdirSync(dirname(servicePatchAuditPath), { recursive: true });
writeFileSync(
  servicePatchAuditPath,
  `${JSON.stringify(
    {
      schema_version: 'osm-service-patch-v1',
      generated_at: new Date().toISOString(),
      search_policy: {
        area_multiplier: SEARCH_AREA_MULTIPLIER,
        linear_multiplier: SEARCH_LINEAR_MULTIPLIER,
        max_distance_degrees: MAX_EXPANDED_SEARCH_DISTANCE_DEGREES
      },
      baseline: baselinePath,
      osm_services: osmServicesPath,
      patched_existing: patchDetails,
      added_missing: addedServiceIds,
      unmapped_osm_services: unmappedOsmServices
    },
    null,
    2
  )}\n`
);
const coverageRows = baseline.islands
  .filter((island) => inhabitedIslandIds.has(island.id))
  .map((island) => ({ islandId: island.id, islandName: island.name, ...marineCoverage.get(island.id) }));
mkdirSync(dirname(marineCoveragePath), { recursive: true });
writeFileSync(
  marineCoveragePath,
  `${JSON.stringify(
    {
      schema_version: 'osm-marine-coverage-v1',
      generated_at: new Date().toISOString(),
      search_policy: {
        area_multiplier: SEARCH_AREA_MULTIPLIER,
        linear_multiplier: SEARCH_LINEAR_MULTIPLIER,
        max_distance_degrees: MAX_EXPANDED_SEARCH_DISTANCE_DEGREES
      },
      baseline: baselinePath,
      marine_artifact: osmMarinePath,
      summary: {
        inhabited_islands: coverageRows.length,
        baseline: coverageRows.filter((row) => row.evidence === 'baseline').length,
        explicit_osm: coverageRows.filter((row) => row.evidence === 'explicit_osm').length,
        expanded_osm: coverageRows.filter((row) => row.evidence === 'expanded_osm').length,
        inferred_ferry_endpoint: coverageRows.filter((row) => row.evidence === 'inferred_ferry_endpoint').length,
        missing: coverageRows.filter((row) => row.evidence === 'missing').length
      },
      islands: coverageRows
    },
    null,
    2
  )}\n`
);

const missingMarineCoverage = coverageRows.filter((row) => row.evidence === 'missing');
if (missingMarineCoverage.length > 0 && requireMarineCoverage) {
  throw new Error(
    `OSM marine coverage is missing for inhabited islands: ${missingMarineCoverage
      .map((row) => `${row.islandId} (${row.islandName})`)
      .join(', ')}`
  );
}

const transportRoutes = [...baseline.transportRoutes];
const routeIds = new Set(transportRoutes.map((route) => route.id));
const rtlFerryRouteIds = new Set<string>();
for (const route of osmMarine.routes) {
  if (!route.passenger_eligible || routeIds.has(route.id)) continue;
  transportRoutes.push({
    id: route.id,
    name: route.name,
    routeType: 'ferry',
    geoJson: JSON.stringify(route.geometry),
    source: route.source,
    sourceObjectId: route.source_object_id,
    modeled: route.modeled
  } as NewTransportRoute);
  routeIds.add(route.id);
}
for (const route of rtlFerry.routes) {
  const id = `rtl:ferry:${route.route_code}`;
  rtlFerryRouteIds.add(id);
  if (routeIds.has(id)) continue;
  transportRoutes.push({
    id,
    name: route.route_name,
    routeType: 'ferry',
    geoJson: JSON.stringify({ type: 'LineString', coordinates: [] }),
    source: 'RTL',
    sourceObjectId: String(route.route_id),
    modeled: false
  } as NewTransportRoute);
  routeIds.add(id);
}

const transportConnections = [...baseline.transportConnections];
const connectionIds = new Set(transportConnections.map((connection) => connection.id));
const rtlFerryStopByName = new Map(rtlFerry.islands.map((stop) => [stop.rtl_stop_name, stop]));
const baselineIslandIds = new Set(baseline.islands.map((island) => island.id));
let rtlFerrySkippedSegments = 0;
for (const connection of osmConnections) {
  if (connectionIds.has(connection.id)) continue;
  transportConnections.push({
    id: connection.id,
    routeId: null,
    fromIslandId: connection.from_island_id,
    toIslandId: connection.to_island_id,
    connectionType: connection.connection_type,
    directionality: connection.directionality,
    sequence: connection.sequence,
    distanceM: connection.distance_m,
    geoJson: JSON.stringify(connection.geometry),
    source: connection.source,
    sourceObjectId: connection.source_object_id,
    modeled: connection.modeled,
    scoreEligible: true
  });
  connectionIds.add(connection.id);
}
for (const route of osmMarine.routes) {
  if (!route.passenger_eligible || !routeIds.has(route.id)) continue;
  const sequence = routeIslandSequence(route, islandShapes);
  for (let index = 1; index < sequence.length; index += 1) {
    const from = sequence[index - 1];
    const to = sequence[index];
    if (from.islandId === to.islandId) continue;
    const id = `osm:ferry:${route.id}:${index}:${from.islandId}:${to.islandId}`;
    if (connectionIds.has(id)) continue;
    transportConnections.push({
      id,
      routeId: route.id,
      fromIslandId: from.islandId,
      toIslandId: to.islandId,
      connectionType: 'ferry',
      directionality: 'bidirectional',
      sequence: index,
      distanceM: distanceM(from.point, to.point),
      geoJson: JSON.stringify(route.geometry),
      source: route.source,
      sourceObjectId: route.source_object_id,
      modeled: route.modeled,
      scoreEligible: true
    });
    connectionIds.add(id);
  }
}
for (const route of rtlFerry.routes) {
  const routeId = `rtl:ferry:${route.route_code}`;
  if (!rtlFerryRouteIds.has(routeId)) continue;
  const islandSequence = route.stop_names.map((stopName) => {
    const stop = rtlFerryStopByName.get(stopName);
    return stop?.reconciliation_status === 'matched_exact_atoll_name' ? stop.official_island_id : null;
  });
  for (let index = 1; index < islandSequence.length; index += 1) {
    const fromIslandId = islandSequence[index - 1];
    const toIslandId = islandSequence[index];
    if (!fromIslandId || !toIslandId || fromIslandId === toIslandId) {
      rtlFerrySkippedSegments += 1;
      continue;
    }
    if (!baselineIslandIds.has(fromIslandId) || !baselineIslandIds.has(toIslandId)) {
      rtlFerrySkippedSegments += 1;
      continue;
    }
    const id = `rtl:ferry:${route.route_code}:${index}:${fromIslandId}:${toIslandId}`;
    if (connectionIds.has(id)) continue;
    transportConnections.push({
      id,
      routeId,
      fromIslandId,
      toIslandId,
      connectionType: 'ferry',
      directionality: 'bidirectional',
      sequence: index,
      distanceM: null,
      geoJson: null,
      source: 'RTL',
      sourceObjectId: `${route.route_id}:${route.route_code}:${index}`,
      modeled: false,
      scoreEligible: false
    });
    connectionIds.add(id);
  }
}

await db.transaction(async (tx) => {
  await tx.delete(JobLocation);
  await tx.delete(VehicleCount);
  await tx.delete(TransportConnection);
  await tx.delete(TransportRoute);
  await tx.delete(Service);
  await tx.delete(Population);
  await tx.delete(Island);
  await tx.delete(Atoll);

  await insertChunks(baseline.atolls, async (chunk) => tx.insert(Atoll).values(chunk));
  await insertChunks(baseline.islands, async (chunk) => tx.insert(Island).values(chunk));
  await insertChunks(population, async (chunk) => tx.insert(Population).values(chunk));
  await insertChunks(services, async (chunk) => tx.insert(Service).values(chunk));
  await insertChunks(jobLocations, async (chunk) => tx.insert(JobLocation).values(chunk));
  await insertChunks(transportRoutes, async (chunk) => tx.insert(TransportRoute).values(chunk));
  await insertChunks(transportConnections, async (chunk) => tx.insert(TransportConnection).values(chunk));
});

console.log(
  JSON.stringify(
    {
      baseline: baselinePath,
      inserted: {
        atolls: baseline.atolls.length,
        islands: baseline.islands.length,
        population: population.length,
        services: services.length,
        jobLocations: jobLocations.length,
        transportRoutes: transportRoutes.length,
        transportConnections: transportConnections.length,
        rtlFerryRoutes: rtlFerryRouteIds.size,
        rtlFerryConnections: transportConnections.filter((connection) => connection.source === 'RTL').length,
        rtlFerrySkippedSegments
      },
      servicePatch: {
        patchedExisting: patchedServiceIds.size,
        addedMissing: addedServiceIds.length,
        unmappedOsmServices: unmappedOsmServices.length,
        foreignPopulationRows: foreignPopulationRows.length
      },
      marineCoverage: {
        inhabitedIslands: coverageRows.length,
        baseline: coverageRows.filter((row) => row.evidence === 'baseline').length,
        explicitOsm: coverageRows.filter((row) => row.evidence === 'explicit_osm').length,
        expandedOsm: coverageRows.filter((row) => row.evidence === 'expanded_osm').length,
        inferredFerryEndpoint: coverageRows.filter((row) => row.evidence === 'inferred_ferry_endpoint').length,
        missing: missingMarineCoverage.length,
        missingAllowed: !requireMarineCoverage
      }
    },
    null,
    2
  )
);
