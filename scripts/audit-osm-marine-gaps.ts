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
type Coverage = {
  islands: Array<{ islandId: string; islandName: string; evidence: string }>;
};

const baselinePath = resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json');
const coveragePath = resolve(
  process.env.MOBILITY_MARINE_COVERAGE_PATH ?? 'data/mobility/derived/osm-marine-coverage.json'
);
const outputPath = resolve(
  process.env.MOBILITY_OSM_GAP_AUDIT_PATH ?? 'data/mobility/derived/osm-marine-gap-audit.json'
);
const initialPadding = 0.002 * Math.sqrt(100);
const maximumPadding = 0.2;

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
  if (points.length === 0) throw new Error('Island has no polygon coordinates');
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

async function fetchExpandedMap(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): Promise<{
  bbox: [number, number, number, number];
  padding: number;
  passes: number;
  result: { url: string };
  elements: OsmElement[];
  marine: OsmElement[];
}> {
  async function fetchArea(
    bbox: [number, number, number, number]
  ): Promise<{ urls: string[]; elements: OsmElement[] }> {
    const [areaMinX, areaMinY, areaMaxX, areaMaxY] = bbox;
    if ((areaMaxX - areaMinX) * (areaMaxY - areaMinY) <= 0.2) {
      const result = await fetchOsmMap(bbox);
      return { urls: [result.url], elements: parseMap(result.xml) };
    }
    const midpointX = (areaMinX + areaMaxX) / 2;
    const midpointY = (areaMinY + areaMaxY) / 2;
    const tiles: Array<[number, number, number, number]> = [
      [areaMinX, areaMinY, midpointX, midpointY],
      [midpointX, areaMinY, areaMaxX, midpointY],
      [areaMinX, midpointY, midpointX, areaMaxY],
      [midpointX, midpointY, areaMaxX, areaMaxY]
    ];
    const results: Array<{ urls: string[]; elements: OsmElement[] }> = [];
    for (const tile of tiles) results.push(await fetchArea(tile));
    const elements = new Map<string, OsmElement>();
    for (const result of results) {
      for (const element of result.elements) elements.set(`${element.type}:${element.id}`, element);
    }
    return { urls: results.flatMap((result) => result.urls), elements: [...elements.values()] };
  }

  let padding = initialPadding;
  let passes = 0;
  while (true) {
    const bbox: [number, number, number, number] = [minX - padding, minY - padding, maxX + padding, maxY + padding];
    const area = await fetchArea(bbox);
    const result = { url: area.urls.join(',') };
    const elements = area.elements;
    const marine = marineCandidates(elements);
    passes += 1;
    if (marine.length > 0 || padding >= maximumPadding) {
      return { bbox, padding, passes, result, elements, marine };
    }
    padding *= 2;
  }
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8')) as Coverage;
const missing = coverage.islands.filter((island) => island.evidence === 'missing');
const samples: Array<Record<string, unknown>> = [];

for (const gap of missing) {
  const island = baseline.islands.find((record) => record.id === gap.islandId);
  if (!island) throw new Error(`Baseline island not found: ${gap.islandId}`);
  const [minX, minY, maxX, maxY] = bounds(island.geoJson);
  const sample = await fetchExpandedMap(minX, minY, maxX, maxY);
  samples.push({
    island: { id: island.id, name: island.name },
    bbox: sample.bbox,
    search_padding: sample.padding,
    search_passes: sample.passes,
    endpoint: sample.result.url,
    summary: {
      total_elements: sample.elements.length,
      nodes: sample.elements.filter((element) => element.type === 'node').length,
      ways: sample.elements.filter((element) => element.type === 'way').length,
      relations: sample.elements.filter((element) => element.type === 'relation').length,
      marine_candidates: sample.marine.length,
      tag_counts: tagSummary(sample.elements)
    },
    marine_candidates: sample.marine,
    elements: sample.elements
  });
  console.log(
    JSON.stringify({
      island: `${island.id} (${island.name})`,
      elements: sample.elements.length,
      marineCandidates: sample.marine.length,
      searchPadding: sample.padding,
      searchPasses: sample.passes
    })
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schema_version: 'osm-marine-gap-audit-v1',
      generated_at: new Date().toISOString(),
      source: 'OpenStreetMap',
      baseline: baselinePath,
      coverage: coveragePath,
      islands: samples
    },
    null,
    2
  )}\n`
);

console.log(JSON.stringify({ output: outputPath, islands: samples.length }, null, 2));
