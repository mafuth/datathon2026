import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Position = [number, number];
type Ring = Position[];
type IslandShape = { id: string; polygons: Ring[][]; minX: number; minY: number; maxX: number; maxY: number };

const sourceRoot = resolve(process.env.MOBILITY_NORMALIZED_DATA_ROOT ?? 'old/data/mobility/normalized');
const outputRoot = resolve(process.env.MOBILITY_CONNECTION_OUTPUT_ROOT ?? 'data/mobility/normalized');
const outputPath = resolve(outputRoot, 'transport-connections.json');
const islands = JSON.parse(readFileSync(resolve(sourceRoot, 'islands.geojson'), 'utf8')) as {
  features: Array<{ id?: unknown; geometry?: { type?: unknown; coordinates?: unknown } }>;
};

function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function polygonRings(geometry: { type?: unknown; coordinates?: unknown } | undefined): Ring[][] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
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

function islandAt(point: Position, shapes: IslandShape[]): string | null {
  return shapes.find((shape) => pointInIsland(point, shape))?.id ?? null;
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

const shapes: IslandShape[] = islands.features.flatMap((feature) => {
  const id = typeof feature.id === 'string' ? feature.id : null;
  const polygons = polygonRings(feature.geometry);
  if (!id || polygons.length === 0) return [];
  const [minX, minY, maxX, maxY] = bounds(polygons);
  return [{ id, polygons, minX, minY, maxX, maxY }];
});

const query = `[out:json][timeout:60];(way["bridge"="yes"](-1,72,8,74);way["bridge"="viaduct"](-1,72,8,74);way["man_made"="causeway"](-1,72,8,74););out tags geom;`;
const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
let payload: {
  elements?: Array<{ id?: unknown; geometry?: Array<{ lat?: unknown; lon?: unknown }>; tags?: Record<string, string> }>;
} | null = null;
let lastError = 'No Overpass endpoint was attempted';
for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'MobilitySandboxMV/1.0 OSM connection import'
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) {
      lastError = `${endpoint} returned HTTP ${response.status}`;
      continue;
    }
    payload = (await response.json()) as {
      elements?: Array<{
        id?: unknown;
        geometry?: Array<{ lat?: unknown; lon?: unknown }>;
        tags?: Record<string, string>;
      }>;
    };
    break;
  } catch (error) {
    lastError = `${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}
if (!payload) throw new Error(`All Overpass endpoints failed: ${lastError}`);
const overpassPayload = payload as {
  elements?: Array<{ id?: unknown; geometry?: Array<{ lat?: unknown; lon?: unknown }>; tags?: Record<string, string> }>;
};

const connections = (overpassPayload.elements ?? []).flatMap((element) => {
  const id = typeof element.id === 'number' ? element.id : null;
  const coordinates = (element.geometry ?? []).flatMap((point) =>
    typeof point.lon === 'number' && typeof point.lat === 'number' ? ([[point.lon, point.lat]] as Position[]) : []
  );
  if (id === null || coordinates.length < 2) return [];
  const islandSequence = coordinates
    .map((point) => islandAt(point, shapes))
    .filter((value, index, values): value is string => value !== null && values.indexOf(value) === index);
  if (islandSequence.length < 2) return [];
  const tags = element.tags ?? {};
  const type = tags.man_made === 'causeway' || tags.bridge === 'causeway' ? 'causeway' : 'bridge';
  const fromIslandId = islandSequence[0];
  const toIslandId = islandSequence[islandSequence.length - 1];
  if (fromIslandId === toIslandId) return [];
  return [
    {
      id: `osm:way:${id}`,
      from_island_id: fromIslandId,
      to_island_id: toIslandId,
      connection_type: type,
      directionality: 'bidirectional',
      sequence: null,
      distance_m: distanceM(coordinates[0], coordinates[coordinates.length - 1]),
      geometry: { type: 'LineString', coordinates },
      source: 'OpenStreetMap',
      source_object_id: `osm:way:${id}`,
      modeled: false,
      name: tags.name ?? null
    }
  ];
});

const modeledAirportConnections = existsSync(outputPath)
  ? (
      (JSON.parse(readFileSync(outputPath, 'utf8')) as { connections?: Array<{ connection_type?: unknown }> })
        .connections ?? []
    ).filter((connection) => connection.connection_type === 'air')
  : [];

mkdirSync(outputRoot, { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      schema_version: 'normalized-transport-connections-v1',
      source: 'OpenStreetMap',
      query,
      connections: [...connections, ...modeledAirportConnections]
    },
    null,
    2
  )
);
console.log(
  JSON.stringify({ output: outputPath, connections: connections.length + modeledAirportConnections.length }, null, 2)
);
