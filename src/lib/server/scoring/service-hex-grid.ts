import type { ResidentialDemandPoint } from './types';
import type {
  IslandServiceHexes,
  ServiceDemandCategory,
  ServiceDemandStatus
} from '$components/mobility/island-services';

import { scoringConfig } from './config';

type Coordinate = [number, number];

export type ServiceHexInput = {
  coordinates: Coordinate;
  weights: Record<ServiceDemandCategory, number>;
  coverageWeights?: Record<ServiceDemandCategory, number>;
  statuses: Record<ServiceDemandCategory, ServiceDemandStatus>;
};

type LocalPoint = { x: number; y: number };
type Polygon = Coordinate[][];
type ParsedGeometry = {
  polygons: Polygon[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};
type PreparedHexCell = {
  id: string;
  center: LocalPoint;
  polygon: Coordinate[][];
};
type PreparedHexGrid = {
  cells: PreparedHexCell[];
  influenceRadius: number;
};

type ServiceInfluenceField = { cells: Uint32Array; weights: Float64Array };
type ServiceInfluenceCache = { fields: Map<string, ServiceInfluenceField>; bytes: number };

const HEX_RADIUS_METERS = 18;
const METERS_PER_DEGREE_LATITUDE = 110_574;
const METERS_PER_DEGREE_LONGITUDE = 111_320;
const HEX_X_SPACING = Math.sqrt(3) * HEX_RADIUS_METERS;
const HEX_Y_SPACING = HEX_RADIUS_METERS * 1.5;
const parsedGeometryCache = new WeakMap<object, ParsedGeometry>();
const preparedHexGridCache = new WeakMap<ParsedGeometry, Map<string, PreparedHexGrid>>();
const residentialDensityCache = new WeakMap<PreparedHexGrid, WeakMap<readonly ResidentialDemandPoint[], number[]>>();
const serviceInfluenceCache = new WeakMap<PreparedHexGrid, ServiceInfluenceCache>();
const MAX_SERVICE_FIELDS = 512;
const MAX_SERVICE_FIELD_BYTES = 8 * 1024 * 1024;

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

function parseRing(value: unknown): Coordinate[] | null {
  if (!Array.isArray(value)) return null;
  const ring = value.filter(isCoordinate);
  return ring.length >= 3 ? ring : null;
}

function parsePolygon(value: unknown): Polygon | null {
  if (!Array.isArray(value)) return null;
  const rings = value.map(parseRing).filter((ring): ring is Coordinate[] => ring !== null);
  return rings.length > 0 ? rings : null;
}

function parseGeometry(geometry: unknown): ParsedGeometry | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const cached = parsedGeometryCache.get(geometry);
  if (cached) return cached;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  const polygons =
    candidate.type === 'Polygon'
      ? [parsePolygon(candidate.coordinates)].filter((polygon): polygon is Polygon => polygon !== null)
      : candidate.type === 'MultiPolygon'
        ? (Array.isArray(candidate.coordinates) ? candidate.coordinates : [])
            .map(parsePolygon)
            .filter((polygon): polygon is Polygon => polygon !== null)
        : [];
  if (polygons.length === 0) return null;

  const coordinates = polygons.flat(2);
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const parsed = {
    polygons,
    bounds: {
      minX: Math.min(...longitudes),
      minY: Math.min(...latitudes),
      maxX: Math.max(...longitudes),
      maxY: Math.max(...latitudes)
    }
  };
  parsedGeometryCache.set(geometry, parsed);
  return parsed;
}

function toLocal(coordinate: Coordinate, origin: Coordinate): LocalPoint {
  const longitudeScale = METERS_PER_DEGREE_LONGITUDE * Math.cos((origin[1] * Math.PI) / 180);
  return {
    x: (coordinate[0] - origin[0]) * longitudeScale,
    y: (coordinate[1] - origin[1]) * METERS_PER_DEGREE_LATITUDE
  };
}

function fromLocal(point: LocalPoint, origin: Coordinate): Coordinate {
  const longitudeScale = METERS_PER_DEGREE_LONGITUDE * Math.cos((origin[1] * Math.PI) / 180);
  return [origin[0] + point.x / longitudeScale, origin[1] + point.y / METERS_PER_DEGREE_LATITUDE];
}

function pointInRing(point: Coordinate, ring: Coordinate[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index] ?? [0, 0];
    const [previousX, previousY] = ring[previous] ?? [0, 0];
    const intersects =
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y || Number.EPSILON) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: Coordinate, polygons: Polygon[]): boolean {
  return polygons.some(([outer, ...holes]) => {
    if (!outer || !pointInRing(point, outer)) return false;
    return !holes.some((hole) => pointInRing(point, hole));
  });
}

function hexCenter(column: number, row: number): LocalPoint {
  return {
    x: (column + (Math.abs(row) % 2 === 1 ? 0.5 : 0)) * HEX_X_SPACING,
    y: row * HEX_Y_SPACING
  };
}

function hexVertices(center: LocalPoint, includeClosingPoint = false): LocalPoint[] {
  const vertices = Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return {
      x: center.x + HEX_RADIUS_METERS * Math.cos(angle),
      y: center.y + HEX_RADIUS_METERS * Math.sin(angle)
    };
  });
  return includeClosingPoint ? [...vertices, vertices[0] as LocalPoint] : vertices;
}

function hexPolygon(center: LocalPoint, origin: Coordinate): Coordinate[][] {
  const coordinates = hexVertices(center, true).map((vertex) => fromLocal(vertex, origin));
  return [coordinates];
}

function prepareHexGrid(parsedGeometry: ParsedGeometry, origin: Coordinate): PreparedHexGrid {
  const serviceSigma = scoringConfig.serviceHeatmap.serviceInfluenceSigmaMeters;
  const residentialSigma = scoringConfig.serviceHeatmap.residentialInfluenceSigmaMeters;
  const influenceRadius = Math.max(serviceSigma, residentialSigma) * 3.2;
  const cacheKey = `${origin[0]}:${origin[1]}:${serviceSigma}:${residentialSigma}`;
  let grids = preparedHexGridCache.get(parsedGeometry);
  if (!grids) {
    grids = new Map();
    preparedHexGridCache.set(parsedGeometry, grids);
  }
  const cached = grids.get(cacheKey);
  if (cached) return cached;

  const localBounds = {
    minX: toLocal([parsedGeometry.bounds.minX, origin[1]], origin).x - influenceRadius,
    minY: toLocal([origin[0], parsedGeometry.bounds.minY], origin).y - influenceRadius,
    maxX: toLocal([parsedGeometry.bounds.maxX, origin[1]], origin).x + influenceRadius,
    maxY: toLocal([origin[0], parsedGeometry.bounds.maxY], origin).y + influenceRadius
  };
  const cells: PreparedHexCell[] = [];
  for (
    let row = Math.floor(localBounds.minY / HEX_Y_SPACING) - 1;
    row <= Math.ceil(localBounds.maxY / HEX_Y_SPACING) + 1;
    row += 1
  ) {
    for (
      let column = Math.floor(localBounds.minX / HEX_X_SPACING) - 1;
      column <= Math.ceil(localBounds.maxX / HEX_X_SPACING) + 1;
      column += 1
    ) {
      const center = hexCenter(column, row);
      if (!pointInGeometry(fromLocal(center, origin), parsedGeometry.polygons)) continue;
      cells.push({ id: `${row}:${column}`, center, polygon: hexPolygon(center, origin) });
    }
  }

  const prepared = { cells, influenceRadius };
  grids.set(cacheKey, prepared);
  return prepared;
}

function combineStatuses(statuses: ServiceDemandStatus[]): ServiceDemandStatus {
  if (statuses.some((status) => status === 'numeric')) return 'numeric';
  if (statuses.some((status) => status === 'partial')) return 'partial';
  return 'unavailable';
}

function normalize(values: number[]): number[] {
  const maximum = Math.max(0, ...values);
  return maximum === 0 ? values.map(() => 0) : values.map((value) => Number((value / maximum).toFixed(3)));
}

function boundFacilityPressure(values: number[]): number[] {
  return values.map((value) => Number(Math.min(1, Math.max(0, value)).toFixed(3)));
}

function influence(distance: number, sigma: number): number {
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

function serviceInfluences(
  grid: PreparedHexGrid,
  origin: Coordinate,
  coordinates: Coordinate,
  sigma: number
): ServiceInfluenceField {
  const key = `${coordinates[0]}:${coordinates[1]}`;
  let cache = serviceInfluenceCache.get(grid);
  if (!cache) {
    cache = { fields: new Map(), bytes: 0 };
    serviceInfluenceCache.set(grid, cache);
  }
  const cached = cache.fields.get(key);
  if (cached) {
    cache.fields.delete(key);
    cache.fields.set(key, cached);
    return cached;
  }
  const point = toLocal(coordinates, origin);
  const cells: number[] = [];
  const weights: number[] = [];
  for (let index = 0; index < grid.cells.length; index += 1) {
    const { center } = grid.cells[index]!;
    const distance = Math.hypot(center.x - point.x, center.y - point.y);
    if (distance > grid.influenceRadius) continue;
    cells.push(index);
    weights.push(influence(distance, sigma));
  }
  const field = { cells: Uint32Array.from(cells), weights: Float64Array.from(weights) };
  const bytes = field.cells.byteLength + field.weights.byteLength;
  if (bytes > MAX_SERVICE_FIELD_BYTES) return field;
  while (cache.fields.size >= MAX_SERVICE_FIELDS || cache.bytes + bytes > MAX_SERVICE_FIELD_BYTES) {
    const oldest = cache.fields.keys().next().value;
    if (oldest === undefined) break;
    const evicted = cache.fields.get(oldest)!;
    cache.bytes -= evicted.cells.byteLength + evicted.weights.byteLength;
    cache.fields.delete(oldest);
  }
  cache.fields.set(key, field);
  cache.bytes += bytes;
  return field;
}

type LocalResidentialPoint = ResidentialDemandPoint & { point: LocalPoint };
type ResidentialPointBuckets = Map<string, LocalResidentialPoint[]>;

function residentialBucketKey(x: number, y: number, bucketSize: number): string {
  return `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
}

function residentialPointBuckets(
  points: readonly LocalResidentialPoint[],
  bucketSize: number
): ResidentialPointBuckets {
  const buckets: ResidentialPointBuckets = new Map();
  for (const point of points) {
    const key = residentialBucketKey(point.point.x, point.point.y, bucketSize);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  return buckets;
}

function nearbyResidentialPoints(
  buckets: ResidentialPointBuckets,
  center: LocalPoint,
  bucketSize: number
): LocalResidentialPoint[] {
  const column = Math.floor(center.x / bucketSize);
  const row = Math.floor(center.y / bucketSize);
  const points: LocalResidentialPoint[] = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const bucket = buckets.get(`${column + columnOffset}:${row + rowOffset}`);
      if (bucket) points.push(...bucket);
    }
  }
  return points;
}

function residentialDensities(
  grid: PreparedHexGrid,
  origin: Coordinate,
  points: readonly ResidentialDemandPoint[],
  sigma: number
): number[] {
  if (points.length === 0) return grid.cells.map(() => 0);
  let byPoints = residentialDensityCache.get(grid);
  if (!byPoints) {
    byPoints = new WeakMap();
    residentialDensityCache.set(grid, byPoints);
  }
  const cached = byPoints.get(points);
  if (cached) return cached;

  const localPoints = points.map((point) => ({ ...point, point: toLocal(point.coordinates, origin) }));
  const buckets = residentialPointBuckets(localPoints, grid.influenceRadius);
  const densities = grid.cells.map(({ center }) =>
    nearbyResidentialPoints(buckets, center, grid.influenceRadius).reduce((sum, point) => {
      const distance = Math.hypot(center.x - point.point.x, center.y - point.point.y);
      if (distance > grid.influenceRadius) return sum;
      return sum + Math.max(0, point.weight) * influence(distance, sigma);
    }, 0)
  );
  byPoints.set(points, densities);
  return densities;
}

function combinedHeatValue(
  facilityPressure: number,
  residentialAccessGap: number,
  hasFacilityPressure: boolean,
  hasResidentialAccessGap: boolean
): number {
  if (!hasFacilityPressure) return residentialAccessGap;
  if (!hasResidentialAccessGap) return facilityPressure;

  const facilityWeight = scoringConfig.serviceHeatmap.facilityPressureWeight;
  const accessGapWeight = scoringConfig.serviceHeatmap.residentialAccessGapWeight;
  const totalWeight = facilityWeight + accessGapWeight;
  if (totalWeight <= 0) return facilityPressure;
  return Number(
    ((facilityPressure * facilityWeight + residentialAccessGap * accessGapWeight) / totalWeight).toFixed(3)
  );
}

function combinedStatus(statuses: ServiceDemandStatus[], hasResidentialData: boolean): ServiceDemandStatus {
  const serviceStatus = combineStatuses(statuses);
  if (serviceStatus !== 'unavailable') return serviceStatus;
  return hasResidentialData ? 'partial' : 'unavailable';
}

function coverageAdjustedFacilityPressure(
  facilityPressure: number,
  serviceCoverage: number,
  hasResidentialData: boolean,
  hasCoverageData: boolean
): number {
  if (hasResidentialData || !hasCoverageData) return facilityPressure;
  const coverage = Math.min(1, Math.max(0, serviceCoverage));
  const relief = coverage * scoringConfig.serviceHeatmap.coverageReliefWeight;
  return Number((facilityPressure * (1 - relief)).toFixed(3));
}

export function buildServiceDemandHexes(
  geometry: unknown,
  islandCentroid: Coordinate,
  services: readonly ServiceHexInput[],
  residentialPoints: readonly ResidentialDemandPoint[] = []
): IslandServiceHexes {
  const parsedGeometry = parseGeometry(geometry);
  if (!parsedGeometry || (services.length === 0 && residentialPoints.length === 0)) {
    return { type: 'FeatureCollection', features: [] };
  }

  const origin = islandCentroid;
  const preparedGrid = prepareHexGrid(parsedGeometry, origin);
  const serviceSigma = scoringConfig.serviceHeatmap.serviceInfluenceSigmaMeters;
  const residentialSigma = scoringConfig.serviceHeatmap.residentialInfluenceSigmaMeters;
  // Housing and island geometry are immutable across a draft. Reuse their field
  // when only facilities change, instead of repeating every building/hex distance.
  const densities = residentialDensities(preparedGrid, origin, residentialPoints, residentialSigma);

  const rawFeatures = preparedGrid.cells.map((cell) => ({
    id: cell.id,
    polygon: cell.polygon,
    facilityPressure: { health: 0, education: 0, transport: 0 },
    residentialAccessGap: { health: 0, education: 0, transport: 0 },
    serviceCoverage: { health: 0, education: 0, transport: 0 },
    hasCoverageData: { health: false, education: false, transport: false },
    statuses: { health: [], education: [], transport: [] }
  })) as Array<{
    id: string;
    polygon: Coordinate[][];
    facilityPressure: Record<ServiceDemandCategory, number>;
    residentialAccessGap: Record<ServiceDemandCategory, number>;
    serviceCoverage: Record<ServiceDemandCategory, number>;
    hasCoverageData: Record<ServiceDemandCategory, boolean>;
    statuses: Record<ServiceDemandCategory, ServiceDemandStatus[]>;
  }>;
  for (const service of services) {
    const field = serviceInfluences(preparedGrid, origin, service.coordinates, serviceSigma);
    for (let index = 0; index < field.cells.length; index += 1) {
      const feature = rawFeatures[field.cells[index]!]!;
      const serviceInfluence = field.weights[index]!;
      for (const category of ['health', 'education', 'transport'] as const) {
        if (service.statuses[category] !== 'unavailable') feature.statuses[category].push(service.statuses[category]);
        feature.facilityPressure[category] += service.weights[category] * serviceInfluence;
        const coverageWeight = service.coverageWeights?.[category];
        if (coverageWeight !== undefined) feature.hasCoverageData[category] = true;
        feature.serviceCoverage[category] = Math.max(
          feature.serviceCoverage[category],
          Math.min(1, Math.max(0, coverageWeight ?? service.weights[category])) * serviceInfluence
        );
      }
    }
  }

  for (const [cellIndex, feature] of rawFeatures.entries()) {
    const residentialDensity = densities[cellIndex] ?? 0;
    for (const category of ['health', 'education', 'transport'] as const) {
      feature.residentialAccessGap[category] = residentialDensity * (1 - feature.serviceCoverage[category]);
    }
  }

  const hasResidentialData = residentialPoints.length > 0;
  const normalizedValues = {
    facilityPressure: {
      health: boundFacilityPressure(rawFeatures.map((feature) => feature.facilityPressure.health)),
      education: boundFacilityPressure(rawFeatures.map((feature) => feature.facilityPressure.education)),
      transport: boundFacilityPressure(rawFeatures.map((feature) => feature.facilityPressure.transport))
    },
    residentialAccessGap: {
      health: normalize(rawFeatures.map((feature) => feature.residentialAccessGap.health)),
      education: normalize(rawFeatures.map((feature) => feature.residentialAccessGap.education)),
      transport: normalize(rawFeatures.map((feature) => feature.residentialAccessGap.transport))
    }
  };
  const healthPressures = rawFeatures.map((feature, index) =>
    coverageAdjustedFacilityPressure(
      normalizedValues.facilityPressure.health[index] ?? 0,
      feature.serviceCoverage.health,
      hasResidentialData,
      feature.hasCoverageData.health
    )
  );
  const educationPressures = rawFeatures.map((feature, index) =>
    coverageAdjustedFacilityPressure(
      normalizedValues.facilityPressure.education[index] ?? 0,
      feature.serviceCoverage.education,
      hasResidentialData,
      feature.hasCoverageData.education
    )
  );

  const hasFacilityPressure = {
    health: healthPressures.some((value) => value > 0),
    education: educationPressures.some((value) => value > 0),
    transport: normalizedValues.facilityPressure.transport.some((value) => value > 0)
  };
  const hasResidentialAccessGap = {
    health: normalizedValues.residentialAccessGap.health.some((value) => value > 0),
    education: normalizedValues.residentialAccessGap.education.some((value) => value > 0),
    transport: normalizedValues.residentialAccessGap.transport.some((value) => value > 0)
  };

  return {
    type: 'FeatureCollection',
    features: rawFeatures.map((feature, index) => {
      const healthWeight = combinedHeatValue(
        healthPressures[index] ?? 0,
        normalizedValues.residentialAccessGap.health[index] ?? 0,
        hasFacilityPressure.health,
        hasResidentialAccessGap.health
      );
      const educationWeight = combinedHeatValue(
        educationPressures[index] ?? 0,
        normalizedValues.residentialAccessGap.education[index] ?? 0,
        hasFacilityPressure.education,
        hasResidentialAccessGap.education
      );
      const transportWeight = combinedHeatValue(
        normalizedValues.facilityPressure.transport[index] ?? 0,
        normalizedValues.residentialAccessGap.transport[index] ?? 0,
        hasFacilityPressure.transport,
        hasResidentialAccessGap.transport
      );
      const statuses = {
        healthStatus: combinedStatus(feature.statuses.health, hasResidentialData),
        educationStatus: combinedStatus(feature.statuses.education, hasResidentialData),
        transportStatus: combinedStatus(feature.statuses.transport, hasResidentialData)
      };
      return {
        type: 'Feature' as const,
        id: feature.id,
        geometry: { type: 'Polygon' as const, coordinates: feature.polygon },
        properties: {
          healthWeight,
          educationWeight,
          transportWeight,
          allWeight: Math.max(healthWeight, educationWeight, transportWeight),
          ...statuses,
          allStatus: combineStatuses([statuses.healthStatus, statuses.educationStatus, statuses.transportStatus])
        }
      };
    })
  };
}
