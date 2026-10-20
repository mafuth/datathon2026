import type { Population, Service, TransportConnection } from '../../db/models';
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

export const HEALTH_TYPES = ['hospital', 'health_center', 'clinic'] as const;
export const AIR_TRANSPORT_TYPES = ['airport', 'air_terminal', 'helipad'] as const;

const LAND_CONNECTIONS = new Set(['bridge', 'bus', 'causeway', 'land_link']);

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
  return snapshot.population.filter((record) => record.islandId === islandId);
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

function elderlyPopulation(records: Population[]): number {
  return populationAmount(records, 'elderly_population_65_plus') ?? 0;
}

export function healthDemand(records: Population[]): Record<string, number> {
  const total = totalPopulation(records) ?? 0;
  const children = childPopulation(records);
  const elderly = elderlyPopulation(records);
  return {
    primary: total,
    maternal_child: children,
    hospital_emergency: children + elderly,
    chronic_elderly: elderly
  };
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
  const children = childPopulation(records);
  const elderly = elderlyPopulation(records);
  const adolescents = populationAmount(records, 'adolescent_population_10_19') ?? 0;
  const youth =
    populationAmount(records, 'youth_population_18_35') ?? populationAmount(records, 'youth_population_15_24') ?? 0;

  return [
    { category: 'health', needKey: 'maternal_child', amount: children },
    { category: 'health', needKey: 'chronic_elderly', amount: elderly },
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
  const candidates = services.filter((service) => {
    if (key === 'hospital_emergency' || key === 'chronic_elderly') return service.subtype === 'hospital';
    return HEALTH_TYPES.includes(service.subtype as (typeof HEALTH_TYPES)[number]);
  });
  return candidates.sort((left, right) => healthQuality(right) - healthQuality(left))[0] ?? null;
}

export function bestEducationService(services: Service[], key: string): Service | null {
  const candidates = services.filter((service) => {
    if (key === 'preschool') return service.subtype === 'preschool';
    if (key === 'higher_secondary') return service.subtype === 'high_school';
    if (key === 'tertiary') return service.subtype === 'tertiary';
    return service.subtype === key || (key === 'primary' && service.subtype === 'school');
  });
  return candidates.sort((left, right) => educationQuality(right) - educationQuality(left))[0] ?? null;
}

function connectionFromIsland(connection: TransportConnection, islandId: string): string | null {
  if (connection.scoreEligible === false) return null;
  if (connection.fromIslandId === islandId) return connection.toIslandId;
  if (connection.toIslandId === islandId && connection.directionality === 'bidirectional') {
    return connection.fromIslandId;
  }
  return null;
}

function connectionFactor(connection: TransportConnection): {
  routeType: ServiceScore['routeType'];
  factor: number;
} {
  if (LAND_CONNECTIONS.has(connection.connectionType)) return { routeType: 'land', factor: 0.9 };
  if (connection.connectionType === 'ferry') return { routeType: 'marine', factor: connection.modeled ? 0.6 : 0.7 };
  if (connection.connectionType === 'air') return { routeType: 'airport', factor: scoringConfig.airConnectionFactor };
  return { routeType: 'unavailable', factor: 0 };
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
    if (!target) return [];
    const route = connectionFactor(connection);
    return route.factor > 0 ? [{ islandId: target, connection, ...route }] : [];
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

function selectDestination(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  category: 'health' | 'education',
  needKey: string
): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  const originServices = snapshot.services.filter((service) => service.islandId === originIslandId);
  const local =
    category === 'health'
      ? bestHealthService(healthServices(originServices), needKey)
      : bestEducationService(educationServices(originServices), needKey);
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
      const services = snapshot.services.filter((service) => service.islandId === entry.islandId);
      const service =
        category === 'health'
          ? bestHealthService(healthServices(services), needKey)
          : bestEducationService(educationServices(services), needKey);
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

function selectUniqueDestination(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  category: 'health' | 'education',
  needKey: string
): Omit<DemandAllocation, 'originIslandId' | 'category' | 'needKey' | 'demand'> {
  const destination = selectDestination(snapshot, originIslandId, category, needKey);
  if (destination.destinationIslandId !== null) return destination;
  if (category === 'health') return destination;
  const fallbackNeed = needKey === 'primary' ? 'preschool' : needKey === 'secondary' ? 'higher_secondary' : needKey;
  return selectDestination(snapshot, originIslandId, category, fallbackNeed);
}

export function buildDemandAllocation(snapshot: ScoringSnapshot): DemandAllocationResult {
  const byIsland = new Map<string, DemandSummary>();
  const byOriginNeed = new Map<string, DemandAllocation>();
  const byOriginCohort = new Map<string, DemandAllocation>();

  for (const island of snapshot.islands) {
    byIsland.set(island.id, summary(totalPopulation(populationForIsland(snapshot, island.id))));
  }

  for (const origin of snapshot.islands.filter((island) => island.islandType === 'inhabited')) {
    const records = populationForIsland(snapshot, origin.id);
    const originSummary = byIsland.get(origin.id);
    if (!originSummary) continue;

    const categories = [
      { category: 'health' as const, demands: healthDemand(records) },
      { category: 'education' as const, demands: educationDemand(records) }
    ];

    for (const { category, demands } of categories) {
      for (const [needKey, demand] of Object.entries(demands)) {
        if (demand <= 0) continue;
        addNeedDemand(originSummary, category, needKey, 'local', demand);
        const destination = selectDestination(snapshot, origin.id, category, needKey);
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

    // Aggregate pressure uses one allocation per age cohort; detailed need rows above remain separate.
    for (const { category, needKey, amount } of uniqueDemand(records)) {
      addAggregateDemand(originSummary, category, 'local', amount);
      const destination = selectUniqueDestination(snapshot, origin.id, category, needKey);
      const allocation: DemandAllocation = {
        originIslandId: origin.id,
        category,
        needKey,
        demand: round(amount),
        ...destination
      };
      byOriginCohort.set(allocationKey(origin.id, category, needKey), allocation);

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

  return {
    byIsland: new Map([...byIsland.entries()].map(([islandId, value]) => [islandId, finalizeSummary(value)])),
    byOriginNeed,
    byOriginCohort
  };
}

export function demandAllocationFor(
  result: DemandAllocationResult,
  islandId: string,
  category: 'health' | 'education',
  needKey: string
): DemandAllocation | undefined {
  return result.byOriginNeed.get(allocationKey(islandId, category, needKey));
}
