import type { DemandAllocationResult, ResidentialDemandPoint, ScoringSnapshot } from './types';
import type {
  IslandMapService,
  IslandServiceDemand,
  IslandServicesResponse,
  ServiceDemandCategory,
  ServiceDemandStatus
} from '$components/mobility/island-services';
import type { Island } from '$models';

import { serviceEligibility } from '$lib/server/mobility/service-rules';

import { scoringConfig } from './config';
import { loadIslandContext, loadScoringSnapshot } from './database-input';
import { buildDemandAllocation } from './demand-allocation';
import { healthDemandLayer, healthServiceTargetSubtypes } from './health-demand';
import { buildServiceDemandHexes } from './service-hex-grid';
import { calculateTransportDemand } from './transport-demand';

type Coordinate = [number, number];
const islandGeometryCache = new Map<string, { source: string; geometry: unknown }>();
const residentialPointsCache = new WeakMap<ScoringSnapshot, Map<string, ResidentialDemandPoint[]>>();

export type IslandServiceIslandRow = {
  island: Island;
  atollName: string;
};

type AllocationTotals = {
  local: number;
  inbound: number;
  byNeed: Record<string, number>;
};

type HealthAllocationTotals = {
  baseline: AllocationTotals;
  younger: AllocationTotals;
  specialist: AllocationTotals;
};

export class IslandServicesNotFoundError extends Error {
  constructor(islandId: string) {
    super(`Island ${islandId} was not found`);
    this.name = 'IslandServicesNotFoundError';
  }
}

export function combinedDemandStatus(demands: readonly Pick<IslandServiceDemand, 'status'>[]): ServiceDemandStatus {
  if (demands.some((demand) => demand.status === 'numeric')) return 'numeric';
  if (demands.some((demand) => demand.status === 'partial')) return 'partial';
  return 'unavailable';
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function finiteCoordinate(longitude: number | null, latitude: number | null): Coordinate | null {
  if (
    longitude === null ||
    latitude === null ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return [longitude, latitude];
}

function emptyDemand(source: IslandServiceDemand['source'] = 'unavailable'): IslandServiceDemand {
  return {
    value: null,
    local: null,
    inbound: null,
    connected: null,
    transfer: null,
    careTransfer: null,
    educationTransfer: null,
    total: null,
    loadRatio: null,
    score: null,
    status: 'unavailable',
    source,
    byNeed: {}
  };
}

function emptyAllocationTotals(): AllocationTotals {
  return { local: 0, inbound: 0, byNeed: {} };
}

function addAllocationToTotals(
  target: AllocationTotals,
  allocation: { originIslandId: string; demand: number },
  islandId: string,
  needKey: string
): void {
  const field = allocation.originIslandId === islandId ? 'local' : 'inbound';
  target[field] += allocation.demand;
  target.byNeed[needKey] = (target.byNeed[needKey] ?? 0) + allocation.demand;
}

function aggregatePopulationDemand(
  allocations: DemandAllocationResult,
  islandId: string
): Map<string, AllocationTotals> {
  const totals = new Map<string, AllocationTotals>();

  for (const allocation of [...allocations.byOriginCohort.values(), ...allocations.educationOverlays]) {
    if (
      allocation.destinationIslandId !== islandId ||
      allocation.category !== 'education' ||
      !allocation.serviceSubtype
    ) {
      continue;
    }

    const key = `${allocation.category}:${allocation.serviceSubtype}`;
    const current = totals.get(key) ?? emptyAllocationTotals();
    addAllocationToTotals(current, allocation, islandId, allocation.needKey);
    totals.set(key, current);
  }

  return totals;
}

function aggregateHealthDemand(allocations: DemandAllocationResult, islandId: string): HealthAllocationTotals {
  const totals: HealthAllocationTotals = {
    baseline: emptyAllocationTotals(),
    younger: emptyAllocationTotals(),
    specialist: emptyAllocationTotals()
  };

  for (const allocation of [...allocations.byOriginNeed.values(), ...allocations.hospitalOverlays]) {
    if (allocation.category !== 'health' || allocation.destinationIslandId !== islandId) continue;
    const layer = healthDemandLayer(allocation.needKey);
    if (!layer) continue;
    addAllocationToTotals(totals[layer], allocation, islandId, allocation.needKey);
  }

  return totals;
}

function populationDemandForService(
  service: { serviceType: 'health' | 'education'; subtype: string },
  servicesOnIsland: Array<{ serviceType: string; subtype: string }>,
  population: number | null,
  totals: Map<string, AllocationTotals>
): IslandServiceDemand {
  if (population === null) return emptyDemand('population-allocation');

  const matchingCount = servicesOnIsland.filter(
    (entry) => entry.serviceType === service.serviceType && entry.subtype === service.subtype
  ).length;
  const allocation = totals.get(`${service.serviceType}:${service.subtype}`);
  const share = matchingCount > 0 ? 1 / matchingCount : 0;
  const local = (allocation?.local ?? 0) * share;
  const inbound = (allocation?.inbound ?? 0) * share;
  const byNeed = Object.fromEntries(
    Object.entries(allocation?.byNeed ?? {}).map(([key, value]) => [key, round(value * share)])
  );
  const total = local + inbound;

  return {
    value: round(total),
    local: round(local),
    inbound: round(inbound),
    connected: null,
    transfer: null,
    careTransfer: null,
    educationTransfer: null,
    total: round(total),
    loadRatio: null,
    score: null,
    status: 'partial',
    source: 'population-allocation',
    byNeed
  };
}

function healthDemandForService(
  service: { serviceType: 'health'; subtype: string },
  servicesOnIsland: Array<{ serviceType: string; subtype: string }>,
  population: number | null,
  totals: HealthAllocationTotals
): IslandServiceDemand {
  if (population === null) return emptyDemand('population-allocation');

  const healthServices = servicesOnIsland.filter((entry) => entry.serviceType === 'health');
  const availableSubtypes = healthServices.map((entry) => entry.subtype);
  const layers = [
    {
      name: 'baseline' as const,
      targets: healthServiceTargetSubtypes('primary', availableSubtypes)
    },
    {
      name: 'younger' as const,
      targets: healthServiceTargetSubtypes('maternal_child', availableSubtypes)
    },
    {
      name: 'specialist' as const,
      targets: healthServiceTargetSubtypes('hospital_emergency', availableSubtypes)
    }
  ];
  const byNeed: Record<string, number> = {};
  let local = 0;
  let inbound = 0;

  for (const layer of layers) {
    if (!layer.targets.includes(service.subtype as (typeof layer.targets)[number])) continue;
    const targetCount = healthServices.filter((entry) =>
      layer.targets.includes(entry.subtype as (typeof layer.targets)[number])
    ).length;
    if (targetCount === 0) continue;

    const allocation = totals[layer.name];
    const share = 1 / targetCount;
    local += allocation.local * share;
    inbound += allocation.inbound * share;
    for (const [needKey, value] of Object.entries(allocation.byNeed)) {
      byNeed[needKey] = (byNeed[needKey] ?? 0) + value * share;
    }
  }

  const total = local + inbound;
  return {
    value: round(total),
    local: round(local),
    inbound: round(inbound),
    connected: null,
    transfer: null,
    careTransfer: null,
    educationTransfer: null,
    total: round(total),
    loadRatio: null,
    score: null,
    status: 'partial',
    source: 'population-allocation',
    byNeed: Object.fromEntries(Object.entries(byNeed).map(([key, value]) => [key, round(value)]))
  };
}

function transportDemandForService(
  serviceId: string,
  stops: ReturnType<typeof calculateTransportDemand>['stops']
): IslandServiceDemand {
  const stop = stops.find((entry) => entry.stopId === serviceId);
  if (!stop) return emptyDemand();

  const transportFlowDemand = stop.careTransferDemand + stop.educationTransferDemand;
  return {
    value:
      transportFlowDemand === 0 && (stop.departureTransferDemand === null || stop.arrivalTransferDemand === null)
        ? null
        : round(transportFlowDemand),
    outbound: stop.outboundDemand,
    limitation: stop.limitation,
    local: round(stop.localDemand),
    inbound: stop.arrivalTransferDemand,
    connected: round(stop.connectedDemand),
    transfer: round(stop.careTransferDemand + stop.educationTransferDemand),
    careTransfer: round(stop.careTransferDemand),
    educationTransfer: round(stop.educationTransferDemand),
    total: round(stop.totalDemand),
    loadRatio: round(stop.loadRatio),
    score: round(stop.score),
    status: stop.status,
    source: 'transport-stop',
    byNeed: {}
  };
}

export function normalizeDemandWeights(
  values: readonly (number | null)[],
  reference: readonly (number | null)[] = values
): number[] {
  const availableCount = reference.filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0
  ).length;
  const share = round(1 / Math.max(1, availableCount));
  return values.map((value) => (value === null || !Number.isFinite(value) || value <= 0 ? 0 : share));
}

export function normalizeProportionalDemandWeights(
  values: readonly (number | null)[],
  reference: readonly (number | null)[] = values
): number[] {
  const total = reference.reduce<number>(
    (sum, value) => sum + (value !== null && Number.isFinite(value) && value > 0 ? value : 0),
    0
  );
  return values.map((value) =>
    value === null || !Number.isFinite(value) || value <= 0 ? 0 : round(value / (total > 0 ? total : 1))
  );
}

function buildPopulationDemand(
  service: { serviceType: 'education'; subtype: string },
  servicesOnIsland: Array<{ serviceType: string; subtype: string }>,
  population: number | null,
  totals: Map<string, AllocationTotals>
): IslandServiceDemand {
  return populationDemandForService(service, servicesOnIsland, population, totals);
}

function serviceCoverageWeights(service: { serviceType: string; subtype: string }) {
  return {
    health:
      service.serviceType === 'health'
        ? (scoringConfig.healthQuality[service.subtype as keyof typeof scoringConfig.healthQuality] ?? 0)
        : 0,
    education:
      service.serviceType === 'education'
        ? (scoringConfig.educationHeatmapCoverage[
            service.subtype as keyof typeof scoringConfig.educationHeatmapCoverage
          ] ?? 0)
        : 0,
    transport: service.serviceType === 'transport' ? 1 : 0
  } satisfies Record<ServiceDemandCategory, number>;
}

function islandGeometry(_snapshot: ScoringSnapshot, islandId: string, geoJson: string): unknown {
  const cached = islandGeometryCache.get(islandId);
  if (cached?.source === geoJson) return cached.geometry;
  let geometry: unknown = null;
  try {
    geometry = JSON.parse(geoJson) as unknown;
  } catch {
    // Invalid optional geometry produces no heatmap rather than failing the services response.
  }
  islandGeometryCache.set(islandId, { source: geoJson, geometry });
  return geometry;
}

function residentialPointsForIsland(snapshot: ScoringSnapshot, islandId: string): ResidentialDemandPoint[] {
  let pointsByIsland = residentialPointsCache.get(snapshot);
  if (!pointsByIsland) {
    pointsByIsland = new Map();
    residentialPointsCache.set(snapshot, pointsByIsland);
  }
  const cached = pointsByIsland.get(islandId);
  if (cached) return cached;
  const points = snapshot.residentialDemandPoints?.filter((point) => point.islandId === islandId) ?? [];
  pointsByIsland.set(islandId, points);
  return points;
}

export async function getIslandServices(
  islandId: string,
  snapshotOverride: ScoringSnapshot | undefined = undefined,
  islandRowOverride: IslandServiceIslandRow | undefined = undefined,
  heatmapReference?: readonly IslandMapService[]
): Promise<IslandServicesResponse> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new IslandServicesNotFoundError(islandId);

  const [snapshot, islandRow] = await Promise.all([
    snapshotOverride
      ? Promise.resolve(snapshotOverride)
      : loadScoringSnapshot({ includeResidentialDemandPoints: true }),
    islandRowOverride ? Promise.resolve(islandRowOverride) : loadIslandContext(normalizedId)
  ]);
  if (!islandRow) throw new IslandServicesNotFoundError(normalizedId);

  const allocations = buildDemandAllocation(snapshot);
  const transportDemand = calculateTransportDemand(normalizedId, snapshot, allocations);
  const services = snapshot.services
    .filter((service) => service.islandId === normalizedId)
    .sort(
      (left, right) =>
        left.serviceType.localeCompare(right.serviceType) ||
        left.subtype.localeCompare(right.subtype) ||
        left.id.localeCompare(right.id)
    );
  const population = allocations.byIsland.get(normalizedId)?.population ?? null;
  // Canonical resident allocations only: omit destination overlays and terminal shares.
  // Unlike legacy aggregate education.local, local here means served on this island.
  const planningDemand: NonNullable<IslandServicesResponse['planningDemand']> | null =
    population === null
      ? null
      : {
          health: { local: 0, outbound: 0, unserved: 0 },
          education: { local: 0, outbound: 0, unserved: 0 }
        };
  if (planningDemand) {
    const residentAllocations = [
      ...[...allocations.byOriginNeed.values()].filter(
        (allocation) => allocation.category === 'health' && ['primary', 'chronic_elderly'].includes(allocation.needKey)
      ),
      ...[...allocations.byOriginCohort.values()].filter((allocation) => allocation.category === 'education')
    ];
    for (const allocation of residentAllocations) {
      if (allocation.originIslandId !== normalizedId) continue;
      const field =
        allocation.destinationIslandId === null
          ? 'unserved'
          : allocation.destinationIslandId === normalizedId
            ? 'local'
            : 'outbound';
      planningDemand[allocation.category][field] += allocation.demand;
    }
  }
  const populationTotals = aggregatePopulationDemand(allocations, normalizedId);
  const healthTotals = aggregateHealthDemand(allocations, normalizedId);
  const transportStops = transportDemand.stops;
  const servicesForMatching = services.map((service) => ({
    serviceType: service.serviceType,
    subtype: service.subtype
  }));

  const mapServices: IslandMapService[] = services.map((service) => {
    const coordinates = finiteCoordinate(service.longitude, service.latitude);
    const demand = {
      health:
        service.serviceType === 'health'
          ? healthDemandForService(
              { serviceType: 'health', subtype: service.subtype },
              servicesForMatching,
              population,
              healthTotals
            )
          : emptyDemand(),
      education:
        service.serviceType === 'education'
          ? buildPopulationDemand(
              { serviceType: 'education', subtype: service.subtype },
              servicesForMatching,
              population,
              populationTotals
            )
          : emptyDemand(),
      transport:
        service.serviceType === 'transport' ? transportDemandForService(service.id, transportStops) : emptyDemand()
    } satisfies Record<ServiceDemandCategory, IslandServiceDemand>;

    return {
      id: service.id,
      serviceType: service.serviceType as ServiceDemandCategory,
      subtype: service.subtype,
      name: service.name,
      coordinates,
      change: 'unchanged',
      eligibility: serviceEligibility(service),
      demand
    };
  });

  const mappedIds = new Set(mapServices.map((service) => service.id));
  for (const stop of snapshot.transportStops) {
    if (stop.islandId !== normalizedId || mappedIds.has(stop.id)) continue;
    const coordinates = finiteCoordinate(stop.longitude, stop.latitude);
    if (!coordinates) continue;
    mappedIds.add(stop.id);
    mapServices.push({
      id: stop.id,
      serviceType: 'transport',
      subtype: stop.subtype,
      name: stop.name,
      coordinates,
      change: 'unchanged',
      eligibility: {
        canUpgrade: false,
        upgrades: [],
        canDowngrade: false,
        downgrades: [],
        canMove: false,
        canDelete: false
      },
      demand: {
        health: emptyDemand(),
        education: emptyDemand(),
        transport: transportDemandForService(stop.id, transportStops)
      }
    });
  }

  // A preview uses baseline denominators instead of independently stretching its
  // service weights. A zero baseline uses a fixed unit reference, never the draft maximum.
  const reference = heatmapReference ?? mapServices;
  const healthWeights = normalizeProportionalDemandWeights(
    mapServices.map((service) => service.demand.health.value),
    reference.map((service) => service.demand.health.value)
  );
  const educationWeights = normalizeDemandWeights(
    mapServices.map((service) => service.demand.education.value),
    reference.map((service) => service.demand.education.value)
  );
  const transportWeights = normalizeProportionalDemandWeights(
    mapServices.map((service) => service.demand.transport.value),
    reference.map((service) => service.demand.transport.value)
  );
  const geometry = islandGeometry(snapshot, normalizedId, islandRow.island.geoJson);
  const islandResidentialPoints = residentialPointsForIsland(snapshot, normalizedId);
  const hexes = buildServiceDemandHexes(
    geometry,
    [islandRow.island.longitude, islandRow.island.latitude],
    mapServices.flatMap((service, index) =>
      service.coordinates
        ? [
            {
              coordinates: service.coordinates,
              projectTransportHeatToLand: service.serviceType === 'transport',
              weights: {
                health: healthWeights[index] ?? 0,
                education: educationWeights[index] ?? 0,
                transport: transportWeights[index] ?? 0
              },
              coverageWeights: serviceCoverageWeights(service),
              statuses: {
                health: service.demand.health.status,
                education: service.demand.education.status,
                transport: service.demand.transport.status
              }
            }
          ]
        : []
    ),
    islandResidentialPoints
  );
  const numericDemandCount = mapServices.filter((service) =>
    Object.values(service.demand).some((demand) => demand.value !== null)
  ).length;
  const unavailableDemandCount = mapServices.filter((service) =>
    Object.values(service.demand).every((demand) => demand.value === null)
  ).length;

  return {
    status: numericDemandCount > 0 ? 'partial' : 'unavailable',
    planningDemand,
    island: {
      id: islandRow.island.id,
      name: islandRow.island.name,
      atollName: islandRow.atollName,
      centroid: [islandRow.island.longitude, islandRow.island.latitude]
    },
    services: mapServices,
    hexes,
    summary: {
      serviceCount: mapServices.length,
      mappedCoordinateCount: mapServices.filter((service) => service.coordinates !== null).length,
      hexFeatureCount: hexes.features.length,
      numericDemandCount,
      unavailableDemandCount,
      residentialBuildingCount: islandResidentialPoints.length
    },
    limitations: [
      'Health and education demand is an age-based population proxy, not measured facility usage.',
      'Health map demand uses a non-elderly baseline, a children/adolescents clinic preference, and hospital-only elderly/emergency overlays; elderly overlays can intentionally increase central and nearest-hospital inbound demand. Education map demand routes each required level through eligible paths and uses same-atoll or Malé/Hulhumalé overlays when route evidence is missing.',
      'Transport demand uses estimated stop capacity and load proxies.',
      'Terminal care transfers belong to transport demand, not healthcare facility coverage. Transfer pressure is split between evidenced departure and arrival terminals; outbound pressure is part of that transfer, not additional demand.',
      ...transportDemand.limitations,
      'Heat-map intensity combines facility demand pressure with residential building distance as a planning proxy; it does not affect island or national scores.',
      ...(islandResidentialPoints.length > 0
        ? ['Residential demand assumes one unit of population pressure per mapped residential building.']
        : [
            'No residential building artifact is available for this island; the heat map uses facility demand pressure with health and education service coverage relief.'
          ]),
      ...(mapServices.some((service) => service.coordinates === null)
        ? ['Some services are missing valid coordinates and are omitted from map layers.']
        : [])
    ]
  };
}
