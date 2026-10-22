import type { Population, Service, TransportConnection } from '../../db/models';
import type { ServiceRoute } from './hospital-routing';
import type {
  DemandAllocation,
  DemandAllocationResult,
  DemandMetric,
  DemandSummary,
  InboundDemandSource,
  ScoringSnapshot,
  ServiceScore
} from './types';

import { scoringConfig } from './config';
import { healthDemand as buildHealthDemand, healthPopulationProfile, healthServicePriority } from './health-demand';
import {
  connectionFromIsland,
  connectionRoute,
  resolveEducationRouting,
  resolveElderlyHospitalRouting
} from './hospital-routing';
import { calculationSnapshot } from './scoring-snapshot';
import { indexedPopulation, indexedServices } from './snapshot-index';

export { healthDemand } from './health-demand';

export const HEALTH_TYPES = ['hospital', 'health_center', 'clinic'] as const;
export const AIR_TRANSPORT_TYPES = ['airport', 'air_terminal', 'helipad'] as const;

const EDUCATION_SERVICE_SUBTYPES = {
  preschool: 'preschool',
  primary: 'school',
  secondary: 'high_school',
  higher_secondary: 'high_school',
  tertiary: 'tertiary'
} as const;

const demandAllocationCache = new WeakMap<ScoringSnapshot, DemandAllocationResult>();

type UniqueDemand = {
  category: 'health' | 'education';
  needKey: string;
  amount: number;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function cappedPercent(value: number, population: number | null): number | null {
  if (population === null || population <= 0) return null;
  return round(Math.min(1, Math.max(0, value / population)));
}

export function populationForIsland(snapshot: ScoringSnapshot, islandId: string): Population[] {
  return indexedPopulation(snapshot).get(islandId) ?? [];
}

export function populationAmount(records: Population[], category: string): number | null {
  return finite(records.find((record) => record.ageCategory === category)?.amount);
}

export function totalPopulation(records: Population[]): number | null {
  return (
    populationAmount(records, 'total') ??
    (records.length > 0 ? records.reduce((sum, record) => sum + record.amount, 0) : null)
  );
}

function childPopulation(records: Population[]): number {
  return populationAmount(records, 'child_population_0_14') ?? populationAmount(records, 'child_population_0_17') ?? 0;
}

export function educationDemand(records: Population[]): Record<string, number> {
  const children = childPopulation(records);
  const adolescents = populationAmount(records, 'adolescent_population_10_19') ?? children;
  const youth =
    populationAmount(records, 'youth_population_18_35') ?? populationAmount(records, 'youth_population_15_24') ?? 0;
  return {
    preschool: children,
    primary: children,
    secondary: adolescents,
    higher_secondary: adolescents,
    tertiary: youth
  };
}

function uniqueDemand(records: Population[]): UniqueDemand[] {
  const healthProfile = healthPopulationProfile(records);
  const children = healthProfile.children;
  const adolescents = populationAmount(records, 'adolescent_population_10_19') ?? children;
  const youth =
    populationAmount(records, 'youth_population_18_35') ?? populationAmount(records, 'youth_population_15_24') ?? 0;

  return [
    { category: 'health', needKey: 'maternal_child', amount: healthProfile.younger },
    { category: 'health', needKey: 'chronic_elderly', amount: healthProfile.elderly },
    { category: 'education', needKey: 'primary', amount: children },
    { category: 'education', needKey: 'secondary', amount: adolescents },
    { category: 'education', needKey: 'tertiary', amount: youth }
  ].filter((entry): entry is UniqueDemand => entry.amount > 0);
}

export function healthServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'health');
}

export function educationServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'education');
}

export function transportServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'transport');
}

function healthQuality(service: Service): number {
  return scoringConfig.healthQuality[service.subtype as keyof typeof scoringConfig.healthQuality] ?? 0;
}

function educationQuality(service: Service): number {
  return scoringConfig.educationQuality[service.subtype as keyof typeof scoringConfig.educationQuality] ?? 0;
}

export function bestHealthService(services: Service[], key: string): Service | null {
  const priority = healthServicePriority(key);
  const candidates = services.filter((service) => priority.includes(service.subtype as (typeof priority)[number]));
  return (
    candidates.sort((left, right) => {
      const leftPriority = priority.indexOf(left.subtype as (typeof priority)[number]);
      const rightPriority = priority.indexOf(right.subtype as (typeof priority)[number]);
      return leftPriority - rightPriority || healthQuality(right) - healthQuality(left);
    })[0] ?? null
  );
}

export function bestEducationService(services: Service[], key: string): Service | null {
  const requiredSubtype = educationServiceSubtype(key);
  if (!requiredSubtype) return null;
  const candidates = services.filter((service) => {
    return service.subtype === requiredSubtype;
  });
  return (
    candidates.sort(
      (left, right) => educationQuality(right) - educationQuality(left) || left.id.localeCompare(right.id)
    )[0] ?? null
  );
}

export function educationServiceSubtype(key: string): string | null {
  return EDUCATION_SERVICE_SUBTYPES[key as keyof typeof EDUCATION_SERVICE_SUBTYPES] ?? null;
}

export function directConnections(
  snapshot: ScoringSnapshot,
  islandId: string
): Array<{
  islandId: string;
  connection: TransportConnection;
  factor: number;
  routeType: ServiceScore['routeType'];
}> {
  return snapshot.connections.flatMap((connection) => {
    const target = connectionFromIsland(connection, islandId);
    const route = connectionRoute(connection);
    return target && route ? [{ islandId: target, connection, ...route }] : [];
  });
}

function metric(): DemandMetric {
  return { local: 0, inbound: 0, outbound: 0, unserved: 0, combined: 0, demandPercent: null, outboundPercent: null };
}

function summary(population: number | null): DemandSummary {
  return {
    population,
    health: metric(),
    education: metric(),
    healthByNeed: {},
    educationByNeed: {},
    inboundSources: []
  };
}

function metricFor(summaryValue: DemandSummary, category: 'health' | 'education', needKey?: string): DemandMetric {
  const collection = category === 'health' ? summaryValue.healthByNeed : summaryValue.educationByNeed;
  if (!needKey) return summaryValue[category];
  return (collection[needKey] ??= metric());
}

function finalizeMetric(value: DemandMetric, population: number | null): DemandMetric {
  const combined = value.local + value.inbound;
  return {
    ...value,
    combined: round(combined),
    demandPercent: cappedPercent(combined, population),
    outboundPercent: cappedPercent(value.outbound, population)
  };
}

function finalizeSummary(value: DemandSummary): DemandSummary {
  return {
    ...value,
    health: finalizeMetric(value.health, value.population),
    education: finalizeMetric(value.education, value.population),
    healthByNeed: Object.fromEntries(
      Object.entries(value.healthByNeed).map(([key, item]) => [key, finalizeMetric(item, value.population)])
    ),
    educationByNeed: Object.fromEntries(
      Object.entries(value.educationByNeed).map(([key, item]) => [key, finalizeMetric(item, value.population)])
    ),
    inboundSources: value.inboundSources
      .map((source) => ({
        ...source,
        health: round(source.health),
        education: round(source.education),
        total: round(source.health + source.education)
      }))
      .sort((left, right) => right.total - left.total || left.originIslandId.localeCompare(right.originIslandId))
  };
}

function allocationKey(originIslandId: string, category: 'health' | 'education', needKey: string): string {
  return `${originIslandId}:${category}:${needKey}`;
}

function addNeedDemand(
  target: DemandSummary,
  category: 'health' | 'education',
  needKey: string,
  field: 'local' | 'inbound' | 'outbound' | 'unserved',
  amount: number
): void {
  metricFor(target, category, needKey)[field] += amount;
}

function addAggregateDemand(
  target: DemandSummary,
  category: 'health' | 'education',
  field: 'local' | 'inbound' | 'outbound' | 'unserved',
  amount: number
): void {
  target[category][field] += amount;
}

function addInboundSource(
  target: DemandSummary,
  originIslandId: string,
  category: 'health' | 'education',
  amount: number
): void {
  const source: InboundDemandSource = target.inboundSources.find(
    (entry) => entry.originIslandId === originIslandId
  ) ?? {
    originIslandId,
    health: 0,
    education: 0,
    total: 0
  };
  if (!target.inboundSources.includes(source)) target.inboundSources.push(source);
  source[category] += amount;
  source.total += amount;
}

function unavailableDestination(): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  return {
    destinationIslandId: null,
    routeType: 'unavailable',
    routeFactor: 0,
    serviceSubtype: null,
    distanceM: null,
    hopCount: 0,
    pathIslandIds: [],
    pathConnectionIds: [],
    knownConnectivity: false
  };
}

function destinationFromServiceRoute(
  route: ServiceRoute | null
): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  if (!route) return unavailableDestination();
  return {
    destinationIslandId: route.destinationIslandId,
    routeType: route.routeType,
    routeFactor: route.routeFactor,
    serviceSubtype: route.serviceSubtype,
    distanceM: route.distanceM,
    hopCount: route.hopCount,
    pathIslandIds: route.pathIslandIds,
    pathConnectionIds: route.pathConnectionIds,
    knownConnectivity: route.knownConnectivity
  };
}

function destinationFromHospitalRoute(
  route: ServiceRoute | null
): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  return destinationFromServiceRoute(route);
}

function addHospitalOverlay(
  byIsland: Map<string, DemandSummary>,
  overlay: DemandAllocation,
  originIslandId: string
): void {
  if (!overlay.destinationIslandId) return;
  const destination = byIsland.get(overlay.destinationIslandId);
  if (!destination) return;
  addNeedDemand(destination, 'health', 'chronic_elderly', 'inbound', overlay.demand);
  addAggregateDemand(destination, 'health', 'inbound', overlay.demand);
  addInboundSource(destination, originIslandId, 'health', overlay.demand);
}

function addEducationOverlay(
  byIsland: Map<string, DemandSummary>,
  overlay: DemandAllocation,
  originIslandId: string
): void {
  if (!overlay.destinationIslandId) return;
  const destination = byIsland.get(overlay.destinationIslandId);
  if (!destination) return;
  addNeedDemand(destination, 'education', overlay.needKey, 'inbound', overlay.demand);
  addAggregateDemand(destination, 'education', 'inbound', overlay.demand);
  addInboundSource(destination, originIslandId, 'education', overlay.demand);
}

function selectDestination(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  category: 'health' | 'education',
  needKey: string
): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  if (category === 'education') {
    const requiredSubtype = educationServiceSubtype(needKey);
    return requiredSubtype
      ? destinationFromServiceRoute(resolveEducationRouting(snapshot, originIslandId, requiredSubtype).canonical)
      : unavailableDestination();
  }

  const originServices = indexedServices(snapshot).get(originIslandId) ?? [];
  const local = bestHealthService(healthServices(originServices), needKey);
  if (local) {
    return {
      destinationIslandId: originIslandId,
      routeType: 'local',
      routeFactor: 1,
      serviceSubtype: local.subtype
    };
  }

  const candidate = directConnections(snapshot, originIslandId)
    .map((entry) => {
      const services = indexedServices(snapshot).get(entry.islandId) ?? [];
      const service = bestHealthService(healthServices(services), needKey);
      return { ...entry, service };
    })
    .filter((entry) => entry.service)
    .sort((left, right) => right.factor - left.factor || left.islandId.localeCompare(right.islandId))[0];

  return candidate?.service
    ? {
        destinationIslandId: candidate.islandId,
        routeType: candidate.routeType,
        routeFactor: candidate.factor,
        serviceSubtype: candidate.service.subtype
      }
    : { destinationIslandId: null, routeType: 'unavailable', routeFactor: 0, serviceSubtype: null };
}

function selectUniqueEducationRouting(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  needKey: string
): {
  destination: Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'>;
  overlays: ServiceRoute[];
} {
  const requiredSubtype = educationServiceSubtype(needKey);
  if (!requiredSubtype) return { destination: unavailableDestination(), overlays: [] };

  const routing = resolveEducationRouting(snapshot, originIslandId, requiredSubtype);
  if (routing.canonical || routing.overlays.length === 0) {
    return { destination: destinationFromServiceRoute(routing.canonical), overlays: routing.overlays };
  }

  const fallbackNeed = needKey === 'primary' ? 'preschool' : needKey === 'secondary' ? 'higher_secondary' : null;
  if (!fallbackNeed || fallbackNeed === needKey) {
    return { destination: destinationFromServiceRoute(routing.canonical), overlays: routing.overlays };
  }

  const fallbackSubtype = educationServiceSubtype(fallbackNeed);
  if (!fallbackSubtype)
    return { destination: destinationFromServiceRoute(routing.canonical), overlays: routing.overlays };
  const fallbackRouting = resolveEducationRouting(snapshot, originIslandId, fallbackSubtype);
  if (fallbackRouting.canonical || fallbackRouting.overlays.length > 0) {
    return {
      destination: destinationFromServiceRoute(fallbackRouting.canonical),
      overlays: fallbackRouting.overlays
    };
  }

  return { destination: destinationFromServiceRoute(routing.canonical), overlays: routing.overlays };
}

export function buildDemandAllocation(snapshot: ScoringSnapshot): DemandAllocationResult {
  snapshot = calculationSnapshot(snapshot);
  const cached = demandAllocationCache.get(snapshot);
  if (cached) return cached;

  const byIsland = new Map<string, DemandSummary>();
  const byOriginNeed = new Map<string, DemandAllocation>();
  const byOriginCohort = new Map<string, DemandAllocation>();
  const hospitalOverlays: DemandAllocation[] = [];
  const educationOverlays: DemandAllocation[] = [];

  for (const island of snapshot.islands) {
    byIsland.set(island.id, summary(totalPopulation(populationForIsland(snapshot, island.id))));
  }

  for (const origin of snapshot.islands.filter((island) => island.islandType === 'inhabited')) {
    const records = populationForIsland(snapshot, origin.id);
    const originSummary = byIsland.get(origin.id);
    if (!originSummary) continue;

    const healthDemands = buildHealthDemand(records);
    const elderlyHospitalRouting = resolveElderlyHospitalRouting(snapshot, origin.id);
    const categories = [
      { category: 'health' as const, demands: healthDemands },
      { category: 'education' as const, demands: educationDemand(records) }
    ];

    for (const { category, demands } of categories) {
      for (const [needKey, demand] of Object.entries(demands)) {
        if (demand <= 0) continue;
        addNeedDemand(originSummary, category, needKey, 'local', demand);
        const destination =
          category === 'health' && needKey === 'chronic_elderly'
            ? destinationFromServiceRoute(elderlyHospitalRouting.canonical)
            : selectDestination(snapshot, origin.id, category, needKey);
        const allocation: DemandAllocation = {
          originIslandId: origin.id,
          category,
          needKey,
          demand: round(demand),
          ...destination
        };
        byOriginNeed.set(allocationKey(origin.id, category, needKey), allocation);

        if (destination.destinationIslandId === origin.id) continue;

        addNeedDemand(originSummary, category, needKey, 'outbound', demand);
        if (destination.destinationIslandId === null) {
          addNeedDemand(originSummary, category, needKey, 'unserved', demand);
          continue;
        }
        const destinationSummary = byIsland.get(destination.destinationIslandId);
        if (destinationSummary) {
          addNeedDemand(destinationSummary, category, needKey, 'inbound', demand);
        }
      }
    }

    if (healthDemands.chronic_elderly > 0) {
      for (const route of elderlyHospitalRouting.overlays) {
        const overlay: DemandAllocation = {
          originIslandId: origin.id,
          category: 'health',
          needKey: 'chronic_elderly',
          demand: round(healthDemands.chronic_elderly),
          ...destinationFromHospitalRoute(route)
        };
        hospitalOverlays.push(overlay);
        addHospitalOverlay(byIsland, overlay, origin.id);
      }
    }

    // Aggregate health pressure uses the non-elderly baseline once plus the
    // hospital-only chronic overlay. Additional elderly hospital overlays are
    // applied to their destination summaries below.
    for (const needKey of ['primary', 'chronic_elderly'] as const) {
      const allocation = byOriginNeed.get(allocationKey(origin.id, 'health', needKey));
      if (!allocation) continue;

      const amount = allocation.demand;
      if (allocation.destinationIslandId === origin.id) {
        addAggregateDemand(originSummary, 'health', 'local', amount);
        continue;
      }

      addAggregateDemand(originSummary, 'health', 'outbound', amount);
      if (allocation.destinationIslandId === null) {
        addAggregateDemand(originSummary, 'health', 'unserved', amount);
        continue;
      }

      const destinationSummary = byIsland.get(allocation.destinationIslandId);
      if (destinationSummary) {
        addAggregateDemand(destinationSummary, 'health', 'inbound', amount);
        addInboundSource(destinationSummary, origin.id, 'health', amount);
      }
    }

    // Aggregate education pressure uses one allocation per age cohort; cohort
    // allocations remain available for separate care and student transfers.
    for (const { category, needKey, amount } of uniqueDemand(records)) {
      const existingHealthAllocation =
        category === 'health' ? byOriginNeed.get(allocationKey(origin.id, category, needKey)) : undefined;
      const educationRouting =
        category === 'education' ? selectUniqueEducationRouting(snapshot, origin.id, needKey) : undefined;
      const destination =
        existingHealthAllocation ??
        educationRouting?.destination ??
        selectDestination(snapshot, origin.id, category, needKey);
      const allocation =
        existingHealthAllocation ??
        ({
          originIslandId: origin.id,
          category,
          needKey,
          demand: round(amount),
          ...destination
        } satisfies DemandAllocation);
      byOriginCohort.set(allocationKey(origin.id, category, needKey), allocation);

      if (category === 'education' && educationRouting) {
        for (const route of educationRouting.overlays) {
          const overlay: DemandAllocation = {
            originIslandId: origin.id,
            category: 'education',
            needKey,
            demand: round(amount),
            ...destinationFromServiceRoute(route)
          };
          educationOverlays.push(overlay);
          addEducationOverlay(byIsland, overlay, origin.id);
        }
      }

      if (category === 'health') continue;

      addAggregateDemand(originSummary, category, 'local', amount);

      if (destination.destinationIslandId === origin.id) continue;

      addAggregateDemand(originSummary, category, 'outbound', amount);
      if (destination.destinationIslandId === null) {
        addAggregateDemand(originSummary, category, 'unserved', amount);
        continue;
      }
      const destinationSummary = byIsland.get(destination.destinationIslandId);
      if (destinationSummary) {
        addAggregateDemand(destinationSummary, category, 'inbound', amount);
        addInboundSource(destinationSummary, origin.id, category, amount);
      }
    }
  }

  const result = {
    byIsland: new Map([...byIsland.entries()].map(([islandId, value]) => [islandId, finalizeSummary(value)])),
    byOriginNeed,
    byOriginCohort,
    hospitalOverlays,
    educationOverlays
  };
  demandAllocationCache.set(snapshot, result);
  return result;
}

export function demandAllocationFor(
  result: DemandAllocationResult,
  islandId: string,
  category: 'health' | 'education',
  needKey: string
): DemandAllocation | undefined {
  return result.byOriginNeed.get(allocationKey(islandId, category, needKey));
}
