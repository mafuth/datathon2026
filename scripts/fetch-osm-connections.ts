import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { queryOverpass } from '../src/lib/server/mobility/osm-overpass';

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
type OsmElement = {
  type?: string;
  id?: number;
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, string>;
};
type Payload = { elements?: OsmElement[] };
type Baseline = { islands: Array<{ id: string; latitude: number; longitude: number; geoJson: string }> };

const baselinePath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
const outputPath = resolve(
  process.env.MOBILITY_CONNECTION_OUTPUT_PATH ?? 'data/mobility/normalized/transport-connections.json'
);
const query = `[out:json][timeout:120];(
  way["bridge"="yes"](-1,72,8,74);
  way["bridge"="viaduct"](-1,72,8,74);
  way["man_made"="causeway"](-1,72,8,74);
  way["highway"]["name"~"causeway",i](-1,72,8,74);
);out body geom;`;

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

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
const shapes = baseline.islands.flatMap((island) => {
  const polygons = polygonRings(island.geoJson);
  if (polygons.length === 0) return [];
  const [minX, minY, maxX, maxY] = bounds(polygons);
  return [{ id: island.id, polygons, minX, minY, maxX, maxY }];
});
function islandAt(point: Position): string | null {
  return shapes.find((shape) => pointInIsland(point, shape))?.id ?? null;
}

const result = await queryOverpass<Payload>(query);
const connections = (result.data.elements ?? []).flatMap((element) => {
  if (element.type !== 'way' || typeof element.id !== 'number') return [];
  const coordinates = (element.geometry ?? []).flatMap((point) =>
    typeof point.lon === 'number' && typeof point.lat === 'number' ? ([[point.lon, point.lat]] as Position[]) : []
  );
  if (coordinates.length < 2) return [];
  const islandSequence = coordinates
    .map((point) => islandAt(point))
    .filter((value, index, values): value is string => value !== null && values.indexOf(value) === index);
  if (islandSequence.length < 2) return [];
  const fromIslandId = islandSequence[0];
  const toIslandId = islandSequence[islandSequence.length - 1];
  const tags = element.tags ?? {};
  const connectionType =
    tags.man_made === 'causeway' || tags.bridge === 'causeway' || /causeway/i.test(tags.name ?? '')
      ? 'causeway'
      : 'bridge';
  return [
    {
      id: `osm:way:${element.id}`,
      from_island_id: fromIslandId,
      to_island_id: toIslandId,
      connection_type: connectionType,
      directionality: 'bidirectional',
      sequence: null,
      distance_m: distanceM(coordinates[0], coordinates.at(-1)!),
      geometry: { type: 'LineString', coordinates },
      source: 'OpenStreetMap',
      source_object_id: `osm:way:${element.id}`,
      modeled: false,
      name: tags.name ?? null
    }
  ];
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schema_version: 'normalized-transport-connections-v1',
      source: 'OpenStreetMap',
      generated_at: new Date().toISOString(),
      endpoint: result.endpoint,
      query,
      connections
    },
    null,
    2
  )}\n`
);
console.log(
  JSON.stringify({ output: outputPath, connections: connections.length, endpoint: result.endpoint }, null, 2)
);
