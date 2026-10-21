import type { DemandAllocationResult, ScoringSnapshot } from './types';
import type {
  IslandServiceDemand,
  IslandServicesResponse,
  ServiceDemandCategory,
  ServiceDemandStatus
} from '$components/mobility/island-services';

import { Atoll, Island as IslandModel } from '$models';
import { eq } from 'drizzle-orm';

import db from '$lib/server/database';
import { serviceEligibility } from '$lib/server/mobility/service-rules';

import { scoringConfig } from './config';
import { loadScoringSnapshot } from './database-input';
import { buildDemandAllocation } from './demand-allocation';
import { calculateIslandScore } from './factors';
import { healthDemandLayer, healthServiceTargetSubtypes } from './health-demand';
import { buildServiceDemandHexes } from './service-hex-grid';

type Coordinate = [number, number];

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
  stops: Awaited<ReturnType<typeof calculateIslandScore>>['transport']['demand']['stops']
): IslandServiceDemand {
  const stop = stops.find((entry) => entry.stopId === serviceId);
  if (!stop) return emptyDemand();

  return {
    value: round(stop.totalDemand),
    local: round(stop.localDemand),
    inbound: round(stop.connectedDemand),
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

export function normalizeDemandWeights(values: readonly (number | null)[]): number[] {
  const availableCount = values.filter(
    (value): value is number => value !== null && Number.isFinite(value) && value > 0
  ).length;
  const share = availableCount > 0 ? round(1 / availableCount) : 0;
  return values.map((value) => (value === null || !Number.isFinite(value) || value <= 0 ? 0 : share));
}

export function normalizeProportionalDemandWeights(values: readonly (number | null)[]): number[] {
  const total = values.reduce(
    (sum, value) => sum + (value !== null && Number.isFinite(value) && value > 0 ? value : 0),
    0
  );
  return total === 0
    ? values.map(() => 0)
    : values.map((value) => (value === null || !Number.isFinite(value) || value <= 0 ? 0 : round(value / total)));
}

function buildPopulationDemand(
  service: { serviceType: ServiceDemandCategory; subtype: string },
  servicesOnIsland: Array<{ serviceType: string; subtype: string }>,
  population: number | null,
  totals: Map<string, AllocationTotals>
): IslandServiceDemand {
  if (service.serviceType === 'health') return emptyDemand('population-allocation');
  if (service.serviceType !== 'education') return emptyDemand();
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
        ? (scoringConfig.educationQuality[service.subtype as keyof typeof scoringConfig.educationQuality] ?? 0)
        : 0,
    transport: service.serviceType === 'transport' ? 1 : 0
  } satisfies Record<ServiceDemandCategory, number>;
}

export async function getIslandServices(
  islandId: string,
  snapshotOverride: ScoringSnapshot | undefined = undefined
): Promise<IslandServicesResponse> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new IslandServicesNotFoundError(islandId);

  const [snapshot, islandRows] = await Promise.all([
    snapshotOverride
      ? Promise.resolve(snapshotOverride)
      : loadScoringSnapshot({ includeResidentialDemandPoints: true }),
    db
      .select({ island: IslandModel, atollName: Atoll.name })
      .from(IslandModel)
      .innerJoin(Atoll, eq(IslandModel.atollId, Atoll.id))
      .where(eq(IslandModel.id, normalizedId))
      .limit(1)
  ]);
  const islandRow = islandRows[0];
  if (!islandRow) throw new IslandServicesNotFoundError(normalizedId);

  const allocations = buildDemandAllocation(snapshot);
  const score = calculateIslandScore(normalizedId, snapshot, allocations);
  const services = snapshot.services
    .filter((service) => service.islandId === normalizedId)
    .sort(
      (left, right) =>
        left.serviceType.localeCompare(right.serviceType) ||
        left.subtype.localeCompare(right.subtype) ||
        left.id.localeCompare(right.id)
    );
  const population = allocations.byIsland.get(normalizedId)?.population ?? null;
  const populationTotals = aggregatePopulationDemand(allocations, normalizedId);
  const healthTotals = aggregateHealthDemand(allocations, normalizedId);
  const transportStops = score.transport.demand.stops;
  const servicesForMatching = services.map((service) => ({
    serviceType: service.serviceType,
    subtype: service.subtype
  }));

  const mapServices = services.map((service) => {
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

  const healthWeights = normalizeProportionalDemandWeights(mapServices.map((service) => service.demand.health.value));
  const educationWeights = normalizeDemandWeights(mapServices.map((service) => service.demand.education.value));
  const transportWeights = normalizeDemandWeights(mapServices.map((service) => service.demand.transport.value));
  const islandGeometry: unknown = (() => {
    try {
      return JSON.parse(islandRow.island.geoJson) as unknown;
    } catch {
      return null;
    }
  })();
  const islandResidentialPoints =
    snapshot.residentialDemandPoints?.filter((point) => point.islandId === normalizedId) ?? [];
  const hexes = buildServiceDemandHexes(
    islandGeometry,
    [islandRow.island.longitude, islandRow.island.latitude],
    mapServices.flatMap((service, index) =>
      service.coordinates
        ? [
            {
              coordinates: service.coordinates,
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
      'Heat-map intensity combines facility demand pressure with residential building distance as a planning proxy; it does not affect island or national scores.',
      ...(islandResidentialPoints.length > 0
        ? ['Residential demand assumes one unit of population pressure per mapped residential building.']
        : [
            'No residential building artifact is available for this island; the heat map uses facility demand pressure only.'
          ]),
      ...(mapServices.some((service) => service.coordinates === null)
        ? ['Some services are missing valid coordinates and are omitted from map layers.']
        : [])
    ]
  };
}
