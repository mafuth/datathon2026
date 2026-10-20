import type {
  NewAtoll,
  NewIsland,
  NewPopulation,
  NewService,
  NewTransportConnection,
  NewTransportRoute
} from '../src/lib/db/models';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';

import { Atoll, Island, Population, Service, TransportConnection, TransportRoute } from '../src/lib/db/models';
import db from '../src/lib/server/database';
import { preserveExistingServiceIslandMappings } from '../src/lib/server/mobility/preserve-service-island-mappings';
import { confirmedServiceMappings } from '../src/lib/server/mobility/reviewed-service-overlay';

type JsonRecord = Record<string, unknown>;
type GeoJsonFeature = {
  id?: unknown;
  geometry?: JsonRecord | null;
  properties?: JsonRecord;
};

const atollCodeByName: Record<string, string> = {
  'Alifu Alifu': 'AA',
  'Alifu Dhaalu': 'Adh',
  Baa: 'B',
  Dhaalu: 'Dh',
  Faafu: 'F',
  'Gaafu Alifu': 'GA',
  'Gaafu Dhaalu': 'GDh',
  Gnaviyani: 'Gn',
  'Haa Alifu': 'HA',
  'Haa Dhaalu': 'HDh',
  Kaafu: 'K',
  Laamu: 'L',
  Lhaviyani: 'Lh',
  MLE: 'MLE',
  Meemu: 'M',
  Noonu: 'N',
  Raa: 'R',
  Seenu: 'S',
  Shaviyani: 'Sh',
  Thaa: 'Th',
  Vaavu: 'V'
};

const healthCategories = new Set(['hospital', 'health_center', 'clinic']);
const transportCategories = new Set([
  'aerodrome',
  'bus_station',
  'bus_stop',
  'ferry_terminal',
  'helipad',
  'parking',
  'pier',
  'public_transport',
  'taxi',
  'terminal'
]);

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function stringValue(record: JsonRecord | undefined, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function islandType(category: string | null): string {
  switch (category) {
    case 'Residential Island':
      return 'inhabited';
    case 'Tourism Island':
      return 'resort';
    case 'Uninhabited Island':
      return 'uninhabited';
    case 'Industrial Island':
      return 'industrial';
    case 'Institutional Island':
      return 'institutional';
    default:
      return 'unknown';
  }
}

function pointCoordinates(geometry: unknown): { latitude: number; longitude: number } | null {
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return null;
  const record = geometry as JsonRecord;
  if (record.type !== 'Point' || !Array.isArray(record.coordinates) || record.coordinates.length !== 2) return null;
  const longitude = record.coordinates[0];
  const latitude = record.coordinates[1];
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new Error(`Invalid service coordinates: ${longitude}, ${latitude}`);
  }
  return { latitude, longitude };
}

function educationSubtype(attributes: JsonRecord | undefined): string {
  const stage = stringValue(attributes, 'education_stage');
  const institutionType = stringValue(attributes, 'institution_type');
  if (stage === 'pre_primary' || institutionType === 'preschool') return 'preschool';
  if (stage === 'higher_secondary' || institutionType === 'higher_secondary_school') return 'high_school';
  return 'school';
}

function transportSubtype(category: string, tags: JsonRecord | undefined): string {
  if (category === 'aerodrome') return 'airport';
  if (category === 'bus_station') return 'bus_station';
  if (category === 'bus_stop') return 'bus_stop';
  if (category === 'ferry_terminal') return 'port';
  if (category === 'pier') return 'jetty';
  if (category === 'public_transport') {
    if (tags?.amenity === 'ferry_terminal') return 'port';
    if (tags?.ferry === 'yes') return 'port';
    if (tags?.highway === 'bus_stop') return 'bus_stop';
  }
  return category;
}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 250) {
    await insert(rows.slice(offset, offset + 250));
  }
}

const normalizedRoot = resolve(process.env.MOBILITY_NORMALIZED_DATA_ROOT ?? 'old/data/mobility/normalized');
const graphsRoot = resolve(process.env.MOBILITY_GRAPHS_ROOT ?? 'old/data/mobility/graphs');
const islandsArtifact = readJson<{ features: GeoJsonFeature[] }>(resolve(normalizedRoot, 'islands.geojson'));
const populationArtifact = readJson<JsonRecord[]>(resolve(normalizedRoot, 'population.json'));
const reconciliationArtifact = readJson<{ records: JsonRecord[] }>(
  resolve('old/data/mobility/derived/population-reconciliation.json')
);
const populationFallbackArtifact = readJson<JsonRecord[]>(
  resolve('old/data/mobility/derived/population-fallbacks.json')
);
const populationIndicatorArtifact = readJson<{ records: JsonRecord[] }>(
  resolve('old/data/mobility/derived/island-indicators.json')
);
const facilitiesArtifact = readJson<JsonRecord[]>(resolve(normalizedRoot, 'facilities.json'));
const reviewArtifact = readJson<{
  entries: Array<JsonRecord & { service_id?: string; island_id?: string; disposition?: string }>;
}>(resolve('data/mobility/derived/service-island-mapping-review.json'));
const reviewedOverrideArtifact = readJson<{
  entries: Array<JsonRecord & { service_id?: string; island_id?: string; disposition?: string }>;
}>(resolve('data/mobility/derived/service-island-reviewed-overrides.json'));
const reviewedServiceMappings = confirmedServiceMappings(
  reviewArtifact.entries.filter(
    (entry): entry is JsonRecord & { service_id: string; island_id: string; disposition: string } =>
      typeof entry.service_id === 'string' &&
      typeof entry.island_id === 'string' &&
      typeof entry.disposition === 'string'
  ),
  reviewedOverrideArtifact.entries.filter(
    (entry): entry is JsonRecord & { service_id: string; island_id: string; disposition: string } =>
      typeof entry.service_id === 'string' &&
      typeof entry.island_id === 'string' &&
      typeof entry.disposition === 'string'
  )
);
const transportArtifact = readJson<{ features: JsonRecord[] }>(resolve(normalizedRoot, 'transport.json'));
const ferryRoutesArtifact = readJson<{ routes: JsonRecord[] }>(resolve(graphsRoot, 'ferry-routes.json'));
const busRoutesArtifactPath = resolve(
  process.env.MOBILITY_BUS_ROUTES_PATH ?? 'data/mobility/normalized/bus-routes.json'
);
const rtlBusArtifactPath = resolve(process.env.MOBILITY_RTL_BUS_PATH ?? 'data/mobility/normalized/rtl-bus.json');
const rtlBusArtifact = existsSync(rtlBusArtifactPath)
  ? readJson<{ routes: JsonRecord[]; stops: JsonRecord[] }>(rtlBusArtifactPath)
  : { routes: [], stops: [] };
const busRoutesArtifact =
  rtlBusArtifact.routes.length > 0
    ? rtlBusArtifact
    : existsSync(busRoutesArtifactPath)
      ? readJson<{ routes: JsonRecord[] }>(busRoutesArtifactPath)
      : { routes: [] };
const marineArtifact = readJson<{ nodes: JsonRecord[]; edges: JsonRecord[] }>(resolve(graphsRoot, 'marine.json'));
const connectionArtifactPath = resolve(
  process.env.MOBILITY_CONNECTIONS_PATH ?? 'data/mobility/normalized/transport-connections.json'
);
const connectionArtifact = existsSync(connectionArtifactPath)
  ? readJson<{ connections: JsonRecord[] }>(connectionArtifactPath)
  : existsSync(resolve(normalizedRoot, 'transport-connections.json'))
    ? readJson<{ connections: JsonRecord[] }>(resolve(normalizedRoot, 'transport-connections.json'))
    : { connections: [] };

const atollNames = [
  ...new Set(islandsArtifact.features.map((feature) => stringValue(feature.properties, 'atoll')).filter(Boolean))
] as string[];
const atolls: NewAtoll[] = atollNames.map((name) => {
  const id = atollCodeByName[name];
  if (!id) throw new Error(`No atoll code mapping exists for ${name}`);
  return { id, name };
});

const islands: NewIsland[] = islandsArtifact.features.map((feature) => {
  const properties = feature.properties ?? {};
  const id = typeof feature.id === 'string' ? feature.id : stringValue(properties, 'id');
  const name = stringValue(properties, 'name');
  const atollName = stringValue(properties, 'atoll');
  const centroid = properties.centroid;
  if (!id || !atollName || !Array.isArray(centroid) || centroid.length !== 2) {
    throw new Error(`Island record is missing required identity or centroid data: ${JSON.stringify(feature)}`);
  }
  const longitude = centroid[0];
  const latitude = centroid[1];
  if (typeof longitude !== 'number' || typeof latitude !== 'number') throw new Error(`Invalid centroid for ${id}`);
  if (!feature.geometry) throw new Error(`Island ${id} has no boundary geometry`);
  const areaHa = properties.area_ha;
  if (typeof areaHa !== 'number' || !Number.isFinite(areaHa) || areaHa <= 0) {
    throw new Error(`Invalid land area for island ${id}`);
  }
  return {
    id,
    name: name ?? id,
    islandType: islandType(stringValue(properties, 'category')),
    latitude,
    longitude,
    landAreaKm2: areaHa / 100,
    geoJson: JSON.stringify(feature.geometry),
    atollId: atollCodeByName[atollName]
  };
});

const islandIds = new Set(islands.map((island) => island.id));
const populationTotals = new Map<string, JsonRecord>();
for (const record of populationArtifact) {
  const islandId = stringValue(record, 'island_id');
  const isP5Total = record.source === 'MBS Census 2022 P5' && record.sex === 'both' && record.nationality === 'total';
  const isP3Total = record.source === 'MBS Census 2022 P3' && record.demographic_grain === 'total';
  if (islandId && (isP5Total || isP3Total)) populationTotals.set(islandId, record);
}
for (const record of reconciliationArtifact.records) {
  const islandId = stringValue(record, 'islandId');
  const amount = record.population;
  if (
    islandId &&
    islandIds.has(islandId) &&
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    !populationTotals.has(islandId)
  ) {
    populationTotals.set(islandId, record);
  }
}
for (const record of populationFallbackArtifact) {
  const islandId = stringValue(record, 'islandId');
  const amount = record.population;
  if (
    islandId &&
    islandIds.has(islandId) &&
    typeof amount === 'number' &&
    Number.isInteger(amount) &&
    amount >= 0 &&
    !populationTotals.has(islandId)
  ) {
    populationTotals.set(islandId, record);
  }
}
for (const record of populationArtifact) {
  const islandId = stringValue(record, 'island_id');
  if (islandId && record.source === 'MBS Census 2022 P3' && record.demographic_grain === 'total') {
    populationTotals.set(islandId, record);
  }
}
const populations: NewPopulation[] = [...populationTotals.entries()].map(([islandId, record]) => {
  const amount = record.population;
  if (!islandIds.has(islandId)) throw new Error(`Population record references unknown island ${islandId}`);
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid population amount for ${islandId}`);
  }
  return { islandId, ageCategory: 'total', amount };
});

const indicatorDefinitions = [
  ['childPopulation017', 'child_population_0_17'],
  ['childPopulation014', 'child_population_0_14'],
  ['adolescentPopulation1019', 'adolescent_population_10_19'],
  ['workingAgePopulation1564', 'working_age_population_15_64'],
  ['youthPopulation1524', 'youth_population_15_24'],
  ['youthPopulation1835', 'youth_population_18_35'],
  ['elderlyPopulation65Plus', 'elderly_population_65_plus']
] as const;
const populationIndicatorRows: NewPopulation[] = [];
for (const record of populationIndicatorArtifact.records) {
  const islandId = stringValue(record, 'islandId');
  if (!islandId || !islandIds.has(islandId)) continue;
  const source = stringValue(record, 'sourceReference');
  const sourceUrl = stringValue(record, 'sourceUrl');
  const sourceRowId = stringValue(record, 'sourceRowId');
  const ageDataScope = stringValue(record, 'ageDataScope');
  if (!source || !sourceUrl || !sourceRowId || !ageDataScope) {
    throw new Error(`Population indicator record is missing provenance: ${JSON.stringify(record)}`);
  }
  for (const [field, indicator] of indicatorDefinitions) {
    const values = record[field];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    {
      const value = (values as JsonRecord).both;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) continue;
      populationIndicatorRows.push({
        islandId,
        ageCategory: indicator,
        amount: value
      });
    }
  }
}
populations.push(...populationIndicatorRows);

const services: NewService[] = [];

for (const record of facilitiesArtifact) {
  const category = stringValue(record, 'category');
  if (!category || (!healthCategories.has(category) && category !== 'school' && category !== 'airport')) continue;
  const attributes = record.attributes as JsonRecord | undefined;
  const recordId = stringValue(record, 'id');
  const islandId = reviewedIslandId(record, recordId);
  if (islandId && !islandIds.has(islandId)) throw new Error(`Facility references unknown island ${islandId}`);
  const coordinates = pointCoordinates(record.geometry);
  services.push({
    id:
      stringValue(record, 'id') ??
      (() => {
        throw new Error('Facility is missing an ID');
      })(),
    islandId,
    serviceType: healthCategories.has(category) ? 'health' : category === 'school' ? 'education' : 'transport',
    subtype: category === 'school' ? educationSubtype(attributes) : category === 'airport' ? 'airport' : category,
    name: stringValue(record, 'name') ?? stringValue(attributes, 'name'),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null
  });
}

for (const record of transportArtifact.features) {
  const category = stringValue(record, 'category');
  if (!category || !transportCategories.has(category)) continue;
  if (category === 'bus_stop' && rtlBusArtifact.stops.length > 0) continue;
  const islandId = reviewedIslandId(record, stringValue(record, 'id'));
  if (islandId && !islandIds.has(islandId)) throw new Error(`Transport record references unknown island ${islandId}`);
  const coordinates = pointCoordinates(record.geometry);
  services.push({
    id:
      stringValue(record, 'id') ??
      (() => {
        throw new Error('Transport record is missing an ID');
      })(),
    islandId,
    serviceType: 'transport',
    subtype: transportSubtype(category, record.tags as JsonRecord | undefined),
    name: stringValue(record, 'name'),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null
  });
}

for (const stop of rtlBusArtifact.stops) {
  const id = stringValue(stop, 'id');
  const name = stringValue(stop, 'name');
  const latitude = stop.latitude;
  const longitude = stop.longitude;
  if (!id || typeof latitude !== 'number' || typeof longitude !== 'number') continue;
  services.push({
    id,
    islandId: reviewedIslandId(stop, id),
    serviceType: 'transport',
    subtype: 'bus_stop',
    name,
    latitude,
    longitude
  });
}

const serviceIds = new Set<string>();
for (const service of services) {
  if (serviceIds.has(service.id)) throw new Error(`Duplicate service ID ${service.id}`);
  serviceIds.add(service.id);
}

const existingServiceIslandMappings = new Map(
  (await db.select({ id: Service.id, islandId: Service.islandId }).from(Service))
    .filter((service): service is { id: string; islandId: string } => service.islandId !== null)
    .map((service) => [service.id, service.islandId] as const)
);
const servicesWithPreservedMappings = preserveExistingServiceIslandMappings(services, existingServiceIslandMappings);

function reviewedIslandId(record: JsonRecord, id: string | null): string | null {
  const sourceIslandId = stringValue(record, 'island_id');
  if (sourceIslandId !== null) return sourceIslandId;
  return id ? (reviewedServiceMappings.get(id) ?? null) : null;
}

const unavailableAgeRecords = populationArtifact.filter((record) => record.age_group !== null).length;

function lineGeoJson(value: unknown): string | null {
  if (Array.isArray(value)) {
    if (value.length < 2 || value.some((point) => !Array.isArray(point) || point.length < 2)) return null;
    return JSON.stringify({ type: 'LineString', coordinates: value });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const geometry = value as JsonRecord;
  if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  return JSON.stringify(geometry);
}

const transportRoutes: NewTransportRoute[] = ferryRoutesArtifact.routes.map((route) => {
  const id = stringValue(route, 'id');
  const geoJson = lineGeoJson(route.geometry);
  if (!id || !geoJson) throw new Error(`Ferry route ${id ?? 'unknown'} has invalid GeoJSON`);
  return {
    id,
    name: stringValue(route, 'name'),
    routeType: 'ferry',
    geoJson,
    source: stringValue(route, 'source') ?? 'OpenStreetMap',
    sourceObjectId: stringValue(route, 'sourceRelationId') ?? id,
    modeled: route.modeled !== false
  };
});

for (const route of busRoutesArtifact.routes) {
  const id = stringValue(route, 'id');
  const geoJson = lineGeoJson(route.geometry);
  if (!id || !geoJson) throw new Error(`Bus route ${id ?? 'unknown'} has invalid GeoJSON`);
  transportRoutes.push({
    id,
    name: stringValue(route, 'name'),
    routeType: 'bus',
    geoJson,
    source: stringValue(route, 'source') ?? 'OpenStreetMap',
    sourceObjectId: stringValue(route, 'source_object_id') ?? id,
    modeled: route.modeled !== false
  });
}

const busConnections: NewTransportConnection[] = [];
if (rtlBusArtifact.routes.length > 0) {
  const stopIslandById = new Map(
    rtlBusArtifact.stops
      .map((stop) => [stringValue(stop, 'id'), stringValue(stop, 'island_id')] as const)
      .filter((entry): entry is readonly [string, string] => entry[0] !== null && entry[1] !== null)
  );
  for (const route of rtlBusArtifact.routes) {
    const routeId = stringValue(route, 'id');
    const stopIds = Array.isArray(route.stop_ids)
      ? route.stop_ids.filter((id): id is string => typeof id === 'string')
      : [];
    if (!routeId || stopIds.length < 2) continue;
    const islandSequence = stopIds.map((stopId) => stopIslandById.get(`rtl:bus-stop:${stopId}`) ?? null);
    for (let index = 1; index < islandSequence.length; index += 1) {
      const fromIslandId = islandSequence[index - 1];
      const toIslandId = islandSequence[index];
      if (!fromIslandId || !toIslandId) continue;
      busConnections.push({
        id: `bus:${routeId}:${index}`,
        routeId,
        fromIslandId,
        toIslandId,
        connectionType: 'bus',
        directionality: 'forward',
        sequence: index,
        distanceM: null,
        geoJson: null,
        source: 'RTL',
        sourceObjectId: stringValue(route, 'code') ?? routeId,
        modeled: false
      });
    }
  }
}

const routeIds = new Set(transportRoutes.map((route) => route.id));
const marineNodes = new Map(
  marineArtifact.nodes
    .map((node) => [stringValue(node, 'id'), stringValue(node, 'island_id')] as const)
    .filter((entry): entry is readonly [string, string] => entry[0] !== null && entry[1] !== null)
);
const ferryConnectionByPair = new Map<string, NewTransportConnection>();
for (const edge of marineArtifact.edges) {
  const fromNodeId = stringValue(edge, 'from_id');
  const toNodeId = stringValue(edge, 'to_id');
  const fromIslandId = fromNodeId ? marineNodes.get(fromNodeId) : null;
  const toIslandId = toNodeId ? marineNodes.get(toNodeId) : null;
  const sourceObjectId = stringValue(edge, 'source_relation_id');
  if (!fromIslandId || !toIslandId || fromIslandId === toIslandId || !sourceObjectId) continue;
  const key = `${sourceObjectId}|${fromIslandId}|${toIslandId}`;
  const distanceM = typeof edge.distance_m === 'number' ? edge.distance_m : null;
  const existing = ferryConnectionByPair.get(key);
  if (existing && (existing.distanceM ?? Number.MAX_SAFE_INTEGER) <= (distanceM ?? Number.MAX_SAFE_INTEGER)) continue;
  ferryConnectionByPair.set(key, {
    id: `ferry:${sourceObjectId}:${fromIslandId}:${toIslandId}`,
    routeId: routeIds.has(sourceObjectId) ? sourceObjectId : null,
    fromIslandId,
    toIslandId,
    connectionType: 'ferry',
    directionality: 'forward',
    sequence: null,
    distanceM,
    geoJson: lineGeoJson(edge.geometry),
    source: stringValue(edge, 'source') ?? 'OpenStreetMap',
    sourceObjectId: stringValue(edge, 'id') ?? sourceObjectId,
    modeled: true
  });
}

const landConnections: NewTransportConnection[] = connectionArtifact.connections.map((connection) => {
  const id = stringValue(connection, 'id');
  const fromIslandId = stringValue(connection, 'from_island_id');
  const toIslandId = stringValue(connection, 'to_island_id');
  const connectionType = stringValue(connection, 'connection_type');
  const geoJson = lineGeoJson(connection.geometry);
  if (!id || !fromIslandId || !toIslandId || !connectionType || !geoJson) {
    throw new Error(`Transport connection is missing required data: ${JSON.stringify(connection)}`);
  }
  if (!islandIds.has(fromIslandId) || !islandIds.has(toIslandId)) {
    throw new Error(`Transport connection ${id} references an unknown island`);
  }
  return {
    id,
    routeId: null,
    fromIslandId,
    toIslandId,
    connectionType,
    directionality: stringValue(connection, 'directionality') ?? 'bidirectional',
    sequence: typeof connection.sequence === 'number' ? connection.sequence : null,
    distanceM: typeof connection.distance_m === 'number' ? connection.distance_m : null,
    geoJson,
    source: stringValue(connection, 'source') ?? 'OpenStreetMap',
    sourceObjectId: stringValue(connection, 'source_object_id') ?? id,
    modeled: connection.modeled !== false
  };
});
const transportConnections = [...ferryConnectionByPair.values(), ...landConnections];

await db.transaction(async (tx) => {
  await tx
    .delete(Population)
    .where(inArray(Population.ageCategory, ['resident_population', 'median_age', 'population_density']));

  await insertChunks(atolls, async (chunk) => {
    await tx
      .insert(Atoll)
      .values(chunk)
      .onConflictDoUpdate({ target: Atoll.id, set: { name: sql`excluded.name` } });
  });

  await insertChunks(islands, async (chunk) => {
    await tx
      .insert(Island)
      .values(chunk)
      .onConflictDoUpdate({
        target: Island.id,
        set: {
          name: sql`excluded.name`,
          islandType: sql`excluded.island_type`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          landAreaKm2: sql`excluded.land_area_km2`,
          geoJson: sql`excluded.geo_json`,
          atollId: sql`excluded.atoll_id`
        }
      });
  });

  await insertChunks(populations, async (chunk) => {
    await tx
      .insert(Population)
      .values(chunk)
      .onConflictDoUpdate({
        target: [Population.islandId, Population.ageCategory],
        set: { amount: sql`excluded.amount` }
      });
  });

  if (rtlBusArtifact.stops.length > 0) {
    await tx.delete(Service).where(eq(Service.subtype, 'bus_stop'));
  }
  if (rtlBusArtifact.routes.length > 0) {
    await tx.delete(TransportConnection).where(eq(TransportConnection.connectionType, 'bus'));
  }

  await insertChunks(servicesWithPreservedMappings, async (chunk) => {
    await tx
      .insert(Service)
      .values(chunk)
      .onConflictDoUpdate({
        target: Service.id,
        set: {
          islandId: sql`excluded.island_id`,
          serviceType: sql`excluded.service_type`,
          subtype: sql`excluded.subtype`,
          name: sql`excluded.name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`
        }
      });
  });

  await insertChunks(transportRoutes, async (chunk) => {
    await tx
      .insert(TransportRoute)
      .values(chunk)
      .onConflictDoUpdate({
        target: TransportRoute.id,
        set: {
          name: sql`excluded.name`,
          routeType: sql`excluded.route_type`,
          geoJson: sql`excluded.geo_json`,
          source: sql`excluded.source`,
          sourceObjectId: sql`excluded.source_object_id`,
          modeled: sql`excluded.modeled`
        }
      });
  });

  await insertChunks(transportConnections, async (chunk) => {
    await tx
      .insert(TransportConnection)
      .values(chunk)
      .onConflictDoUpdate({
        target: TransportConnection.id,
        set: {
          routeId: sql`excluded.route_id`,
          fromIslandId: sql`excluded.from_island_id`,
          toIslandId: sql`excluded.to_island_id`,
          connectionType: sql`excluded.connection_type`,
          directionality: sql`excluded.directionality`,
          sequence: sql`excluded.sequence`,
          distanceM: sql`excluded.distance_m`,
          geoJson: sql`excluded.geo_json`,
          source: sql`excluded.source`,
          sourceObjectId: sql`excluded.source_object_id`,
          modeled: sql`excluded.modeled`
        }
      });
  });

  await insertChunks(busConnections, async (chunk) => {
    await tx
      .insert(TransportConnection)
      .values(chunk)
      .onConflictDoUpdate({
        target: TransportConnection.id,
        set: {
          routeId: sql`excluded.route_id`,
          fromIslandId: sql`excluded.from_island_id`,
          toIslandId: sql`excluded.to_island_id`,
          connectionType: sql`excluded.connection_type`,
          directionality: sql`excluded.directionality`,
          sequence: sql`excluded.sequence`,
          source: sql`excluded.source`,
          sourceObjectId: sql`excluded.source_object_id`,
          modeled: sql`excluded.modeled`
        }
      });
  });
});

console.log(
  JSON.stringify(
    {
      normalizedRoot,
      inserted: {
        atolls: atolls.length,
        islands: islands.length,
        populations: populations.length,
        populationIndicatorRows: populationIndicatorRows.length,
        services: services.length,
        confirmedReviewedServiceMappings: reviewedServiceMappings.size,
        transportRoutes: transportRoutes.length,
        transportConnections: transportConnections.length,
        busConnections: busConnections.length,
        landConnections: landConnections.length
      },
      population: {
        ageBreakdownAvailable: false,
        ageBandIndicatorsAvailable: populationIndicatorRows.length > 0,
        fallbackTotalRows: populations.filter((record) => record.ageCategory === 'total').length,
        unavailableAgeRecords: unavailableAgeRecords,
        loadedAgeCategories: [...new Set(populations.map((record) => record.ageCategory))]
      }
    },
    null,
    2
  )
);
