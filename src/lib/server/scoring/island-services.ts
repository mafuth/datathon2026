import type { DemandAllocationResult } from './types';
import type {
  IslandServiceDemand,
  IslandServicesResponse,
  ServiceDemandCategory,
  ServiceDemandStatus
} from '$components/mobility/island-services';

import { Atoll, Island as IslandModel } from '$models';
import { eq } from 'drizzle-orm';

import db from '$lib/server/database';

import { loadScoringSnapshot } from './database-input';
import { buildDemandAllocation } from './demand-allocation';
import { calculateIslandScore } from './factors';
import { buildServiceDemandHexes } from './service-hex-grid';

type Coordinate = [number, number];

type AllocationTotals = {
  local: number;
  inbound: number;
  byNeed: Record<string, number>;
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
    total: null,
    loadRatio: null,
    score: null,
    status: 'unavailable',
    source,
    byNeed: {}
  };
}

function aggregatePopulationDemand(
  allocations: DemandAllocationResult,
  islandId: string
): Map<string, AllocationTotals> {
  const totals = new Map<string, AllocationTotals>();

  for (const allocation of allocations.byOriginCohort.values()) {
    if (
      allocation.destinationIslandId !== islandId ||
      (allocation.category !== 'health' && allocation.category !== 'education') ||
      !allocation.serviceSubtype
    ) {
      continue;
    }

    const key = `${allocation.category}:${allocation.serviceSubtype}`;
    const current = totals.get(key) ?? { local: 0, inbound: 0, byNeed: {} };
    const field = allocation.originIslandId === islandId ? 'local' : 'inbound';
    current[field] += allocation.demand;
    current.byNeed[allocation.needKey] = (current.byNeed[allocation.needKey] ?? 0) + allocation.demand;
    totals.set(key, current);
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
    total: round(total),
    loadRatio: null,
    score: null,
    status: 'partial',
    source: 'population-allocation',
    byNeed
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
    transfer: round(stop.careTransferDemand),
    total: round(stop.totalDemand),
    loadRatio: round(stop.loadRatio),
    score: round(stop.score),
    status: stop.status,
    source: 'transport-stop',
    byNeed: {}
  };
}

export function normalizeDemandWeights(values: readonly (number | null)[]): number[] {
  const maximum = Math.max(0, ...values.filter((value): value is number => value !== null && value > 0));
  return values.map((value) => (value === null || maximum === 0 ? 0 : round(value / maximum)));
}

function buildPopulationDemand(
  service: { serviceType: ServiceDemandCategory; subtype: string },
  servicesOnIsland: Array<{ serviceType: string; subtype: string }>,
  population: number | null,
  totals: Map<string, AllocationTotals>
): IslandServiceDemand {
  if (service.serviceType !== 'health' && service.serviceType !== 'education') return emptyDemand();
  return populationDemandForService(service, servicesOnIsland, population, totals);
}

export async function getIslandServices(islandId: string): Promise<IslandServicesResponse> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new IslandServicesNotFoundError(islandId);

  const [snapshot, islandRows] = await Promise.all([
    loadScoringSnapshot(),
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
          ? buildPopulationDemand(
              { serviceType: 'health', subtype: service.subtype },
              servicesForMatching,
              population,
              populationTotals
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
      demand
    };
  });

  const healthWeights = normalizeDemandWeights(mapServices.map((service) => service.demand.health.value));
  const educationWeights = normalizeDemandWeights(mapServices.map((service) => service.demand.education.value));
  const transportWeights = normalizeDemandWeights(mapServices.map((service) => service.demand.transport.value));
  const islandGeometry: unknown = (() => {
    try {
      return JSON.parse(islandRow.island.geoJson) as unknown;
    } catch {
      return null;
    }
  })();
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
              statuses: {
                health: service.demand.health.status,
                education: service.demand.education.status,
                transport: service.demand.transport.status
              }
            }
          ]
        : []
    )
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
      unavailableDemandCount
    },
    limitations: [
      'Health and education demand is an age-based population proxy, not measured facility usage.',
      'Population demand is divided equally between services with the same subtype because facility-level allocation is unavailable.',
      'Transport demand uses estimated stop capacity and load proxies.',
      ...(mapServices.some((service) => service.coordinates === null)
        ? ['Some services are missing valid coordinates and are omitted from map layers.']
        : [])
    ]
  };
}
