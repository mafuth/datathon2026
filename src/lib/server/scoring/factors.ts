import type { Island, Population, Service, TransportConnection } from '../../db/models';
import type {
  AirportAccess,
  CrowdednessResult,
  ExternalDemandResult,
  HubDemandImpact,
  IslandScoreResult,
  ScoreComponent,
  ScoreStatus,
  ScoringSnapshot,
  ServiceScore
} from './types';

import { scoringConfig } from './config';

type DemandAllocation = {
  health: number;
  education: number;
  routeType: 'local' | 'land' | 'marine' | 'airport' | 'unavailable';
  destinationIslandId: string | null;
  demand: number;
};

type DemandTotals = {
  health: number;
  education: number;
};

const LAND_CONNECTIONS = new Set(['bridge', 'causeway', 'land_link']);
const HEALTH_TYPES = ['hospital', 'health_center', 'clinic'] as const;

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function weightedMean(values: Array<{ value: number | null; weight: number }>): number | null {
  const eligible = values.filter((item): item is { value: number; weight: number } => item.value !== null);
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return null;
  return round(eligible.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight);
}

function statusFor(value: number | null, partial = true): ScoreStatus {
  if (value === null) return 'unavailable';
  return partial ? 'partial' : 'numeric';
}

function component(
  baseScore: number | null,
  adjustmentFactor: number | null,
  denominatorPopulation: number | null,
  evidenceCount: number,
  limitations: string[],
  partial = true
): ScoreComponent {
  const score = baseScore === null ? null : round(clamp(baseScore) * (adjustmentFactor ?? 1));
  return {
    baseScore,
    score,
    adjustmentFactor,
    status: statusFor(score, partial),
    coverageRatio: denominatorPopulation === null ? 0 : score === null ? 0 : 1,
    denominatorPopulation,
    numericPopulation: score === null ? null : denominatorPopulation,
    evidenceCount,
    limitations: [...new Set(limitations)]
  };
}

function populationForIsland(snapshot: ScoringSnapshot, islandId: string): Population[] {
  return snapshot.population.filter((record) => record.islandId === islandId);
}

function populationAmount(records: Population[], category: string): number | null {
  return finite(records.find((record) => record.ageCategory === category)?.amount);
}

function totalPopulation(records: Population[]): number | null {
  return (
    populationAmount(records, 'total') ??
    (records.length > 0 ? records.reduce((sum, record) => sum + record.amount, 0) : null)
  );
}

function healthDemand(records: Population[]): Record<string, number> {
  const total = totalPopulation(records) ?? 0;
  const children =
    populationAmount(records, 'child_population_0_14') ?? populationAmount(records, 'child_population_0_17') ?? 0;
  const elderly = populationAmount(records, 'elderly_population_65_plus') ?? 0;
  return {
    primary: total,
    maternal_child: children,
    hospital_emergency: total,
    chronic_elderly: elderly
  };
}

function educationDemand(records: Population[]): Record<string, number> {
  const children =
    populationAmount(records, 'child_population_0_14') ?? populationAmount(records, 'child_population_0_17') ?? 0;
  return {
    preschool: children,
    primary: children,
    secondary: populationAmount(records, 'adolescent_population_10_19') ?? children,
    higher_secondary: populationAmount(records, 'adolescent_population_10_19') ?? children,
    tertiary:
      populationAmount(records, 'youth_population_18_35') ?? populationAmount(records, 'youth_population_15_24') ?? 0
  };
}

function healthServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'health');
}

function educationServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'education');
}

function transportServices(services: Service[]): Service[] {
  return services.filter((service) => service.serviceType === 'transport');
}

function healthQuality(service: Service): number {
  return scoringConfig.healthQuality[service.subtype as keyof typeof scoringConfig.healthQuality] ?? 0;
}

function educationQuality(service: Service): number {
  return scoringConfig.educationQuality[service.subtype as keyof typeof scoringConfig.educationQuality] ?? 0;
}

function connectionFromIsland(connection: TransportConnection, islandId: string): string | null {
  if (connection.fromIslandId === islandId) return connection.toIslandId;
  if (connection.toIslandId === islandId && connection.directionality === 'bidirectional') {
    return connection.fromIslandId;
  }
  return null;
}

function connectionFactor(connection: TransportConnection): {
  routeType: DemandAllocation['routeType'];
  factor: number;
} {
  if (LAND_CONNECTIONS.has(connection.connectionType)) return { routeType: 'land', factor: 0.9 };
  if (connection.connectionType === 'ferry') return { routeType: 'marine', factor: connection.modeled ? 0.6 : 0.7 };
  return { routeType: 'unavailable', factor: 0 };
}

function directConnections(
  snapshot: ScoringSnapshot,
  islandId: string
): Array<{
  islandId: string;
  connection: TransportConnection;
  factor: number;
  routeType: DemandAllocation['routeType'];
}> {
  return snapshot.connections.flatMap((connection) => {
    const target = connectionFromIsland(connection, islandId);
    if (!target) return [];
    const route = connectionFactor(connection);
    return route.factor > 0 ? [{ islandId: target, connection, ...route }] : [];
  });
}

function bestHealthService(services: Service[], key: string): Service | null {
  const candidates = services.filter((service) => {
    if (key === 'hospital_emergency') return service.subtype === 'hospital';
    return HEALTH_TYPES.includes(service.subtype as (typeof HEALTH_TYPES)[number]);
  });
  return candidates.sort((left, right) => healthQuality(right) - healthQuality(left))[0] ?? null;
}

function bestEducationService(services: Service[], key: string): Service | null {
  const candidates = services.filter((service) => {
    if (key === 'preschool') return service.subtype === 'preschool';
    if (key === 'higher_secondary') return service.subtype === 'high_school';
    if (key === 'tertiary') return service.subtype === 'tertiary';
    return service.subtype === key || (key === 'primary' && service.subtype === 'school');
  });
  return candidates.sort((left, right) => educationQuality(right) - educationQuality(left))[0] ?? null;
}

function calculateCrowdedness(island: Island, population: number | null): CrowdednessResult {
  const area = finite(island.landAreaKm2);
  if (population === null || area === null || area <= 0) {
    return {
      score: null,
      populationDensity: null,
      population,
      landAreaKm2: area,
      areaSource: 'unavailable',
      pressure: null,
      healthFactor: null,
      educationFactor: null,
      status: 'unavailable'
    };
  }
  const density = population / area;
  const pressure = Math.min(1, density / scoringConfig.densityReferencePersonsPerKm2);
  const healthFactor = Math.max(scoringConfig.minimumCrowdingFactor, 1 - scoringConfig.healthCrowdingImpact * pressure);
  const educationFactor = Math.max(
    scoringConfig.minimumCrowdingFactor,
    1 - scoringConfig.educationCrowdingImpact * pressure
  );
  return {
    score: round((1 - pressure) * 100),
    populationDensity: round(density),
    population,
    landAreaKm2: area,
    areaSource: 'database',
    pressure: round(pressure),
    healthFactor: round(healthFactor),
    educationFactor: round(educationFactor),
    status: 'numeric'
  };
}

function airportAccess(snapshot: ScoringSnapshot, islandId: string): AirportAccess {
  const ownAirport = snapshot.services.find(
    (service) => service.islandId === islandId && service.serviceType === 'transport' && service.subtype === 'airport'
  );
  if (ownAirport) return { available: true, source: 'own_airport', airportIslandId: islandId };

  const linkedAirport = directConnections(snapshot, islandId).find(({ islandId: target }) =>
    snapshot.services.some(
      (service) => service.islandId === target && service.serviceType === 'transport' && service.subtype === 'airport'
    )
  );
  return linkedAirport
    ? { available: true, source: 'direct_land_connection', airportIslandId: linkedAirport.islandId }
    : { available: false, source: 'unavailable', airportIslandId: null };
}

function allocateDemand(snapshot: ScoringSnapshot): Map<string, DemandTotals> {
  const totals = new Map<string, DemandTotals>();
  for (const origin of snapshot.islands.filter((island) => island.islandType === 'inhabited')) {
    const records = populationForIsland(snapshot, origin.id);
    const health = healthDemand(records);
    const education = educationDemand(records);
    const originHealthServices = healthServices(snapshot.services.filter((service) => service.islandId === origin.id));
    const originEducationServices = educationServices(
      snapshot.services.filter((service) => service.islandId === origin.id)
    );
    const connections = directConnections(snapshot, origin.id);
    for (const [key, demand] of Object.entries(health)) {
      if (demand <= 0) continue;
      const local = bestHealthService(originHealthServices, key);
      const destination = local
        ? { islandId: origin.id, factor: 1 }
        : connections
            .map((entry) => ({
              islandId: entry.islandId,
              factor: entry.factor,
              service: bestHealthService(
                healthServices(snapshot.services.filter((service) => service.islandId === entry.islandId)),
                key
              )
            }))
            .filter((entry) => entry.service)
            .sort((left, right) => right.factor - left.factor)[0];
      if (!destination) continue;
      const current = totals.get(destination.islandId) ?? { health: 0, education: 0 };
      if (destination.islandId !== origin.id) current.health += demand * destination.factor;
      totals.set(destination.islandId, current);
    }
    for (const [key, demand] of Object.entries(education)) {
      if (demand <= 0) continue;
      const local = bestEducationService(originEducationServices, key);
      const destination = local
        ? { islandId: origin.id, factor: 1 }
        : connections
            .map((entry) => ({
              islandId: entry.islandId,
              factor: entry.factor,
              service: bestEducationService(
                educationServices(snapshot.services.filter((service) => service.islandId === entry.islandId)),
                key
              )
            }))
            .filter((entry) => entry.service)
            .sort((left, right) => right.factor - left.factor)[0];
      if (!destination) continue;
      const current = totals.get(destination.islandId) ?? { health: 0, education: 0 };
      if (destination.islandId !== origin.id) current.education += demand * destination.factor;
      totals.set(destination.islandId, current);
    }
  }
  return totals;
}

function externalDemand(
  population: number | null,
  demand: DemandTotals | undefined,
  crowding: CrowdednessResult
): ExternalDemandResult {
  const inboundHealthDemand = demand?.health ?? 0;
  const inboundEducationDemand = demand?.education ?? 0;
  const healthPressure = population && population > 0 ? inboundHealthDemand / population : null;
  const educationPressure = population && population > 0 ? inboundEducationDemand / population : null;
  const healthFactor =
    healthPressure === null
      ? null
      : Math.max(
          scoringConfig.minimumExternalDemandFactor,
          1 - scoringConfig.externalDemandImpact * Math.min(1, healthPressure)
        );
  const educationFactor =
    educationPressure === null
      ? null
      : Math.max(
          scoringConfig.minimumExternalDemandFactor,
          1 - scoringConfig.externalDemandImpact * Math.min(1, educationPressure)
        );
  const limitations = [
    'External demand is estimated from reachable population need; service capacity is not stored in the current database.',
    ...(crowding.status === 'unavailable' ? ['Destination land area is unavailable for demand adjustment.'] : [])
  ];
  return {
    inboundHealthDemand: round(inboundHealthDemand),
    inboundEducationDemand: round(inboundEducationDemand),
    healthPressure: healthPressure === null ? null : round(healthPressure),
    educationPressure: educationPressure === null ? null : round(educationPressure),
    healthFactor,
    educationFactor,
    status: population === null ? 'unavailable' : 'partial',
    limitations
  };
}

function hubType(service: Service): HubDemandImpact['hubType'] | null {
  if (service.subtype === 'airport') return 'airport';
  if (service.subtype === 'port' || service.subtype === 'jetty') return 'ferry_terminal';
  if (['bus_station', 'bus_stop', 'public_transport'].includes(service.subtype)) return 'land_gateway';
  return null;
}

function hubImpacts(
  island: Island,
  snapshot: ScoringSnapshot,
  population: number | null,
  external: ExternalDemandResult
): HubDemandImpact[] {
  const hubs = transportServices(snapshot.services).filter((service) => service.islandId === island.id);
  return hubs.flatMap((hub) => {
    const type = hubType(hub);
    if (!type) return [];
    const localDemand = population ?? 0;
    const incomingDemand = (external.inboundHealthDemand ?? 0) + (external.inboundEducationDemand ?? 0);
    const transferDemand =
      connectionsForIsland(snapshot, island.id).length > 1 ? incomingDemand * scoringConfig.transferDemandShare : 0;
    const totalDemand = localDemand + incomingDemand + transferDemand;
    const capacity = Math.max(1, localDemand * scoringConfig.hubCapacityProxyByType[type]);
    const pressure = Math.min(1, totalDemand / capacity);
    const factor = Math.max(scoringConfig.minimumHubFactor, 1 - scoringConfig.hubDemandImpact * pressure);
    return [
      {
        hubId: hub.id,
        hubType: type,
        localDemand: round(localDemand),
        incomingDemand: round(incomingDemand),
        transferDemand: round(transferDemand),
        totalDemand: round(totalDemand),
        capacity: round(capacity),
        pressure: round(pressure),
        factor: round(factor),
        scoreImpact: round((1 - factor) * 100),
        status: 'partial' as const,
        limitation: 'Hub capacity is estimated from a configured population proxy.'
      }
    ];
  });
}

function serviceBreakdown(
  island: Island,
  snapshot: ScoringSnapshot,
  kind: 'health' | 'education',
  crowding: CrowdednessResult,
  external: ExternalDemandResult
): ServiceScore[] {
  const records = populationForIsland(snapshot, island.id);
  const demands = kind === 'health' ? healthDemand(records) : educationDemand(records);
  const localServices = snapshot.services.filter(
    (service) => service.islandId === island.id && service.serviceType === kind
  );
  const connections = directConnections(snapshot, island.id);
  const demandAllocations = allocateDemand(snapshot);
  const result: ServiceScore[] = [];
  for (const [key, demand] of Object.entries(demands)) {
    if (demand <= 0) continue;
    const local = kind === 'health' ? bestHealthService(localServices, key) : bestEducationService(localServices, key);
    let base = local ? (kind === 'health' ? healthQuality(local) * 100 : educationQuality(local) * 100) : null;
    let destinationIslandId = local ? island.id : null;
    let routeType: ServiceScore['routeType'] = local ? 'local' : 'unavailable';
    if (!local) {
      const candidate = connections
        .map((entry) => {
          const services = snapshot.services.filter(
            (service) => service.islandId === entry.islandId && service.serviceType === kind
          );
          const service = kind === 'health' ? bestHealthService(services, key) : bestEducationService(services, key);
          return { ...entry, service };
        })
        .filter((entry) => entry.service)
        .sort((left, right) => right.factor - left.factor)[0];
      if (candidate?.service) {
        base =
          (kind === 'health' ? healthQuality(candidate.service) : educationQuality(candidate.service)) *
          candidate.factor *
          100;
        destinationIslandId = candidate.islandId;
        routeType = candidate.routeType;
      }
    }
    const destination = destinationIslandId
      ? snapshot.islands.find((record) => record.id === destinationIslandId)
      : null;
    const destinationPopulation = destination ? totalPopulation(populationForIsland(snapshot, destination.id)) : null;
    const destinationCrowding = destination ? calculateCrowdedness(destination, destinationPopulation) : crowding;
    const destinationExternal = destination
      ? externalDemand(destinationPopulation, demandAllocations.get(destination.id), destinationCrowding)
      : external;
    const demandFactor = kind === 'health' ? destinationExternal.healthFactor : destinationExternal.educationFactor;
    const crowdingFactor = kind === 'health' ? destinationCrowding.healthFactor : destinationCrowding.educationFactor;
    result.push({
      key,
      score: base === null ? 0 : round(base * (demandFactor ?? 1) * (crowdingFactor ?? 1)),
      demand,
      destinationIslandId,
      routeType,
      status: 'partial',
      limitations: [
        ...(base === null
          ? ['No matching local or directly connected service was found; this need contributes partial score 0.']
          : []),
        ...(crowding.status === 'unavailable' ? ['Destination land area is unavailable.'] : []),
        'Age-specific service capacity and approved travel times are not stored in the current database.'
      ]
    });
  }
  return result;
}

function scoreFromBreakdown(
  breakdown: ServiceScore[],
  denominator: number | null,
  factor: number | null,
  extraLimitations: string[]
): ScoreComponent & { breakdown: ServiceScore[]; adjustedScore: number | null } {
  const score = weightedMean(breakdown.map((entry) => ({ value: entry.score, weight: entry.demand ?? 1 })));
  // Route-level crowding and external-demand factors are already applied to
  // each breakdown row, so the component is not adjusted a second time.
  const result = component(score, factor === null ? null : 1, denominator, breakdown.length, extraLimitations);
  return { ...result, adjustedScore: result.score, breakdown };
}

function transportComponent(
  baseScore: number | null,
  denominator: number | null,
  evidenceCount: number,
  hubFactor: number | null,
  limitations: string[]
): ScoreComponent {
  return component(baseScore, hubFactor, denominator, evidenceCount, limitations);
}

function transportScores(
  island: Island,
  snapshot: ScoringSnapshot,
  population: number | null,
  airport: AirportAccess,
  hubs: HubDemandImpact[]
): IslandScoreResult['transport'] {
  const services = transportServices(snapshot.services).filter((service) => service.islandId === island.id);
  const connections = directConnections(snapshot, island.id);
  const landEvidence =
    services.filter((service) => ['bus_station', 'bus_stop', 'public_transport'].includes(service.subtype)).length +
    connections.filter((entry) => entry.routeType === 'land').length;
  const marineEvidence =
    services.filter((service) => ['port', 'jetty'].includes(service.subtype)).length +
    connections.filter((entry) => entry.routeType === 'marine').length;
  const airEvidence =
    services.filter((service) => service.subtype === 'airport').length +
    (airport.source === 'direct_land_connection' ? 1 : 0);
  const landHub = hubs.filter((hub) => hub.hubType === 'land_gateway').map((hub) => hub.factor ?? 1);
  const marineHub = hubs.filter((hub) => hub.hubType === 'ferry_terminal').map((hub) => hub.factor ?? 1);
  const airHub = hubs.filter((hub) => hub.hubType === 'airport').map((hub) => hub.factor ?? 1);
  const maxFactor = (values: number[]) => (values.length === 0 ? null : Math.max(...values));
  const land = transportComponent(
    landEvidence > 0 ? 100 : population === null ? null : 0,
    population,
    landEvidence,
    maxFactor(landHub),
    ['Local road-network distance and capacity are unavailable.']
  );
  const marine = transportComponent(
    marineEvidence > 0 ? 100 : population === null ? null : 0,
    population,
    marineEvidence,
    maxFactor(marineHub),
    ['Marine travel time and terminal capacity are unavailable.']
  );
  const air = transportComponent(
    airport.available ? 100 : population === null ? null : 0,
    population,
    airEvidence,
    maxFactor(airHub),
    ['Approved air route time and airport capacity are unavailable.']
  );
  const score = weightedMean([
    { value: land.score, weight: scoringConfig.transportWeights.land },
    { value: marine.score, weight: scoringConfig.transportWeights.marine },
    { value: air.score, weight: scoringConfig.transportWeights.air }
  ]);
  return {
    ...component(score, null, population, landEvidence + marineEvidence + airEvidence, [
      'Transport scores are based on available gateway and connection evidence.'
    ]),
    land,
    marine,
    air,
    hubImpacts: hubs
  };
}

export function calculateIslandScore(islandId: string, snapshot: ScoringSnapshot): IslandScoreResult {
  const island = snapshot.islands.find((record) => record.id === islandId);
  if (!island) throw new Error(`Island ${islandId} was not found`);

  const populationRecords = populationForIsland(snapshot, island.id);
  const population = totalPopulation(populationRecords);
  const crowding = calculateCrowdedness(island, population);
  const allocations = allocateDemand(snapshot);
  const external = externalDemand(population, allocations.get(island.id), crowding);
  const airport = airportAccess(snapshot, island.id);
  const hubs = hubImpacts(island, snapshot, population, external);
  const healthBreakdown = serviceBreakdown(island, snapshot, 'health', crowding, external);
  const educationBreakdown = serviceBreakdown(island, snapshot, 'education', crowding, external);
  const health = scoreFromBreakdown(healthBreakdown, population, crowding.healthFactor, [
    ...external.limitations,
    'Health access includes the best local or directly connected service evidence.'
  ]);
  const education = scoreFromBreakdown(educationBreakdown, population, crowding.educationFactor, [
    ...external.limitations,
    'Education relocation support and approved travel times are not stored in the current database.'
  ]);
  const transport = transportScores(island, snapshot, population, airport, hubs);
  const overallScore = weightedMean([
    { value: health.score, weight: scoringConfig.domainWeights.health },
    { value: education.score, weight: scoringConfig.domainWeights.education },
    { value: transport.score, weight: scoringConfig.domainWeights.transport }
  ]);
  const limitations = [
    ...(crowding.status === 'unavailable' ? ['Land area or population is unavailable for crowdedness.'] : []),
    ...health.limitations,
    ...education.limitations,
    ...transport.limitations,
    ...hubs.map((hub) => hub.limitation).filter((value): value is string => value !== null)
  ];
  return {
    islandId: island.id,
    islandName: island.name,
    overall: component(overallScore, null, population, 3, limitations),
    health,
    education,
    transport,
    crowdedness: crowding,
    externalDemand: external,
    airportAccess: airport,
    limitations: [...new Set(limitations)],
    assumptions: [
      'Cross-island demand uses directly connected land and marine routes only.',
      'Transport hub capacity uses a configured population proxy because measured capacity is unavailable.'
    ],
    evidence: {
      populationRows: populationRecords.length,
      healthServices: healthServices(snapshot.services.filter((service) => service.islandId === island.id)).length,
      educationServices: educationServices(snapshot.services.filter((service) => service.islandId === island.id))
        .length,
      transportServices: transportServices(snapshot.services.filter((service) => service.islandId === island.id))
        .length,
      transportConnections: connectionsForIsland(snapshot, island.id).length
    }
  };
}

function connectionsForIsland(snapshot: ScoringSnapshot, islandId: string): TransportConnection[] {
  return snapshot.connections.filter(
    (connection) => connection.fromIslandId === islandId || connection.toIslandId === islandId
  );
}
