import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Coordinate = [number, number];
type RouteStop = {
  id?: unknown;
  code?: unknown;
  order?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};
type RouteDetails = {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  routeNumber?: unknown;
  busRouteStopList?: RouteStop[];
};
type Ring = Coordinate[];
type IslandShape = {
  id: string;
  rings: Ring[];
  center: Coordinate;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const baseUrl = 'https://bo.rtl.mv:4455/maldives/api';
const outputRoot = resolve(process.env.MOBILITY_ROUTE_OUTPUT_ROOT ?? 'data/mobility/normalized');
const rawRoot = resolve(process.env.MOBILITY_RAW_OUTPUT_ROOT ?? 'data/mobility/raw/rtl');
const islands = JSON.parse(
  readFileSync(
    resolve(process.env.MOBILITY_NORMALIZED_DATA_ROOT ?? 'old/data/mobility/normalized', 'islands.geojson'),
    'utf8'
  )
) as {
  features: Array<{
    id?: unknown;
    geometry?: { type?: unknown; coordinates?: unknown };
    properties?: { centroid?: unknown };
  }>;
};
const bounds = { minLongitude: 72.5, maxLongitude: 74.8, minLatitude: -0.5, maxLatitude: 8.5 };

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2 || typeof value[0] !== 'number' || typeof value[1] !== 'number')
    return null;
  const point: Coordinate = [value[0], value[1]];
  if (
    point[0] < bounds.minLongitude ||
    point[0] > bounds.maxLongitude ||
    point[1] < bounds.minLatitude ||
    point[1] > bounds.maxLatitude
  )
    return null;
  return point;
}

function pointInRing(point: Coordinate, ring: Ring): boolean {
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

function islandShapes(): IslandShape[] {
  return islands.features.flatMap((feature) => {
    const id = typeof feature.id === 'string' ? feature.id : null;
    const geometry = feature.geometry;
    if (!id || !geometry || !Array.isArray(geometry.coordinates)) return [];
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates.flat()
          : [];
    const rings = polygons.flatMap((polygon) =>
      Array.isArray(polygon)
        ? [polygon[0]].flatMap((ring) => {
            const points = Array.isArray(ring)
              ? ring.map(coordinate).filter((point): point is Coordinate => point !== null)
              : [];
            return points.length >= 3 ? [points] : [];
          })
        : []
    );
    if (!rings.length) return [];
    const points = rings.flat();
    const [minX, minY, maxX, maxY] = [
      Math.min(...points.map((point) => point[0])),
      Math.min(...points.map((point) => point[1])),
      Math.max(...points.map((point) => point[0])),
      Math.max(...points.map((point) => point[1]))
    ];
    const centroid = coordinate(feature.properties?.centroid) ?? [(minX + maxX) / 2, (minY + maxY) / 2];
    return [{ id, rings, center: centroid, minX, minY, maxX, maxY }];
  });
}

const shapes = islandShapes();
function islandAt(point: Coordinate): string | null {
  const exact = shapes.find(
    (shape) =>
      point[0] >= shape.minX &&
      point[0] <= shape.maxX &&
      point[1] >= shape.minY &&
      point[1] <= shape.maxY &&
      shape.rings.some((ring) => pointInRing(point, ring))
  );
  if (exact) return exact.id;
  const nearest = shapes
    .map((shape) => ({ shape, distance: (shape.center[0] - point[0]) ** 2 + (shape.center[1] - point[1]) ** 2 }))
    .sort((first, second) => first.distance - second.distance)[0];
  return nearest && nearest.distance <= 0.03 ** 2 ? nearest.shape.id : null;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

const detailsResponse = await getJson<{ routeResponse?: RouteDetails[] }>('/booking/v2/bus/routedetails');
const routeDetails = detailsResponse.routeResponse ?? [];
const routes: Array<Record<string, unknown>> = [];
const stops = new Map<string, Record<string, unknown>>();
const rawRoadShapes: Array<{ routeCode: string; response: unknown }> = [];

for (const route of routeDetails) {
  const code = typeof route.code === 'string' ? route.code : null;
  if (!code) continue;
  for (const stop of route.busRouteStopList ?? []) {
    const id = String(stop.id ?? stop.code ?? '');
    const latitude = Number(stop.latitude);
    const longitude = Number(stop.longitude);
    if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !coordinate([longitude, latitude]))
      continue;
    stops.set(id, {
      id: `rtl:bus-stop:${id}`,
      source_stop_id: id,
      code: typeof stop.code === 'string' ? stop.code : null,
      name: typeof stop.name === 'string' ? stop.name : null,
      latitude,
      longitude,
      island_id: islandAt([longitude, latitude]),
      source: 'RTL',
      source_url: `${baseUrl}/booking/v2/bus/routedetails`
    });
  }
}

for (const route of routeDetails) {
  const code = typeof route.code === 'string' ? route.code : null;
  if (!code) continue;
  const response = await fetch(`${baseUrl}/booking/v2/bus/roadshape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ routeCode: code }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) continue;
  const body = (await response.json()) as {
    roadShape?: { features?: Array<{ geometry?: { type?: unknown; coordinates?: unknown } }> };
  };
  rawRoadShapes.push({ routeCode: code, response: body });
  const geometries = (body.roadShape?.features ?? [])
    .map((feature) => feature.geometry)
    .filter((geometry) => geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates))
    .map((geometry) => geometry as { type: 'MultiLineString'; coordinates: unknown[] });
  if (!geometries.length) continue;
  const valid = geometries.every((geometry) =>
    geometry.coordinates.every((line) => Array.isArray(line) && line.every((point) => coordinate(point) !== null))
  );
  if (!valid) continue;
  routes.push({
    id: `rtl:bus:${code}`,
    code,
    name: typeof route.name === 'string' ? route.name : null,
    route_number: typeof route.routeNumber === 'string' ? route.routeNumber : null,
    route_type: 'bus',
    geometry: geometries[0],
    source: 'RTL',
    source_object_id: code,
    stop_ids: (route.busRouteStopList ?? []).map((stop) => String(stop.id ?? stop.code ?? '')).filter(Boolean),
    modeled: false
  });
}

mkdirSync(outputRoot, { recursive: true });
mkdirSync(rawRoot, { recursive: true });
writeFileSync(resolve(rawRoot, 'bus-routedetails.json'), JSON.stringify(detailsResponse, null, 2));
writeFileSync(resolve(rawRoot, 'bus-roadshapes.json'), JSON.stringify(rawRoadShapes, null, 2));
writeFileSync(
  resolve(outputRoot, 'rtl-bus.json'),
  JSON.stringify(
    {
      schema_version: 'normalized-rtl-bus-v1',
      source: 'RTL',
      route_details_endpoint: `${baseUrl}/booking/v2/bus/routedetails`,
      roadshape_endpoint: `${baseUrl}/booking/v2/bus/roadshape`,
      routes,
      stops: [...stops.values()]
    },
    null,
    2
  )
);
console.log(JSON.stringify({ routes: routes.length, stops: stops.size }, null, 2));
