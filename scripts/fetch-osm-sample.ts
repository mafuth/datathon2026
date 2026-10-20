import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { fetchOsmMap } from '../src/lib/server/mobility/osm-overpass';

type Position = [number, number];
type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string }>;
};
type Baseline = {
  islands: Array<{ id: string; name: string; geoJson: string }>;
};

const islandId =
  process.argv.find((argument) => argument.startsWith('--island='))?.slice('--island='.length) ??
  process.env.MOBILITY_SAMPLE_ISLAND_ID ??
  'island:692';
const baselinePath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
const outputPath = resolve(
  process.env.MOBILITY_OSM_SAMPLE_PATH ??
    `data/mobility/normalized/osm-sample-${islandId.replace(/[^a-z0-9]+/gi, '-')}.json`
);

function positions(value: unknown, result: Position[] = []): Position[] {
  if (Array.isArray(value)) {
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      result.push([value[0], value[1]]);
      return result;
    }
    for (const child of value) positions(child, result);
  }
  return result;
}

function bounds(geoJson: string): [number, number, number, number] {
  const geometry = JSON.parse(geoJson) as { coordinates?: unknown };
  const points = positions(geometry.coordinates);
  if (points.length === 0) throw new Error(`Island ${islandId} has no polygon coordinates`);
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1]))
  ];
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([\w:]+)="([^"]*)"/g;
  for (const match of value.matchAll(pattern)) result[match[1]] = decodeXml(match[2]);
  return result;
}

function tagsFor(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /<tag\b([^>]*)\/>/g;
  for (const match of value.matchAll(pattern)) {
    const tag = attributes(match[1]);
    if (tag.k && tag.v !== undefined) result[tag.k] = tag.v;
  }
  return result;
}

function parseMap(xml: string): OsmElement[] {
  const nodes = new Map<number, { lat: number; lon: number }>();
  const elements: OsmElement[] = [];
  const nodePattern = /<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g;
  for (const match of xml.matchAll(nodePattern)) {
    const attrs = attributes(match[1]);
    const id = Number(attrs.id);
    const lat = Number(attrs.lat);
    const lon = Number(attrs.lon);
    if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const point = { lat, lon };
    nodes.set(id, point);
    const tags = tagsFor(match[2] ?? '');
    elements.push({ type: 'node', id, lat, lon, ...(Object.keys(tags).length > 0 ? { tags } : {}) });
  }

  const wayPattern = /<way\b([^>]*)>([\s\S]*?)<\/way>/g;
  for (const match of xml.matchAll(wayPattern)) {
    const attrs = attributes(match[1]);
    const id = Number(attrs.id);
    if (!Number.isInteger(id)) continue;
    const body = match[2];
    const refs = [...body.matchAll(/<nd\b([^>]*)\/>/g)]
      .map((nd) => Number(attributes(nd[1]).ref))
      .filter((ref) => Number.isInteger(ref));
    const geometry = refs.flatMap((ref) => (nodes.has(ref) ? [nodes.get(ref)!] : []));
    const tags = tagsFor(body);
    const center = geometry.length
      ? {
          lat: geometry.reduce((sum, point) => sum + point.lat, 0) / geometry.length,
          lon: geometry.reduce((sum, point) => sum + point.lon, 0) / geometry.length
        }
      : undefined;
    elements.push({
      type: 'way',
      id,
      ...(center ? { center } : {}),
      ...(geometry.length > 0 ? { geometry } : {}),
      ...(Object.keys(tags).length > 0 ? { tags } : {})
    });
  }

  const relationPattern = /<relation\b([^>]*)>([\s\S]*?)<\/relation>/g;
  for (const match of xml.matchAll(relationPattern)) {
    const attrs = attributes(match[1]);
    const id = Number(attrs.id);
    if (!Number.isInteger(id)) continue;
    const body = match[2];
    const members = [...body.matchAll(/<member\b([^>]*)\/>/g)].map((member) => {
      const values = attributes(member[1]);
      return { type: values.type ?? '', ref: Number(values.ref), role: values.role ?? '' };
    });
    const tags = tagsFor(body);
    elements.push({ type: 'relation', id, members, ...(Object.keys(tags).length > 0 ? { tags } : {}) });
  }
  return elements;
}

function tagSummary(elements: OsmElement[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    for (const [key, value] of Object.entries(element.tags ?? {})) {
      const summaryKey = `${key}=${value}`;
      counts.set(summaryKey, (counts.get(summaryKey) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => right[1] - left[1]));
}

function marineCandidates(elements: OsmElement[]): OsmElement[] {
  return elements.filter((element) => {
    const tags = element.tags ?? {};
    const seamarkType = tags['seamark:type']?.toLowerCase() ?? '';
    return (
      ['ferry_terminal', 'marina', 'boat_rental'].includes(tags.amenity?.toLowerCase() ?? '') ||
      tags.ferry?.toLowerCase() === 'yes' ||
      tags.harbour?.toLowerCase() === 'yes' ||
      tags.landuse?.toLowerCase() === 'harbour' ||
      ['marina', 'slipway'].includes(tags.leisure?.toLowerCase() ?? '') ||
      ['boatyard', 'dock'].includes(tags.waterway?.toLowerCase() ?? '') ||
      ['pier', 'jetty', 'slipway', 'breakwater', 'dock'].includes(tags.man_made?.toLowerCase() ?? '') ||
      tags.water?.toLowerCase() === 'harbour' ||
      tags.pier?.toLowerCase() === 'yes' ||
      tags['seamark:harbour:category'] !== undefined ||
      /^(harbour|small_craft_harbour|pier|jetty)$/.test(seamarkType) ||
      (['platform', 'stop_position'].includes(tags.public_transport?.toLowerCase() ?? '') &&
        tags.ferry?.toLowerCase() === 'yes') ||
      tags['scuba_diving:entry:boat']?.toLowerCase() === 'yes' ||
      tags.route?.toLowerCase() === 'ferry' ||
      /ferry|jetty|pier|harbour|harbor|port|marina|dock|slipway/i.test(tags.name ?? '')
    );
  });
}

function serviceCandidates(elements: OsmElement[]): OsmElement[] {
  return elements.filter((element) => {
    const tags = element.tags ?? {};
    return Boolean(
      tags.amenity ||
      tags.healthcare ||
      tags.education ||
      tags.school ||
      tags.university ||
      tags.college ||
      tags.kindergarten ||
      /^(hospital|school|kindergarten|college|university)$/i.test(tags.building ?? '')
    );
  });
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
const island = baseline.islands.find((record) => record.id === islandId);
if (!island) throw new Error(`Baseline island not found: ${islandId}`);
const [minX, minY, maxX, maxY] = bounds(island.geoJson);
const padding = 0.002;
const bbox: [number, number, number, number] = [minX - padding, minY - padding, maxX + padding, maxY + padding];
const result = await fetchOsmMap(bbox);
const elements = parseMap(result.xml);
const named = elements
  .filter((element) => element.tags?.name || element.tags?.['name:en'])
  .map((element) => ({ type: element.type, id: element.id, tags: element.tags }));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schema_version: 'osm-island-sample-v1',
      generated_at: new Date().toISOString(),
      island: { id: island.id, name: island.name },
      bbox,
      source: 'OpenStreetMap',
      endpoint: result.url,
      summary: {
        total_elements: elements.length,
        nodes: elements.filter((element) => element.type === 'node').length,
        ways: elements.filter((element) => element.type === 'way').length,
        relations: elements.filter((element) => element.type === 'relation').length,
        named_elements: named.length,
        marine_candidates: marineCandidates(elements).length,
        service_candidates: serviceCandidates(elements).length,
        tag_counts: tagSummary(elements)
      },
      named_elements: named,
      marine_candidates: marineCandidates(elements),
      service_candidates: serviceCandidates(elements),
      elements
    },
    null,
    2
  )}\n`
);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      island: `${island.id} (${island.name})`,
      endpoint: result.url,
      elements: elements.length,
      marineCandidates: marineCandidates(elements).length,
      serviceCandidates: serviceCandidates(elements).length
    },
    null,
    2
  )
);
