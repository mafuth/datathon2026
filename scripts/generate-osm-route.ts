import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type Coordinate = [number, number];
type OsrmWaypoint = {
  distance?: unknown;
  location?: unknown;
  name?: unknown;
};
type OsrmRoute = {
  distance?: unknown;
  duration?: unknown;
  geometry?: { coordinates?: unknown; type?: unknown };
};
type OsrmResponse = {
  code?: unknown;
  routes?: OsrmRoute[];
  waypoints?: OsrmWaypoint[];
};
type CachedRouteArtifact = {
  destination?: { coordinates?: unknown };
  generated_at?: unknown;
  geometry?: { coordinates?: unknown; type?: unknown };
  origin?: { coordinates?: unknown };
  source_endpoint?: unknown;
  distance_m?: unknown;
  duration_s?: unknown;
  schema_version?: unknown;
};

const DEFAULT_ORIGIN: Coordinate = [73.528856, 4.191794];
const DEFAULT_DESTINATION: Coordinate = [73.539012, 4.212707];
const DEFAULT_OUTPUT = 'data/mobility/derived/hulhule-airport-tree-top-route.json';
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

function argument(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function parseCoordinate(value: string | undefined, fallback: Coordinate, name: string): Coordinate {
  if (!value) return fallback;
  const [longitude, latitude] = value.split(',').map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`${name} must use the format longitude,latitude`);
  }
  return [longitude, latitude];
}

function coordinate(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  return [value[0], value[1]];
}

function routeCoordinates(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];
  return value.map(coordinate).filter((point): point is Coordinate => point !== null);
}

function sameCoordinate(first: Coordinate | null, second: Coordinate): boolean {
  return first?.[0] === second[0] && first[1] === second[1];
}

function withEndpoints(route: Coordinate[], origin: Coordinate, destination: Coordinate): Coordinate[] {
  return [origin, ...route, destination].filter((point, index, points) => {
    const previous = points[index - 1];
    return !previous || previous[0] !== point[0] || previous[1] !== point[1];
  });
}

const origin = parseCoordinate(argument('--from'), DEFAULT_ORIGIN, '--from');
const destination = parseCoordinate(argument('--to'), DEFAULT_DESTINATION, '--to');
const outputPath = resolve(argument('--output') ?? process.env.OSRM_ROUTE_OUTPUT_PATH ?? DEFAULT_OUTPUT);
const refresh = process.argv.includes('--refresh');
const customRoute = Boolean(
  argument('--from') ||
  argument('--to') ||
  argument('--profile') ||
  argument('--base-url') ||
  process.env.OSRM_PROFILE ||
  process.env.OSRM_BASE_URL
);

if (!refresh && !customRoute && existsSync(outputPath)) {
  const cached = JSON.parse(readFileSync(outputPath, 'utf8')) as CachedRouteArtifact;
  const cachedCoordinates = routeCoordinates(cached.geometry?.coordinates);
  if (
    cached.schema_version !== 'osm-routed-line-v1' ||
    cached.geometry?.type !== 'LineString' ||
    cachedCoordinates.length < 2 ||
    !sameCoordinate(coordinate(cached.origin?.coordinates), origin) ||
    !sameCoordinate(coordinate(cached.destination?.coordinates), destination)
  ) {
    throw new Error(`Cached route artifact is invalid: ${outputPath}. Run with --refresh to replace it.`);
  }

  console.log(
    JSON.stringify(
      {
        output: outputPath,
        cached: true,
        generated_at: cached.generated_at ?? null,
        coordinates: cachedCoordinates.length,
        distance_m: cached.distance_m ?? null,
        duration_s: cached.duration_s ?? null,
        source_endpoint: cached.source_endpoint ?? null
      },
      null,
      2
    )
  );
} else {
  const profile = argument('--profile') ?? process.env.OSRM_PROFILE ?? 'driving';
  const baseUrl = (argument('--base-url') ?? process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');
  const routeUrl = `${baseUrl}/route/v1/${profile}/${origin.join(',')};${destination.join(',')}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(routeUrl, {
    headers: { accept: 'application/json', 'user-agent': 'MobilitySandboxMV/0.1' },
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}.`);

  const body = (await response.json()) as OsrmResponse;
  if (body.code !== 'Ok')
    throw new Error(`OSRM could not route the requested points: ${String(body.code ?? 'unknown error')}.`);
  const route = body.routes?.[0];
  const geometry = routeCoordinates(route?.geometry?.coordinates);
  if (!route || route.geometry?.type !== 'LineString' || geometry.length < 2) {
    throw new Error('OSRM returned no usable LineString route.');
  }

  const routePath = withEndpoints(geometry, origin, destination);
  const waypoints = (body.waypoints ?? []).map((waypoint) => ({
    name: typeof waypoint.name === 'string' ? waypoint.name : null,
    coordinates: coordinate(waypoint.location),
    distance_m: typeof waypoint.distance === 'number' ? Math.round(waypoint.distance) : null
  }));

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        schema_version: 'osm-routed-line-v1',
        generated_at: new Date().toISOString(),
        source: 'OpenStreetMap via OSRM',
        source_endpoint: routeUrl,
        profile,
        origin: { label: 'Hulhule / Velana Airport', coordinates: origin },
        destination: { label: 'Tree Top Hospital', coordinates: destination },
        waypoints,
        distance_m: typeof route.distance === 'number' ? Math.round(route.distance) : null,
        duration_s: typeof route.duration === 'number' ? Math.round(route.duration) : null,
        geometry: { type: 'LineString', coordinates: routePath }
      },
      null,
      2
    )}\n`
  );

  console.log(
    JSON.stringify(
      {
        output: outputPath,
        cached: false,
        coordinates: routePath.length,
        distance_m: typeof route.distance === 'number' ? Math.round(route.distance) : null,
        duration_s: typeof route.duration === 'number' ? Math.round(route.duration) : null,
        source_endpoint: routeUrl
      },
      null,
      2
    )
  );
}
