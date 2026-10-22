type Coordinate = [number, number];

type RouteIndex = {
  cumulative: number[];
  length: number;
};

const indexes = new WeakMap<readonly Coordinate[], RouteIndex>();

function routeIndex(coordinates: readonly Coordinate[]): RouteIndex {
  const cached = indexes.get(coordinates);
  if (cached) return cached;

  const cumulative = [0];
  let length = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    length += Math.hypot(end[0] - start[0], end[1] - start[1]);
    cumulative.push(length);
  }
  const result = { cumulative, length };
  indexes.set(coordinates, result);
  return result;
}

function routeSample(coordinates: readonly Coordinate[], progress: number): { index: number; point: Coordinate } {
  const { cumulative, length } = routeIndex(coordinates);
  const target = length * Math.min(1, Math.max(0, progress));
  let low = 1;
  let high = coordinates.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative[middle] < target) low = middle + 1;
    else high = middle;
  }
  const start = coordinates[low - 1];
  const end = coordinates[low];
  const segmentLength = cumulative[low] - cumulative[low - 1];
  const ratio = segmentLength === 0 ? 0 : (target - cumulative[low - 1]) / segmentLength;
  return {
    index: low,
    point: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]
  };
}

export function presentationRoutePosition(
  coordinates: readonly Coordinate[],
  progress: number,
  fallback: Coordinate
): Coordinate {
  if (coordinates.length === 0) return fallback;
  if (coordinates.length === 1 || progress <= 0) return coordinates[0];
  if (progress >= 1 || routeIndex(coordinates).length === 0) return coordinates.at(-1)!;
  return routeSample(coordinates, progress).point;
}

export function presentationRouteReveal(coordinates: readonly Coordinate[], progress: number): Coordinate[] {
  if (coordinates.length < 2 || progress >= 1) return [...coordinates];
  if (routeIndex(coordinates).length === 0) return [coordinates[0], coordinates.at(-1)!];
  if (progress <= 0) return [coordinates[0], coordinates[0]];
  const { index, point } = routeSample(coordinates, progress);
  return [...coordinates.slice(0, index), point];
}
