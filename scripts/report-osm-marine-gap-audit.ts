import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Audit = {
  islands: Array<{
    island: { id: string; name: string };
    summary: { marine_candidates: number; tag_counts: Record<string, number> };
    marine_candidates: Array<{
      type: string;
      id: number;
      tags?: Record<string, string>;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      geometry?: Array<{ lat: number; lon: number }>;
    }>;
    elements: Array<{
      type: string;
      id: number;
      tags?: Record<string, string>;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      geometry?: Array<{ lat: number; lon: number }>;
    }>;
  }>;
};
type Position = [number, number];
type Ring = Position[];
type Baseline = {
  islands: Array<{ id: string; geoJson: string }>;
  services: Array<{
    id: string;
    islandId: string | null;
    serviceType: string;
    subtype: string;
    name: string | null;
  }>;
};

const auditPath = resolve(process.env.MOBILITY_OSM_GAP_AUDIT_PATH ?? 'data/mobility/derived/osm-marine-gap-audit.json');
const audit = JSON.parse(readFileSync(auditPath, 'utf8')) as Audit;
const baseline = JSON.parse(
  readFileSync(
    resolve(process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json'),
    'utf8'
  )
) as Baseline;
const relevant = /^(amenity|ferry|leisure|man_made|public_transport|scuba_diving:entry:boat|seamark|water|waterway)$/;

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

function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number';
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

function pointInIsland(point: Position, geoJson: string): boolean {
  return polygonRings(geoJson).some(([outer, ...holes]) =>
    Boolean(outer && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)))
  );
}

function candidatePoints(candidate: Audit['islands'][number]['marine_candidates'][number]): Position[] {
  if (typeof candidate.lon === 'number' && typeof candidate.lat === 'number') return [[candidate.lon, candidate.lat]];
  if (candidate.center) return [[candidate.center.lon, candidate.center.lat]];
  return candidate.geometry?.map((point) => [point.lon, point.lat]) ?? [];
}

function namedMarineElements(sample: Audit['islands'][number], geoJson: string | undefined) {
  return sample.elements
    .filter((element) => /ferry|jetty|pier|harbour|harbor|port|marina|dock|slipway/i.test(element.tags?.name ?? ''))
    .map((element) => ({
      type: element.type,
      id: element.id,
      name: element.tags?.name,
      tags: element.tags,
      onTargetIsland: Boolean(geoJson && candidatePoints(element).some((point) => pointInIsland(point, geoJson)))
    }));
}

for (const sample of audit.islands) {
  const baselineIsland = baseline.islands.find((island) => island.id === sample.island.id);
  const baselineTransport = baseline.services.filter(
    (service) => service.islandId === sample.island.id && service.serviceType === 'transport'
  );
  const tags = Object.entries(sample.summary.tag_counts).filter(([key]) => relevant.test(key.split('=')[0]));
  console.log(
    JSON.stringify({
      island: sample.island,
      baselineTransport,
      namedMarineElements: namedMarineElements(sample, baselineIsland?.geoJson),
      marineCandidates: sample.summary.marine_candidates,
      candidateTags: sample.marine_candidates.map((candidate) => ({
        type: candidate.type,
        id: candidate.id,
        tags: candidate.tags,
        onTargetIsland: Boolean(
          baselineIsland && candidatePoints(candidate).some((point) => pointInIsland(point, baselineIsland.geoJson))
        )
      })),
      relevantTagCounts: Object.fromEntries(tags)
    })
  );
}
