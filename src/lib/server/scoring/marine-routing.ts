import type { ScoringSnapshot } from './types';

export type MarineCoordinate = [number, number];
export type MarineEndpoint = {
  original: MarineCoordinate;
  shoreline: MarineCoordinate;
  snapped: boolean;
  distanceKm: number;
};
export type MarineRoute = {
  coordinates: MarineCoordinate[];
  start: MarineEndpoint;
  end: MarineEndpoint;
};
export type MarineRouter = {
  /** False when any island has missing or unsupported coastline geometry. */
  coastlineComplete: boolean;
  landPolygonCount: number;
  resolveEndpoint(point: MarineCoordinate): MarineEndpoint | null;
  route(start: MarineCoordinate, end: MarineCoordinate): MarineCoordinate[] | null;
  routeDetailed(start: MarineCoordinate, end: MarineCoordinate): MarineRoute | null;
  /** Validates the supplied coordinates themselves, including their endpoints. */
  isWaterPath(coordinates: readonly MarineCoordinate[]): boolean;
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type CoastEdge = { a: MarineCoordinate; b: MarineCoordinate; bounds: Bounds };
type PreparedRing = { points: MarineCoordinate[]; bounds: Bounds; buckets: CoastEdge[][]; bucketHeight: number };
type LandPolygon = {
  id: number;
  rings: MarineCoordinate[][];
  prepared: PreparedRing[];
  edges: BoundsNode<CoastEdge> | null;
  bounds: Bounds;
};
type BoundsNode<T extends { bounds: Bounds }> = {
  bounds: Bounds;
  items?: T[];
  left?: BoundsNode<T>;
  right?: BoundsNode<T>;
};
type PointState = 'outside' | 'boundary' | 'inside';

const EPSILON = 1e-10;
const MAX_NODES = 256;
const MAX_EDGE_CHECKS = 12_000;
const MAX_PASSES = 8;
const MAX_PAIR_CACHE = 2_000;
const MAX_ENDPOINT_CACHE = 4_000;
const MAX_EDGE_CACHE = 40_000;
const routers = new WeakMap<ScoringSnapshot['islands'], MarineRouter>();

function coordinate(value: unknown): value is MarineCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function bounds(points: readonly MarineCoordinate[]): Bounds {
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const [x, y] of points) {
    result.minX = Math.min(result.minX, x);
    result.minY = Math.min(result.minY, y);
    result.maxX = Math.max(result.maxX, x);
    result.maxY = Math.max(result.maxY, y);
  }
  return result;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.minX <= b.maxX + EPSILON && a.maxX + EPSILON >= b.minX && a.minY <= b.maxY + EPSILON && a.maxY + EPSILON >= b.minY
  );
}

function pointBounds(point: MarineCoordinate): Bounds {
  return { minX: point[0], maxX: point[0], minY: point[1], maxY: point[1] };
}

function parseRing(value: unknown): MarineCoordinate[] | null {
  if (!Array.isArray(value) || value.length < 3 || !value.every(coordinate)) return null;
  const ring: MarineCoordinate[] = [];
  for (const point of value) {
    const previous = ring.at(-1);
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) ring.push([point[0], point[1]]);
  }
  if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

function parsePolygons(value: unknown): MarineCoordinate[][][] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    type?: unknown;
    coordinates?: unknown;
    geometry?: unknown;
    features?: unknown;
    geometries?: unknown;
  };
  if (candidate.type === 'Feature') return parsePolygons(candidate.geometry);
  if (candidate.type === 'FeatureCollection' || candidate.type === 'GeometryCollection') {
    const members = candidate.type === 'FeatureCollection' ? candidate.features : candidate.geometries;
    if (!Array.isArray(members) || !members.length) return null;
    const parts = members.map(parsePolygons);
    return parts.every((part) => part !== null) ? parts.flat() : null;
  }
  if (candidate.type === 'MultiPolygon') {
    if (!Array.isArray(candidate.coordinates) || !candidate.coordinates.length) return null;
    const parts = candidate.coordinates.map((part) => parsePolygons({ type: 'Polygon', coordinates: part }));
    return parts.every((part) => part !== null) ? parts.flat() : null;
  }
  if (candidate.type !== 'Polygon' || !Array.isArray(candidate.coordinates) || !candidate.coordinates.length)
    return null;
  const rings = candidate.coordinates.map(parseRing);
  if (rings.some((ring) => ring === null)) return null;
  return [rings as MarineCoordinate[][]];
}

function buildIndex<T extends { bounds: Bounds }>(items: T[]): BoundsNode<T> | null {
  if (!items.length) return null;
  const extent = items.reduce<Bounds>(
    (box, polygon) => ({
      minX: Math.min(box.minX, polygon.bounds.minX),
      minY: Math.min(box.minY, polygon.bounds.minY),
      maxX: Math.max(box.maxX, polygon.bounds.maxX),
      maxY: Math.max(box.maxY, polygon.bounds.maxY)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  if (items.length <= 8) return { bounds: extent, items };
  const xAxis = extent.maxX - extent.minX >= extent.maxY - extent.minY;
  const ordered = [...items].sort((a, b) =>
    xAxis
      ? a.bounds.minX + a.bounds.maxX - (b.bounds.minX + b.bounds.maxX)
      : a.bounds.minY + a.bounds.maxY - (b.bounds.minY + b.bounds.maxY)
  );
  const middle = Math.floor(ordered.length / 2);
  return { bounds: extent, left: buildIndex(ordered.slice(0, middle))!, right: buildIndex(ordered.slice(middle))! };
}

function queryIndex<T extends { bounds: Bounds }>(
  node: BoundsNode<T> | null | undefined,
  box: Bounds,
  found: T[]
): T[] {
  if (!node || !overlaps(node.bounds, box)) return found;
  if (node.items) {
    for (const item of node.items) if (overlaps(item.bounds, box)) found.push(item);
  } else {
    queryIndex(node.left, box, found);
    queryIndex(node.right, box, found);
  }
  return found;
}

function segmentOverlapsBounds(a: MarineCoordinate, b: MarineCoordinate, box: Bounds): boolean {
  let enter = 0;
  let leave = 1;
  for (let axis = 0; axis < 2; axis++) {
    const minimum = (axis === 0 ? box.minX : box.minY) - EPSILON;
    const maximum = (axis === 0 ? box.maxX : box.maxY) + EPSILON;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (a[axis] < minimum || a[axis] > maximum) return false;
      continue;
    }
    const near = (minimum - a[axis]) / delta;
    const far = (maximum - a[axis]) / delta;
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
    if (leave < enter) return false;
  }
  return true;
}

function querySegment<T extends { bounds: Bounds }>(
  node: BoundsNode<T> | null | undefined,
  a: MarineCoordinate,
  b: MarineCoordinate,
  found: T[]
): T[] {
  if (!node || !segmentOverlapsBounds(a, b, node.bounds)) return found;
  if (node.items) {
    for (const item of node.items) if (segmentOverlapsBounds(a, b, item.bounds)) found.push(item);
  } else {
    querySegment(node.left, a, b, found);
    querySegment(node.right, a, b, found);
  }
  return found;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function onSegment(point: MarineCoordinate, a: MarineCoordinate, b: MarineCoordinate): boolean {
  if (
    point[0] < Math.min(a[0], b[0]) - EPSILON ||
    point[0] > Math.max(a[0], b[0]) + EPSILON ||
    point[1] < Math.min(a[1], b[1]) - EPSILON ||
    point[1] > Math.max(a[1], b[1]) + EPSILON
  )
    return false;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return (
    Math.abs(cross(point[0] - a[0], point[1] - a[1], b[0] - a[0], b[1] - a[1])) <= EPSILON * Math.max(length, EPSILON)
  );
}

function prepareRing(points: MarineCoordinate[]): PreparedRing {
  const box = bounds(points);
  const count = Math.min(128, Math.max(1, Math.ceil(Math.sqrt(points.length))));
  const bucketHeight = Math.max(EPSILON, (box.maxY - box.minY + EPSILON * 2) / count);
  const buckets: CoastEdge[][] = Array.from({ length: count }, () => []);
  for (let vertex = 0; vertex < points.length; vertex++) {
    const a = points[vertex];
    const b = points[(vertex + 1) % points.length];
    const edge = { a, b, bounds: bounds([a, b]) };
    const first = Math.max(0, Math.floor((edge.bounds.minY - box.minY - EPSILON) / bucketHeight));
    const last = Math.min(count - 1, Math.floor((edge.bounds.maxY - box.minY + EPSILON) / bucketHeight));
    for (let bucket = first; bucket <= last; bucket++) buckets[bucket].push(edge);
  }
  return { points, bounds: box, buckets, bucketHeight };
}

function ringState(point: MarineCoordinate, ring: PreparedRing): PointState {
  const box = ring.bounds;
  if (
    point[0] < box.minX - EPSILON ||
    point[0] > box.maxX + EPSILON ||
    point[1] < box.minY - EPSILON ||
    point[1] > box.maxY + EPSILON
  )
    return 'outside';
  const bucket = Math.min(ring.buckets.length - 1, Math.max(0, Math.floor((point[1] - box.minY) / ring.bucketHeight)));
  let inside = false;
  for (const { a, b } of ring.buckets[bucket]) {
    if (onSegment(point, a, b)) return 'boundary';
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function inLand(point: MarineCoordinate, polygon: LandPolygon): boolean {
  if (ringState(point, polygon.prepared[0]) !== 'inside') return false;
  for (let hole = 1; hole < polygon.prepared.length; hole++)
    if (ringState(point, polygon.prepared[hole]) !== 'outside') return false;
  return true;
}

function intersectionParameters(
  a: MarineCoordinate,
  b: MarineCoordinate,
  c: MarineCoordinate,
  d: MarineCoordinate
): number[] {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const qx = c[0] - a[0];
  const qy = c[1] - a[1];
  const denominator = cross(rx, ry, sx, sy);
  const length = Math.hypot(rx, ry);
  if (length <= EPSILON) return [];
  if (Math.abs(denominator) <= EPSILON * length * Math.hypot(sx, sy)) {
    if (Math.abs(cross(qx, qy, rx, ry)) > EPSILON * length) return [];
    const squared = rx * rx + ry * ry;
    return [(qx * rx + qy * ry) / squared, ((d[0] - a[0]) * rx + (d[1] - a[1]) * ry) / squared]
      .filter((value) => value >= -EPSILON && value <= 1 + EPSILON)
      .map((value) => Math.max(0, Math.min(1, value)));
  }
  const along = cross(qx, qy, sx, sy) / denominator;
  const edge = cross(qx, qy, rx, ry) / denominator;
  return along >= -EPSILON && along <= 1 + EPSILON && edge >= -EPSILON && edge <= 1 + EPSILON
    ? [Math.max(0, Math.min(1, along))]
    : [];
}

/** Boundary contact is allowed; every nonzero open interval must lie outside land. */
function crossesLand(a: MarineCoordinate, b: MarineCoordinate, polygon: LandPolygon): boolean {
  if (inLand(a, polygon) || inLand(b, polygon)) return true;
  const cuts = [0, 1];
  for (const edge of querySegment(polygon.edges, a, b, [])) cuts.push(...intersectionParameters(a, b, edge.a, edge.b));
  cuts.sort((left, right) => left - right);
  for (let index = 1; index < cuts.length; index++) {
    if (cuts[index] - cuts[index - 1] <= EPSILON) continue;
    const t = (cuts[index] + cuts[index - 1]) / 2;
    if (inLand([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], polygon)) return true;
  }
  return false;
}

function nearestOnSegment(point: MarineCoordinate, a: MarineCoordinate, b: MarineCoordinate): MarineCoordinate {
  const scale = Math.cos((point[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * scale;
  const dy = b[1] - a[1];
  const squared = dx * dx + dy * dy;
  const t =
    squared === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * scale * dx + (point[1] - a[1]) * dy) / squared));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function distance(a: MarineCoordinate, b: MarineCoordinate): number {
  return Math.hypot((a[0] - b[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360), a[1] - b[1]) * 111.195;
}

function cloneEndpoint(endpoint: MarineEndpoint): MarineEndpoint {
  return { ...endpoint, original: [...endpoint.original], shoreline: [...endpoint.shoreline] };
}

function copyRoute(route: MarineRoute | null, reverse = false): MarineRoute | null {
  if (!route) return null;
  return {
    coordinates: (reverse ? [...route.coordinates].reverse() : route.coordinates).map((point) => [...point]),
    start: cloneEndpoint(reverse ? route.end : route.start),
    end: cloneEndpoint(reverse ? route.start : route.end)
  };
}

function cacheSet<K, V>(cache: Map<K, V>, key: K, value: V, maximum: number): void {
  cache.set(key, value);
  if (cache.size > maximum) cache.delete(cache.keys().next().value!);
}

/** Display geometry only: avoids mapped land, without asserting navigability or a real sailing track. */
export function createMarineRouter(snapshot: Pick<ScoringSnapshot, 'islands'>): MarineRouter {
  const cached = routers.get(snapshot.islands);
  if (cached) return cached;
  const polygons: LandPolygon[] = [];
  let coastlineComplete = snapshot.islands.length > 0;
  for (const island of snapshot.islands) {
    try {
      const parsed = parsePolygons(JSON.parse(island.geoJson));
      if (!parsed?.length) {
        coastlineComplete = false;
        continue;
      }
      for (const rings of parsed) {
        const box = bounds(rings[0]);
        if (box.maxX - box.minX > 180) {
          coastlineComplete = false;
          continue;
        }
        const prepared = rings.map(prepareRing);
        const edges = rings.flatMap((ring) =>
          ring.map((a, vertex) => {
            const b = ring[(vertex + 1) % ring.length];
            return { a, b, bounds: bounds([a, b]) };
          })
        );
        polygons.push({ id: polygons.length, rings, prepared, edges: buildIndex(edges), bounds: box });
      }
    } catch {
      coastlineComplete = false;
    }
  }
  const index = buildIndex(polygons);
  const routeCache = new Map<string, MarineRoute | null>();
  const endpointCache = new Map<string, MarineEndpoint | null>();
  const edgeCache = new Map<string, LandPolygon[]>();
  const waypointCache = new Map<LandPolygon, MarineCoordinate[]>();
  const escapeCache = new Map<string, MarineCoordinate[]>();
  const coastalEscapeCache = new Map<string, MarineCoordinate[][]>();
  const pointKey = (point: MarineCoordinate) => `${point[0]},${point[1]}`;
  const edgeKey = (a: MarineCoordinate, b: MarineCoordinate) => {
    const aKey = pointKey(a);
    const bKey = pointKey(b);
    return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
  };
  const containing = (point: MarineCoordinate) =>
    queryIndex(index, pointBounds(point), []).filter((polygon) => inLand(point, polygon));

  function blocked(a: MarineCoordinate, b: MarineCoordinate): LandPolygon[] {
    const key = edgeKey(a, b);
    const hit = edgeCache.get(key);
    if (hit) return hit;
    const result = querySegment(index, a, b, []).filter((polygon) => crossesLand(a, b, polygon));
    cacheSet(edgeCache, key, result, MAX_EDGE_CACHE);
    return result;
  }

  function computeEndpoint(point: MarineCoordinate): MarineEndpoint | null {
    if (!coastlineComplete || !coordinate(point)) return null;
    const original: MarineCoordinate = [point[0], point[1]];
    const owners = containing(original);
    if (!owners.length) return { original, shoreline: [...original], snapped: false, distanceKm: 0 };
    const visited = new Set<number>();
    const candidates: { point: MarineCoordinate; distance: number }[] = [];
    function addPolygon(polygon: LandPolygon): void {
      if (visited.has(polygon.id)) return;
      visited.add(polygon.id);
      // Inland ferry coordinates leave at the exterior coast, never into an enclosed hole/lagoon.
      const exterior = polygon.rings[0];
      for (let vertex = 0; vertex < exterior.length; vertex++) {
        const candidate = nearestOnSegment(original, exterior[vertex], exterior[(vertex + 1) % exterior.length]);
        candidates.push({ point: candidate, distance: distance(original, candidate) });
      }
      candidates.sort((a, b) => b.distance - a.distance);
    }
    for (const polygon of owners) addPolygon(polygon);
    for (let attempt = 0; attempt < 4_096 && candidates.length; attempt++) {
      const candidate = candidates.pop()!;
      const occluding = containing(candidate.point);
      if (!occluding.length)
        return { original, shoreline: [...candidate.point], snapped: true, distanceKm: candidate.distance };
      for (const polygon of occluding) addPolygon(polygon);
    }
    return null;
  }

  function resolveEndpoint(point: MarineCoordinate): MarineEndpoint | null {
    if (!coastlineComplete || !coordinate(point)) return null;
    const key = pointKey(point);
    if (!endpointCache.has(key)) cacheSet(endpointCache, key, computeEndpoint(point), MAX_ENDPOINT_CACHE);
    const endpoint = endpointCache.get(key)!;
    return endpoint ? cloneEndpoint(endpoint) : null;
  }

  function waypoints(polygon: LandPolygon): MarineCoordinate[] {
    const hit = waypointCache.get(polygon);
    if (hit) return hit;
    const box = polygon.bounds;
    const pad = 2e-6;
    const points: MarineCoordinate[] = [
      [box.minX - pad, box.minY - pad],
      [box.maxX + pad, box.minY - pad],
      [box.maxX + pad, box.maxY + pad],
      [box.minX - pad, box.maxY + pad]
    ];
    const result = points.filter((point) => !containing(point).length);
    waypointCache.set(polygon, result);
    return result;
  }

  function endpointWaypoints(point: MarineCoordinate): MarineCoordinate[] {
    const key = pointKey(point);
    const hit = escapeCache.get(key);
    if (hit) return hit;
    const nearby = queryIndex(
      index,
      {
        minX: point[0] - 0.002,
        maxX: point[0] + 0.002,
        minY: point[1] - 0.002,
        maxY: point[1] + 0.002
      },
      []
    );
    if (!nearby.length) return [];
    const size = Math.max(
      ...nearby.map((polygon) =>
        Math.max(polygon.bounds.maxX - polygon.bounds.minX, polygon.bounds.maxY - polygon.bounds.minY)
      )
    );
    const points: MarineCoordinate[] = [];
    // A small harbor may disappear in a simplified coastline. Visible escape rays keep
    // its actual mouth connected to the coarse offshore graph without crossing its apron.
    for (let direction = 0; direction < 32; direction++) {
      const angle = (direction * Math.PI) / 16;
      let farthest: MarineCoordinate | null = null;
      for (const factor of [1 / 128, 1 / 32, 1 / 8, 1 / 2, 2]) {
        const radius = Math.max(0.00001, size * factor);
        const candidate: MarineCoordinate = [point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius];
        if (coordinate(candidate) && !blocked(point, candidate).length) farthest = candidate;
      }
      if (farthest) points.push(farthest);
    }
    // Preserve nearby exact coast vertices for very narrow or angled harbor mouths.
    for (const polygon of nearby) {
      for (const ring of polygon.rings) {
        let nearest = 0;
        let best = Infinity;
        for (let vertex = 0; vertex < ring.length; vertex++) {
          const candidate = nearestOnSegment(point, ring[vertex], ring[(vertex + 1) % ring.length]);
          const separation = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
          if (separation < best) {
            best = separation;
            nearest = vertex;
          }
        }
        if (best > Math.max(0.002, size / 8)) continue;
        for (let offset = -3; offset <= 4; offset++) {
          const candidate = ring[(nearest + offset + ring.length) % ring.length];
          if (!blocked(point, candidate).length) points.push(candidate);
        }
      }
    }
    cacheSet(escapeCache, key, points, MAX_ENDPOINT_CACHE);
    return points;
  }

  function coastalEscapes(point: MarineCoordinate): MarineCoordinate[][] {
    const key = pointKey(point);
    const hit = coastalEscapeCache.get(key);
    if (hit) return hit;
    const nearby = queryIndex(
      index,
      {
        minX: point[0] - 0.003,
        maxX: point[0] + 0.003,
        minY: point[1] - 0.003,
        maxY: point[1] + 0.003
      },
      []
    );
    const shores: { polygon: LandPolygon; vertex: number; point: MarineCoordinate; separation: number }[] = [];
    for (const polygon of nearby) {
      const ring = polygon.rings[0];
      for (let vertex = 0; vertex < ring.length; vertex++) {
        const shore = nearestOnSegment(point, ring[vertex], ring[(vertex + 1) % ring.length]);
        shores.push({ polygon, vertex, point: shore, separation: distance(point, shore) });
      }
    }
    shores.sort((a, b) => a.separation - b.separation);
    const paths: MarineCoordinate[][] = [];
    const visited = new Set<number>();
    for (const shore of shores) {
      if (visited.has(shore.polygon.id)) continue;
      visited.add(shore.polygon.id);
      if (blocked(point, shore.point).length) continue;
      const ring = shore.polygon.rings[0];
      const corners = [...waypoints(shore.polygon)].sort((a, b) => distance(point, a) - distance(point, b));
      for (const direction of [-1, 1]) {
        const path: MarineCoordinate[] = [[...point], shore.point];
        let vertex = direction === 1 ? (shore.vertex + 1) % ring.length : shore.vertex;
        for (let step = 0; step < ring.length; step++, vertex = (vertex + direction + ring.length) % ring.length) {
          const current = ring[vertex];
          if (blocked(path.at(-1)!, current).length) break;
          path.push(current);
          if (step > 3 && step % 8 !== 0) continue;
          const corner = corners.find((candidate) => !blocked(current, candidate).length);
          if (corner) {
            paths.push([...path, corner]);
            break;
          }
        }
      }
      if (paths.length) break;
    }
    cacheSet(coastalEscapeCache, key, paths, MAX_ENDPOINT_CACHE);
    return paths;
  }

  function search(
    start: MarineCoordinate,
    end: MarineCoordinate,
    extra: MarineCoordinate[] = [],
    coastPaths: MarineCoordinate[][] = []
  ): MarineCoordinate[] | null {
    const initial = blocked(start, end);
    if (!initial.length) return [[...start], [...end]];
    const nodes: MarineCoordinate[] = [start, end];
    const distances = new Float64Array(MAX_NODES * MAX_NODES);
    const visibility = new Int8Array(MAX_NODES * MAX_NODES);
    const estimates = new Float64Array(MAX_NODES);
    const coastEdges = new Map<string, MarineCoordinate[]>();
    distances[1] = distances[MAX_NODES] = distance(start, end);
    estimates[0] = distances[1];
    visibility[1] = visibility[MAX_NODES] = -1;
    const nodeKeys = new Set(nodes.map(pointKey));
    const expandedPolygons = new Set<number>();
    function addPoint(point: MarineCoordinate): boolean {
      const key = pointKey(point);
      if (nodes.length >= MAX_NODES || nodeKeys.has(key)) return false;
      nodeKeys.add(key);
      const position = nodes.length;
      nodes.push(point);
      estimates[position] = distance(point, end);
      for (let other = 0; other < position; other++) {
        distances[position * MAX_NODES + other] = distances[other * MAX_NODES + position] = distance(
          nodes[other],
          point
        );
        const hit = edgeCache.get(edgeKey(nodes[other], point));
        if (hit)
          visibility[position * MAX_NODES + other] = visibility[other * MAX_NODES + position] = hit.length ? -1 : 1;
      }
      visibility[position] = visibility[position * MAX_NODES] = blocked(start, point).length ? -1 : 1;
      visibility[MAX_NODES + position] = visibility[position * MAX_NODES + 1] = blocked(end, point).length ? -1 : 1;
      return true;
    }
    for (const point of [...endpointWaypoints(start), ...endpointWaypoints(end)]) addPoint(point);
    for (const point of extra) addPoint(point);
    for (const path of coastPaths) {
      addPoint(path[0]);
      addPoint(path.at(-1)!);
      const from = nodes.findIndex((point) => pointKey(point) === pointKey(path[0]));
      const to = nodes.findIndex((point) => pointKey(point) === pointKey(path.at(-1)!));
      if (from < 0 || to < 0 || from === to || !isWaterPath(path)) continue;
      if (!blocked(nodes[from], nodes[to]).length) {
        visibility[from * MAX_NODES + to] = visibility[to * MAX_NODES + from] = 1;
        continue;
      }
      const length = path.slice(1).reduce((total, point, position) => total + distance(path[position], point), 0);
      distances[from * MAX_NODES + to] = distances[to * MAX_NODES + from] = length;
      visibility[from * MAX_NODES + to] = visibility[to * MAX_NODES + from] = 1;
      coastEdges.set(`${from},${to}`, path);
      coastEdges.set(`${to},${from}`, [...path].reverse());
    }
    function addObstacles(obstacles: Iterable<LandPolygon>): boolean {
      let added = false;
      for (const polygon of obstacles) {
        if (expandedPolygons.has(polygon.id)) continue;
        expandedPolygons.add(polygon.id);
        for (const point of waypoints(polygon)) {
          if (nodes.length >= MAX_NODES) break;
          added = addPoint(point) || added;
        }
      }
      return added;
    }
    addObstacles(initial);
    let checks = 0;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const scores = nodes.map(() => Infinity);
      const previous = nodes.map(() => -1);
      const open = new Set([0]);
      const closed = new Set<number>();
      scores[0] = 0;
      const discovered = new Map<number, LandPolygon>();
      function pathTo(position: number): MarineCoordinate[] {
        const positions: number[] = [];
        for (; position >= 0; position = previous[position]) positions.push(position);
        positions.reverse();
        const path: MarineCoordinate[] = [nodes[positions[0]]];
        for (let step = 1; step < positions.length; step++) {
          const coast = coastEdges.get(`${positions[step - 1]},${positions[step]}`);
          path.push(...(coast ? coast.slice(1) : [nodes[positions[step]]]));
        }
        return path.map((point) => [...point]);
      }
      while (open.size) {
        let current = -1;
        let best = Infinity;
        for (const candidate of open) {
          const estimate = scores[candidate] + estimates[candidate];
          if (estimate < best) {
            current = candidate;
            best = estimate;
          }
        }
        if (current === 1) return pathTo(1);
        open.delete(current);
        closed.add(current);
        const neighbors = Array.from({ length: nodes.length }, (_, position) => position).sort(
          (a, b) =>
            distances[current * MAX_NODES + a] + estimates[a] - distances[current * MAX_NODES + b] - estimates[b]
        );
        for (const next of neighbors) {
          if (next === current || closed.has(next)) continue;
          const score = scores[current] + distances[current * MAX_NODES + next];
          if (score >= scores[next]) continue;
          let state = visibility[current * MAX_NODES + next];
          if (!state) {
            if (++checks > MAX_EDGE_CHECKS) return null;
            const obstacles = blocked(nodes[current], nodes[next]);
            state = obstacles.length ? -1 : 1;
            visibility[current * MAX_NODES + next] = visibility[next * MAX_NODES + current] = state;
            for (const polygon of obstacles) if (!expandedPolygons.has(polygon.id)) discovered.set(polygon.id, polygon);
          }
          if (state < 0) {
            // An edge may already have been checked while adding its endpoint.
            // Its other blocking islands still need nodes for a later detour pass.
            for (const polygon of blocked(nodes[current], nodes[next]))
              if (!expandedPolygons.has(polygon.id)) discovered.set(polygon.id, polygon);
            continue;
          }
          scores[next] = score;
          previous[next] = current;
          open.add(next);
        }
      }
      if (!addObstacles(discovered.values())) break;
    }
    return null;
  }

  function searchWithCoastalEscape(start: MarineCoordinate, end: MarineCoordinate): MarineCoordinate[] | null {
    const direct = search(start, end);
    if (direct) return direct;
    const departures = [[[...start]] as MarineCoordinate[], ...coastalEscapes(start)];
    const arrivals = [[[...end]] as MarineCoordinate[], ...coastalEscapes(end)];
    const length = (path: MarineCoordinate[]) =>
      path.slice(1).reduce((total, point, position) => total + distance(path[position], point), 0);
    const options = departures
      .flatMap((departure, from) =>
        arrivals.map((arrival, to) => ({
          departure,
          arrival,
          from,
          to,
          cost: length(departure) + length(arrival) + distance(departure.at(-1)!, arrival.at(-1)!)
        }))
      )
      .filter((option) => option.from || option.to)
      .sort((a, b) => a.cost - b.cost);
    for (const { departure, arrival } of options) {
      const offshore = search(departure.at(-1)!, arrival.at(-1)!);
      if (!offshore) continue;
      const path = [...departure.slice(0, -1), ...offshore, ...arrival.slice(0, -1).reverse()];
      if (isWaterPath(path)) return path;
    }
    return null;
  }

  function isWaterPath(coordinates: readonly MarineCoordinate[]): boolean {
    if (!coastlineComplete || coordinates.length < 2 || !coordinates.every(coordinate)) return false;
    for (let position = 1; position < coordinates.length; position++)
      if (blocked(coordinates[position - 1], coordinates[position]).length) return false;
    return true;
  }

  function shortenPath(coordinates: MarineCoordinate[]): MarineCoordinate[] {
    let remaining = 2_000;
    const visible = (a: MarineCoordinate, b: MarineCoordinate) => --remaining >= 0 && !blocked(a, b).length;
    function shortcut(path: MarineCoordinate[]): MarineCoordinate[] {
      const result: MarineCoordinate[] = [path[0]];
      for (let anchor = 0; anchor < path.length - 1;) {
        let next = path.length - 1;
        while (next > anchor + 1 && !visible(path[anchor], path[next])) next--;
        result.push(path[next]);
        anchor = next;
        if (remaining <= 0) return [...result, ...path.slice(anchor + 1)];
      }
      return result;
    }
    let path = shortcut(coordinates);
    // Offshore search nodes are deliberately conservative. Pull each bend toward
    // its neighbors only while both replacement segments remain outside exact land.
    // This removes long ray-end hairpins without smoothing a route through a harbor wall.
    for (let sweep = 0; sweep < 6 && remaining > 0; sweep++) {
      const positions = Array.from({ length: Math.max(0, path.length - 2) }, (_, index) => index + 1);
      if (sweep % 2) positions.reverse();
      for (const position of positions) {
        const previous = path[position - 1];
        const next = path[position + 1];
        const original = path[position];
        const target: MarineCoordinate = [(previous[0] + next[0]) / 2, (previous[1] + next[1]) / 2];
        // Independent longitude/latitude moves can tighten a bend when moving both
        // together would immediately touch a narrow harbor wall.
        if (sweep % 3 === 1) target[0] = original[0];
        if (sweep % 3 === 2) target[1] = original[1];
        let lower = 0;
        let upper = 1;
        let best = original;
        for (let attempt = 0; attempt < 14 && remaining > 1; attempt++) {
          const fraction = (lower + upper) / 2;
          const candidate: MarineCoordinate = [
            original[0] + (target[0] - original[0]) * fraction,
            original[1] + (target[1] - original[1]) * fraction
          ];
          if (visible(previous, candidate) && visible(candidate, next)) {
            lower = fraction;
            best = candidate;
          } else upper = fraction;
        }
        if (distance(previous, best) + distance(best, next) < distance(previous, original) + distance(original, next))
          path[position] = best;
      }
      path = shortcut(path);
    }
    return isWaterPath(path) ? path : coordinates;
  }

  function coastalNeighbors(point: MarineCoordinate): MarineCoordinate[][] {
    const nearby = queryIndex(
      index,
      {
        minX: point[0] - 0.003,
        maxX: point[0] + 0.003,
        minY: point[1] - 0.003,
        maxY: point[1] + 0.003
      },
      []
    );
    let nearest: { ring: MarineCoordinate[]; vertex: number; distance: number } | null = null;
    for (const polygon of nearby) {
      const ring = polygon.rings[0];
      for (let vertex = 0; vertex < ring.length; vertex++) {
        const shore = nearestOnSegment(point, ring[vertex], ring[(vertex + 1) % ring.length]);
        const separation = distance(point, shore);
        if (!nearest || separation < nearest.distance) nearest = { ring, vertex, distance: separation };
      }
    }
    if (!nearest) return [];
    const paths: MarineCoordinate[][] = [];
    const { ring, vertex } = nearest;
    for (const direction of [-1, 1]) {
      const chain = Array.from(
        { length: Math.min(257, Math.ceil(ring.length / 2)) },
        (_, offset) => ring[(vertex + direction * offset + ring.length) % ring.length]
      );
      const keep = new Set([0, chain.length - 1]);
      const pending: { first: number; last: number; farthest: number; separation: number }[] = [];
      function split(first: number, last: number): void {
        let farthest = -1;
        let separation = 0;
        for (let position = first + 1; position < last; position++) {
          const onChord = nearestOnSegment(chain[position], chain[first], chain[last]);
          const candidate = distance(chain[position], onChord);
          if (candidate > separation) {
            separation = candidate;
            farthest = position;
          }
        }
        if (farthest >= 0) pending.push({ first, last, farthest, separation });
      }
      split(0, chain.length - 1);
      while (keep.size < 32 && pending.length) {
        pending.sort((a, b) => a.separation - b.separation);
        const segment = pending.pop()!;
        keep.add(segment.farthest);
        split(segment.first, segment.farthest);
        split(segment.farthest, segment.last);
      }
      const positions = [...keep].sort((a, b) => a - b);
      for (let position = 1; position < positions.length; position++) {
        const path = chain.slice(positions[position - 1], positions[position] + 1);
        if (isWaterPath(path)) paths.push(path);
      }
    }
    return paths;
  }

  function refinePath(coordinates: MarineCoordinate[]): MarineCoordinate[] {
    let path = shortenPath(coordinates);
    const length = (points: MarineCoordinate[]) =>
      points.slice(1).reduce((total, point, position) => total + distance(points[position], point), 0);
    const direct = distance(path[0], path.at(-1)!);
    if (length(path) > Math.max(direct * 1.4, direct + 0.15)) {
      // A bent harbor can need several short coast-adjacent legs. A single relaxed
      // offshore bend cannot represent those turns, so expose a bounded exact-coast
      // neighborhood to the same visibility graph before accepting a large detour.
      const candidate = search(path[0], path.at(-1)!, path, [
        ...coastalNeighbors(path[0]),
        ...coastalNeighbors(path.at(-1)!)
      ]);
      if (candidate && length(candidate) < length(path)) path = shortenPath(candidate);
    }
    return path;
  }

  function routeDetailed(start: MarineCoordinate, end: MarineCoordinate): MarineRoute | null {
    if (!coastlineComplete || !coordinate(start) || !coordinate(end)) return null;
    const from = pointKey(start);
    const to = pointKey(end);
    const reverse = from > to;
    const key = reverse ? `${to}|${from}` : `${from}|${to}`;
    if (routeCache.has(key)) return copyRoute(routeCache.get(key)!, reverse);
    const source = resolveEndpoint(reverse ? end : start);
    const destination = resolveEndpoint(reverse ? start : end);
    const coordinates = source && destination ? searchWithCoastalEscape(source.shoreline, destination.shoreline) : null;
    const result =
      source && destination && coordinates && isWaterPath(coordinates)
        ? { coordinates: refinePath(coordinates), start: source, end: destination }
        : null;
    cacheSet(routeCache, key, result, MAX_PAIR_CACHE);
    return copyRoute(result, reverse);
  }

  const router: MarineRouter = {
    coastlineComplete,
    landPolygonCount: polygons.length,
    resolveEndpoint,
    routeDetailed,
    isWaterPath,
    route(start, end) {
      return routeDetailed(start, end)?.coordinates ?? null;
    }
  };
  routers.set(snapshot.islands, router);
  return router;
}
