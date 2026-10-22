type Position = [number, number];
type Geometry = { type: string; coordinates: unknown };

function isRing(value: unknown): value is Position[] {
  return (
    Array.isArray(value) &&
    value.length >= 4 &&
    value.every(
      (point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
    )
  );
}

function segmentDistanceSquared(point: Position, start: Position, end: Position): number {
  const xScale = Math.cos((point[1] * Math.PI) / 180);
  const dx = (end[0] - start[0]) * xScale;
  const dy = end[1] - start[1];
  const px = (point[0] - start[0]) * xScale;
  const py = point[1] - start[1];
  const length = dx * dx + dy * dy;
  const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
  return (px - ratio * dx) ** 2 + (py - ratio * dy) ** 2;
}

function simplifyRing(ring: Position[]): Position[] {
  // This representation is used only below zoom 6.2. Original geometry remains
  // authoritative for close views, proposal validation and all calculations.
  const toleranceSquared = (15 / 111_320) ** 2;
  const retained = new Set([0, ring.length - 1]);
  const segments = [[0, ring.length - 1]];
  while (segments.length) {
    const [start, end] = segments.pop()!;
    let farthest = -1;
    let distance = toleranceSquared;
    for (let index = start + 1; index < end; index++) {
      const candidate = segmentDistanceSquared(ring[index], ring[start], ring[end]);
      if (candidate > distance) {
        distance = candidate;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      retained.add(farthest);
      segments.push([start, farthest], [farthest, end]);
    }
  }
  const points = [...retained].sort((a, b) => a - b).map((index) => ring[index]);
  const selected = points.length >= 4 ? points : ring;
  const rounded: Position[] = selected.map(([longitude, latitude]) => [
    Number(longitude.toFixed(5)),
    Number(latitude.toFixed(5))
  ]);
  return new Set(rounded.map((point) => point.join(','))).size >= 3 ? rounded : selected;
}

export function overviewGeometry(geometry: Geometry): Geometry {
  const rings = (value: unknown) =>
    Array.isArray(value) ? value.map((ring) => (isRing(ring) ? simplifyRing(ring) : ring)) : value;
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: rings(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return { ...geometry, coordinates: geometry.coordinates.map(rings) };
  }
  return geometry;
}

/** Display coordinates only: retain every vertex, to within one centimetre. */
export function detailGeometry(geometry: Geometry): Geometry {
  const rings = (value: unknown) =>
    Array.isArray(value)
      ? value.map((ring) => {
          if (!isRing(ring)) return ring;
          const rounded = ring.map(([longitude, latitude, ...rest]) => [
            Number(longitude.toFixed(7)),
            Number(latitude.toFixed(7)),
            ...rest
          ]);
          // Never collapse a tiny valid polygon while reducing wire precision.
          return new Set(rounded.map((point) => `${point[0]},${point[1]}`)).size >= 3 ? rounded : ring;
        })
      : value;
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: rings(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return { ...geometry, coordinates: geometry.coordinates.map(rings) };
  }
  return geometry;
}
