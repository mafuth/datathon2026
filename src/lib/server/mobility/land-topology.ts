import type { TransportConnection } from '../../db/models/transport-connection';

type Position = [number, number];
type Polygon = Position[][];
export type LandIsland = { id: string; geoJson: string };
export type LandGeometrySource = {
  id: string;
  source: string;
  sourceObjectId: string;
  connectionType: 'bridge' | 'causeway' | 'land_link';
  directionality: 'forward' | 'bidirectional';
  geometry: { type: string; coordinates: unknown };
  scoreEligible?: boolean;
};

export const LAND_INFRASTRUCTURE_TYPES = new Set(['bridge', 'causeway', 'land_link']);

function position(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function polygon(value: unknown): Polygon | null {
  if (
    !Array.isArray(value) ||
    !value.length ||
    !value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(position))
  )
    return null;
  return value as Polygon;
}

function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function distance(a: Position, b: Position): number {
  const radians = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * radians) / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(((b[0] - a[0]) * radians) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Split only continuous, source-recorded road lines. Polygon intersections also
// retain tiny intermediate parcels between sparsely sampled road vertices.
// Neither centroid distance nor nearest-island matching establishes a link.
export function createLandTopologyResolver(islands: LandIsland[]) {
  const shapes = islands.flatMap((island) => {
    const geometry = JSON.parse(island.geoJson) as { type: string; coordinates: unknown };
    const values =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)
          ? geometry.coordinates
          : [];
    const polygons = values.map(polygon).filter((value): value is Polygon => value !== null);
    const points = polygons.flat(2);
    if (!points.length) return [];
    return [
      {
        id: island.id,
        polygons,
        minX: Math.min(...points.map((p) => p[0])),
        maxX: Math.max(...points.map((p) => p[0])),
        minY: Math.min(...points.map((p) => p[1])),
        maxY: Math.max(...points.map((p) => p[1]))
      }
    ];
  });

  return (source: LandGeometrySource): TransportConnection[] => {
    const raw = source.geometry.coordinates;
    const lines =
      source.geometry.type === 'LineString'
        ? [raw]
        : source.geometry.type === 'MultiLineString' && Array.isArray(raw)
          ? raw
          : [];
    const result: TransportConnection[] = [];
    for (const [part, line] of lines.entries()) {
      if (!Array.isArray(line) || line.length < 2 || !line.every(position)) continue;
      const points = line as Position[];
      const extent = points.reduce(
        (box, point) => [
          Math.min(box[0], point[0]),
          Math.min(box[1], point[1]),
          Math.max(box[2], point[0]),
          Math.max(box[3], point[1])
        ],
        [Infinity, Infinity, -Infinity, -Infinity]
      );
      const candidates = shapes.filter(
        (shape) =>
          extent[2] >= shape.minX && extent[0] <= shape.maxX && extent[3] >= shape.minY && extent[1] <= shape.maxY
      );
      let previous: string | null = null;
      let path: Position[] = [];
      let leg = 0;
      const visit = (point: Position): void => {
        const owners = candidates.filter(
          (shape) =>
            point[0] >= shape.minX &&
            point[0] <= shape.maxX &&
            point[1] >= shape.minY &&
            point[1] <= shape.maxY &&
            shape.polygons.some(
              ([outer, ...holes]) => inRing(point, outer) && !holes.some((hole) => inRing(point, hole))
            )
        );
        path.push(point);
        // Keep continuity through an overlap with the currently owned parcel,
        // but require an unambiguous arrival before emitting a transfer. An
        // unrelated ambiguous overlap remains a gap, not a guessed island.
        if (owners.length > 1) {
          if (owners.some((owner) => owner.id === previous)) return;
          previous = null;
          path = [];
          return;
        }
        const current = owners[0]?.id;
        if (!current) return;
        if (previous && current !== previous) {
          result.push({
            id: `${source.id}:land:${part}:${leg++}:${previous}:${current}`,
            routeId: null,
            fromIslandId: previous,
            toIslandId: current,
            connectionType: source.connectionType,
            directionality: source.directionality,
            sequence: null,
            distanceM: path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0),
            geoJson: JSON.stringify({ type: 'LineString', coordinates: path }),
            source: source.source,
            sourceObjectId: source.sourceObjectId,
            modeled: false,
            scoreEligible: source.scoreEligible ?? true
          });
        }
        previous = current;
        path = [point];
      };
      visit(points[0]);
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const cuts = new Set([0, 1]);
        for (const shape of candidates) {
          if (
            Math.max(a[0], b[0]) < shape.minX ||
            Math.min(a[0], b[0]) > shape.maxX ||
            Math.max(a[1], b[1]) < shape.minY ||
            Math.min(a[1], b[1]) > shape.maxY
          )
            continue;
          for (const rings of shape.polygons)
            for (const ring of rings)
              for (let j = 1; j < ring.length; j += 1) {
                const c = ring[j - 1];
                const d = ring[j];
                const ex = d[0] - c[0];
                const ey = d[1] - c[1];
                const cross = dx * ey - dy * ex;
                if (Math.abs(cross) < 1e-18) continue;
                const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / cross;
                const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / cross;
                if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.add(t);
              }
        }
        const ordered = [...cuts].sort((x, y) => x - y);
        for (let j = 1; j < ordered.length; j += 1) {
          const t = (ordered[j - 1] + ordered[j]) / 2;
          visit([a[0] + dx * t, a[1] + dy * t]);
        }
        visit(b);
      }
    }
    return result;
  };
}

export function mergeLandConnections(
  existing: TransportConnection[],
  additions: TransportConnection[],
  islandIds: Set<string>
): TransportConnection[] {
  const result: TransportConnection[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const link of [...existing, ...additions]) {
    if (!islandIds.has(link.fromIslandId) || !islandIds.has(link.toIslandId)) continue;
    if (!LAND_INFRASTRUCTURE_TYPES.has(link.connectionType)) {
      result.push(link);
      ids.add(link.id);
      continue;
    }
    if (link.fromIslandId === link.toIslandId) continue;
    const endpoints = [link.fromIslandId, link.toIslandId];
    if (link.directionality === 'bidirectional') endpoints.sort();
    const key = JSON.stringify([link.source, link.sourceObjectId, endpoints, link.directionality, link.connectionType]);
    if (keys.has(key) || ids.has(link.id)) continue;
    keys.add(key);
    ids.add(link.id);
    result.push(link);
  }
  return result;
}

// Directed reachability, not a synthetic clique: intermediate uninhabited
// parcels stay in the path and one-way records are never reversed.
export function landReachableIslands(connections: TransportConnection[], origin: string): Set<string> {
  const adjacency = new Map<string, Set<string>>();
  for (const link of connections) {
    if (!link.scoreEligible || !LAND_INFRASTRUCTURE_TYPES.has(link.connectionType)) continue;
    const add = (a: string, b: string) => {
      const ids = adjacency.get(a) ?? new Set<string>();
      ids.add(b);
      adjacency.set(a, ids);
    };
    add(link.fromIslandId, link.toIslandId);
    if (link.directionality === 'bidirectional') add(link.toIslandId, link.fromIslandId);
  }
  const seen = new Set([origin]);
  const pending = [origin];
  for (let i = 0; i < pending.length; i += 1)
    for (const id of adjacency.get(pending[i]) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(id);
    }
  seen.delete(origin);
  return seen;
}
