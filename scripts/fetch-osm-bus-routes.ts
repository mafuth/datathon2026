import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { queryOverpass } from '../src/lib/server/mobility/osm-overpass';

type Position = [number, number];
type OsmElement = {
  id?: unknown;
  type?: unknown;
  geometry?: Array<{ lat?: unknown; lon?: unknown }>;
  members?: Array<{ type?: unknown; ref?: unknown; role?: unknown }>;
  tags?: Record<string, string>;
};

const outputRoot = resolve(process.env.MOBILITY_ROUTE_OUTPUT_ROOT ?? 'data/mobility/normalized');
const query = '[out:json][timeout:90];relation["type"="route"]["route"="bus"](-1,72,8,74);out body;>;out geom;';
const result = await queryOverpass<{ elements?: OsmElement[] }>(query, 120);
const elements = result.data.elements ?? [];
const ways = new Map<number, Position[]>();
for (const element of elements) {
  if (element.type !== 'way' || typeof element.id !== 'number') continue;
  const geometry = (element.geometry ?? []).flatMap((point) =>
    typeof point.lon === 'number' && typeof point.lat === 'number' ? ([[point.lon, point.lat]] as Position[]) : []
  );
  if (geometry.length >= 2) ways.set(element.id, geometry);
}

const routes = elements.flatMap((relation) => {
  if (relation.type !== 'relation' || typeof relation.id !== 'number') return [];
  const coordinates: Position[] = [];
  for (const member of relation.members ?? []) {
    if (member.type !== 'way' || typeof member.ref !== 'number') continue;
    const geometry = ways.get(member.ref);
    if (!geometry) continue;
    const points = member.role === 'backward' ? [...geometry].reverse() : geometry;
    for (const point of points) {
      const previous = coordinates.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) coordinates.push(point);
    }
  }
  if (coordinates.length < 2) return [];
  const tags = relation.tags ?? {};
  return [
    {
      id: `osm:relation:${relation.id}`,
      name: tags.name ?? tags['name:en'] ?? tags.ref ?? null,
      route_type: 'bus',
      geometry: { type: 'LineString', coordinates },
      source: 'OpenStreetMap',
      source_object_id: `osm:relation:${relation.id}`,
      modeled: false
    }
  ];
});

mkdirSync(outputRoot, { recursive: true });
writeFileSync(
  resolve(outputRoot, 'bus-routes.json'),
  JSON.stringify(
    {
      schema_version: 'normalized-transport-routes-v1',
      source: 'OpenStreetMap',
      generated_at: new Date().toISOString(),
      endpoint: result.endpoint,
      query,
      routes
    },
    null,
    2
  )
);
console.log(
  JSON.stringify(
    { output: resolve(outputRoot, 'bus-routes.json'), routes: routes.length, endpoint: result.endpoint },
    null,
    2
  )
);
