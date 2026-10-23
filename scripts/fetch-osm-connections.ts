import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createLandTopologyResolver } from '../src/lib/server/mobility/land-topology';
import { queryOverpass } from '../src/lib/server/mobility/osm-overpass';

type OsmElement = {
  type?: string;
  id?: number;
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, string>;
};
type Baseline = { islands: Array<{ id: string; geoJson: string }> };
const baselinePath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
const outputPath = resolve(
  process.env.MOBILITY_CONNECTION_OUTPUT_PATH ?? 'data/mobility/normalized/transport-connections.json'
);
// Ordinary highways also cross reclaimed land and causeways without a bridge
// tag. Fetch all usable road classes nationally, not named-island exceptions.
const query = `[out:json][timeout:180];(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](-1,72,8,74);
  way["bridge"]["bridge"!="no"](-1,72,8,74);
  way["man_made"="causeway"](-1,72,8,74);
);out body geom;`;
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
const resolveLand = createLandTopologyResolver(baseline.islands);
const result = await queryOverpass<{ elements?: OsmElement[] }>(query);
const connections = (result.data.elements ?? []).flatMap((element) => {
  if (element.type !== 'way' || typeof element.id !== 'number') return [];
  const tags = element.tags ?? {};
  if (
    tags.area === 'yes' ||
    ['construction', 'proposed', 'abandoned', 'razed'].includes(tags.highway) ||
    ['construction', 'proposed', 'abandoned', 'razed'].includes(tags.bridge)
  )
    return [];
  // Missing vertices must not be joined into an invented continuous road.
  if (
    !element.geometry?.every(
      (p) => typeof p.lon === 'number' && Number.isFinite(p.lon) && typeof p.lat === 'number' && Number.isFinite(p.lat)
    )
  )
    return [];
  const coordinates = element.geometry.map((p) => [p.lon!, p.lat!]);
  if (tags.oneway === '-1') coordinates.reverse();
  const connectionType =
    tags.man_made === 'causeway' || tags.bridge === 'causeway' || /causeway/i.test(tags.name ?? '')
      ? 'causeway'
      : tags.bridge && tags.bridge !== 'no'
        ? 'bridge'
        : 'land_link';
  return resolveLand({
    id: `osm:way:${element.id}`,
    source: 'OpenStreetMap',
    sourceObjectId: `osm:way:${element.id}`,
    connectionType,
    directionality: ['yes', '1', 'true', '-1'].includes(tags.oneway) ? 'forward' : 'bidirectional',
    geometry: { type: 'LineString', coordinates },
    scoreEligible: !['no', 'private'].includes(tags.access)
  }).map((link) => ({
    id: link.id,
    from_island_id: link.fromIslandId,
    to_island_id: link.toIslandId,
    connection_type: link.connectionType,
    directionality: link.directionality,
    sequence: null,
    distance_m: link.distanceM,
    geometry: JSON.parse(link.geoJson!),
    source: link.source,
    source_object_id: link.sourceObjectId,
    modeled: false,
    score_eligible: link.scoreEligible,
    name: tags['name:en'] ?? tags.name ?? null
  }));
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
