export type Coordinate = [number, number];

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function asRing(value: unknown): Coordinate[] {
  return Array.isArray(value) ? value.filter(isCoordinate) : [];
}

function pointInRing(point: Coordinate, ring: readonly Coordinate[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (!current || !prior) continue;

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

function distanceToSegmentMeters(point: Coordinate, start: Coordinate, end: Coordinate): number {
  const metersPerLatitude = 111_320;
  const metersPerLongitude = metersPerLatitude * Math.cos((point[1] * Math.PI) / 180);
  const startX = (start[0] - point[0]) * metersPerLongitude;
  const startY = (start[1] - point[1]) * metersPerLatitude;
  const endX = (end[0] - point[0]) * metersPerLongitude;
  const endY = (end[1] - point[1]) * metersPerLatitude;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
  return Math.hypot(startX + projection * deltaX, startY + projection * deltaY);
}

function distanceToRingMeters(point: Coordinate, ring: readonly Coordinate[]): number {
  if (ring.length < 2) return Number.POSITIVE_INFINITY;

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    if (!start || !end) continue;
    minimum = Math.min(minimum, distanceToSegmentMeters(point, start, end));
  }
  return minimum;
}

function pointWithinPolygonGrace(point: Coordinate, coordinates: unknown, graceMeters: number): boolean {
  if (!Array.isArray(coordinates)) return false;

  const outer = asRing(coordinates[0]);
  if (outer.length < 3) return false;
  const holes = coordinates.slice(1).map(asRing);
  if (holes.some((hole) => hole.length >= 3 && pointInRing(point, hole))) return false;
  if (pointInRing(point, outer)) return true;

  return distanceToRingMeters(point, outer) <= Math.max(0, graceMeters);
}

export function pointWithinGeometryGrace(point: Coordinate, geometry: unknown, graceMeters: number): boolean {
  if (!geometry || typeof geometry !== 'object') return false;

  const value = geometry as { type?: unknown; coordinates?: unknown; geometry?: unknown };
  if (value.type === 'Feature') return pointWithinGeometryGrace(point, value.geometry, graceMeters);
  if (value.type === 'Polygon') return pointWithinPolygonGrace(point, value.coordinates, graceMeters);
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    return value.coordinates.some((polygon) => pointWithinPolygonGrace(point, polygon, graceMeters));
  }

  return false;
}
