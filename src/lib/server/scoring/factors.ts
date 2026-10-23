import type { Island, Service, TransportConnection } from '../../db/models';
import type {
  AirportAccess,
  CrowdednessResult,
  DemandAllocationResult,
  DemandMetric,
  DemandSummary,
  ExternalDemandResult,
  IslandScoreResult,
  ScoreComponent,
  ScoreStatus,
  ScoringSnapshot,
  ServiceScore
} from './types';

import { isGroundAirport } from './airport-evidence';
import { scoringConfig } from './config';
import {
  AIR_TRANSPORT_TYPES,
  bestEducationService,
  bestHealthService,
  buildDemandAllocation,
  demandAllocationFor,
  directConnections,
  educationDemand,
  educationServices,
  healthDemand,
  healthServices,
  populationForIsland,
  totalPopulation,
  transportServices
} from './demand-allocation';
import { calculateEmploymentScore } from './employment-score';
import { calculateSustainabilityScore } from './sustainability-score';
import { calculateTransportDemand } from './transport-demand';

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

function healthQuality(service: Service): number {
  return scoringConfig.healthQuality[service.subtype as keyof typeof scoringConfig.healthQuality] ?? 0;
}

function educationQuality(service: Service): number {
  return scoringConfig.educationQuality[service.subtype as keyof typeof scoringConfig.educationQuality] ?? 0;
}

export function calculateCrowdedness(island: Island, population: number | null): CrowdednessResult {
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
  // Use a bounded curve instead of capping every density above the reference
  // at the same pressure. This preserves differences between dense islands.
  const pressure = density / (density + scoringConfig.densityReferencePersonsPerKm2);
  const healthFactor = Math.max(scoringConfig.minimumCrowdingFactor, 1 - scoringConfig.healthCrowdingImpact * pressure);
  const educationFactor = Math.max(
    scoringConfig.minimumCrowdingFactor,
    1 - scoringConfig.educationCrowdingImpact * pressure
  );
  return {
    // Crowdedness is a severity score: higher density pressure means more crowded.
    score: round(pressure * 100),
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
  const hasAirport = (targetIslandId: string) =>
    snapshot.services.some((service) => service.islandId === targetIslandId && isGroundAirport(service));
  if (hasAirport(islandId)) return { available: true, source: 'own_airport', airportIslandId: islandId };

  const visited = new Set([islandId]);
  const pending = [islandId];
  for (let index = 0; index < pending.length; index += 1) {
    const currentIslandId = pending[index];
    for (const connection of directConnections(snapshot, currentIslandId)) {
      if (connection.routeType !== 'land' || visited.has(connection.islandId)) continue;
      if (hasAirport(connection.islandId)) {
        return { available: true, source: 'land_connection', airportIslandId: connection.islandId };
      }
      visited.add(connection.islandId);
      pending.push(connection.islandId);
    }
  }
  return { available: false, source: 'unavailable', airportIslandId: null };
}

function demandFactor(metric: DemandMetric | undefined, population: number | null): number | null {
  if (!metric || population === null) return null;
  const denominator = Math.max(1, population);
  return round(
    Math.max(
      scoringConfig.minimumExternalDemandFactor,
      1 - scoringConfig.externalDemandImpact * ((metric.local + metric.inbound) / denominator)
    )
  );
}

function weightedDemandFactor(
  metrics: Record<string, DemandMetric> | undefined,
  population: number | null
): number | null {
  if (!metrics || population === null) return null;
  const values = Object.values(metrics)
    .map((metric) => ({ value: demandFactor(metric, population), weight: metric.local + metric.inbound }))
    .filter((entry): entry is { value: number; weight: number } => entry.value !== null && entry.weight > 0);
  if (values.length === 0) return null;
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  return round(values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight);
}

function externalDemand(
  population: number | null,
  demand: DemandSummary | undefined,
  crowding: CrowdednessResult
): ExternalDemandResult {
  const localHealthDemand = demand?.health.local ?? 0;
  const localEducationDemand = demand?.education.local ?? 0;
  const inboundHealthDemand = demand?.health.inbound ?? 0;
  const inboundEducationDemand = demand?.education.inbound ?? 0;
  const outboundHealthDemand = demand?.health.outbound ?? 0;
  const outboundEducationDemand = demand?.education.outbound ?? 0;
  const denominator = population === null ? null : Math.max(1, population);
  const healthPressure = denominator === null ? null : (localHealthDemand + inboundHealthDemand) / denominator;
  const educationPressure = denominator === null ? null : (localEducationDemand + inboundEducationDemand) / denominator;
  const inboundHealthPressure = denominator === null ? null : inboundHealthDemand / denominator;
  const inboundEducationPressure = denominator === null ? null : inboundEducationDemand / denominator;
  const healthFactor =
    weightedDemandFactor(demand?.healthByNeed, population) ?? demandFactor(demand?.health, population);
  const educationFactor =
    weightedDemandFactor(demand?.educationByNeed, population) ?? demandFactor(demand?.education, population);
  const limitations = [
    'Service demand is estimated from age-based population need; validated service capacity is not stored in the current database.',
    'Health pressure uses one non-elderly baseline plus hospital-only chronic and emergency overlays; intentional elderly hospital overlays can duplicate destination inbound demand.',
    'Aggregate demand percentages are capped at 100%; detailed service rows may represent multiple needs for the same resident.',
    ...(crowding.status === 'unavailable' ? ['Destination land area is unavailable for demand adjustment.'] : [])
  ];
  return {
    inboundHealthDemand: round(inboundHealthDemand),
    inboundEducationDemand: round(inboundEducationDemand),
    localHealthDemand: round(localHealthDemand),
    localEducationDemand: round(localEducationDemand),
    outboundHealthDemand: round(outboundHealthDemand),
    outboundEducationDemand: round(outboundEducationDemand),
    healthPressure: healthPressure === null ? null : round(healthPressure),
    educationPressure: educationPressure === null ? null : round(educationPressure),
    inboundHealthPressure: inboundHealthPressure === null ? null : round(inboundHealthPressure),
    inboundEducationPressure: inboundEducationPressure === null ? null : round(inboundEducationPressure),
    healthFactor: healthFactor === null ? null : round(healthFactor),
    educationFactor: educationFactor === null ? null : round(educationFactor),
    status: population === null ? 'unavailable' : 'partial',
    limitations
  };
}

function serviceBreakdown(
  island: Island,
  snapshot: ScoringSnapshot,
  kind: 'health' | 'education',
  crowding: CrowdednessResult,
  external: ExternalDemandResult,
  demandAllocations: DemandAllocationResult
): ServiceScore[] {
  const records = populationForIsland(snapshot, island.id);
  const demands = kind === 'health' ? healthDemand(records) : educationDemand(records);
  const result: ServiceScore[] = [];
  for (const [key, demand] of Object.entries(demands)) {
    if (demand <= 0) continue;
    const allocation = demandAllocationFor(demandAllocations, island.id, kind, key);
    const destinationIslandId = allocation?.destinationIslandId ?? null;
    const routeType = allocation?.routeType ?? 'unavailable';
    const destinationServices = destinationIslandId
      ? snapshot.services.filter((service) => service.islandId === destinationIslandId && service.serviceType === kind)
      : [];
    const destinationService =
      kind === 'health' ? bestHealthService(destinationServices, key) : bestEducationService(destinationServices, key);
    const base = destinationService
      ? (kind === 'health' ? healthQuality(destinationService) : educationQuality(destinationService)) *
        (allocation?.routeFactor ?? 0) *
        100
      : null;
    const destination = destinationIslandId
      ? snapshot.islands.find((record) => record.id === destinationIslandId)
      : null;
    const destinationPopulation = destination ? totalPopulation(populationForIsland(snapshot, destination.id)) : null;
    const destinationCrowding = destination ? calculateCrowdedness(destination, destinationPopulation) : crowding;
    const destinationExternal = destination
      ? externalDemand(destinationPopulation, demandAllocations.byIsland.get(destination.id), destinationCrowding)
      : external;
    const destinationDemand = destination ? demandAllocations.byIsland.get(destination.id) : undefined;
    const demandMetric = destinationDemand
      ? kind === 'health'
        ? destinationDemand.healthByNeed[key]
        : destinationDemand.educationByNeed[key]
      : undefined;
    const demandFactorValue =
      demandFactor(demandMetric, destinationPopulation) ??
      (kind === 'health' ? destinationExternal.healthFactor : destinationExternal.educationFactor);
    const crowdingFactor = kind === 'health' ? destinationCrowding.healthFactor : destinationCrowding.educationFactor;
    const demandSource: ServiceScore['demandSource'] =
      destinationIslandId === null ? 'unserved' : destinationIslandId === island.id ? 'local' : 'outbound';
    result.push({
      key,
      score: base === null ? 0 : round(base * (demandFactorValue ?? 1) * (crowdingFactor ?? 1)),
      demand,
      demandSource,
      destinationIslandId,
      routeType,
      status: 'partial',
      limitations: [
        ...(base === null
          ? ['No matching local or reachable service was found; this need contributes partial score 0.']
          : []),
        ...(destinationCrowding.status === 'unavailable' ? ['Destination land area is unavailable.'] : []),
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
  transportDemand: IslandScoreResult['transport']['demand']
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
    services.filter((service) => AIR_TRANSPORT_TYPES.includes(service.subtype as (typeof AIR_TRANSPORT_TYPES)[number]))
      .length + (airport.source === 'land_connection' ? 1 : 0);
  const land = transportComponent(
    transportDemand.modes.land.score ?? (landEvidence > 0 ? 100 : population === null ? null : 0),
    population,
    landEvidence,
    1,
    ['Local road-network distance and capacity are unavailable.']
  );
  const marine = transportComponent(
    transportDemand.modes.marine.score ?? (marineEvidence > 0 ? 100 : population === null ? null : 0),
    population,
    marineEvidence,
    1,
    ['Marine travel time and terminal capacity are unavailable.']
  );
  const air = transportComponent(
    transportDemand.modes.air.score ?? (airport.available ? 100 : population === null ? null : 0),
    population,
    airEvidence,
    1,
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
    hubImpacts: transportDemand.hubImpacts,
    demand: transportDemand
  };
}

function sustainabilityScore(
  islandId: string,
  snapshot: ScoringSnapshot,
  population: number | null,
  airport: AirportAccess,
  transportDemand: IslandScoreResult['transport']['demand']
): IslandScoreResult['sustainability'] {
  const airLinkExists =
    airport.available ||
    snapshot.connections.some(
      (connection) =>
        connection.scoreEligible !== false &&
        connection.connectionType === 'air' &&
        (connection.fromIslandId === islandId || connection.toIslandId === islandId)
    );
  return calculateSustainabilityScore({
    totalPopulation: population,
    vehicleCounts: (snapshot.vehicleCounts ?? []).filter((row) => row.islandId === islandId),
    transportDemand: {
      land: transportDemand.modes.land.stopCount > 0 ? transportDemand.modes.land.totalDemand : null,
      marine: transportDemand.modes.marine.stopCount > 0 ? transportDemand.modes.marine.totalDemand : null,
      air: transportDemand.modes.air.stopCount > 0 ? transportDemand.modes.air.totalDemand : null
    },
    airLinkExists
  });
}

export function calculateIslandScore(
  islandId: string,
  snapshot: ScoringSnapshot,
  demandAllocations: DemandAllocationResult | undefined = undefined
): IslandScoreResult {
  const island = snapshot.islands.find((record) => record.id === islandId);
  if (!island) throw new Error(`Island ${islandId} was not found`);

  const populationRecords = populationForIsland(snapshot, island.id);
  const population = totalPopulation(populationRecords);
  const crowding = calculateCrowdedness(island, population);
  const allocations = demandAllocations ?? buildDemandAllocation(snapshot);
  const islandDemand = allocations.byIsland.get(island.id);
  if (!islandDemand) throw new Error(`Demand allocation is missing for island ${island.id}`);
  const external = externalDemand(population, islandDemand, crowding);
  const airport = airportAccess(snapshot, island.id);
  const transportDemand = calculateTransportDemand(island.id, snapshot, allocations);
  const healthBreakdown = serviceBreakdown(island, snapshot, 'health', crowding, external, allocations);
  const educationBreakdown = serviceBreakdown(island, snapshot, 'education', crowding, external, allocations);
  const health = scoreFromBreakdown(healthBreakdown, population, crowding.healthFactor, [
    ...external.limitations,
    'Health access prioritizes clinics for children/adolescents, accepts all health subtypes for the non-elderly baseline, and routes chronic elderly demand through reachable hospitals or explicit same-atoll/central fallback overlays.'
  ]);
  const education = scoreFromBreakdown(educationBreakdown, population, crowding.educationFactor, [
    ...external.limitations,
    'Education relocation support and approved travel times are not stored in the current database; same-atoll and central overlays are demand evidence rather than invented route access.'
  ]);
  const transport = transportScores(island, snapshot, population, airport, transportDemand);
  const employment = calculateEmploymentScore(island.id, snapshot);
  const sustainability = sustainabilityScore(island.id, snapshot, population, airport, transportDemand);
  const overallScore = weightedMean([
    { value: health.score, weight: scoringConfig.domainWeights.health },
    { value: education.score, weight: scoringConfig.domainWeights.education },
    { value: transport.score, weight: scoringConfig.domainWeights.transport },
    { value: employment.score, weight: scoringConfig.domainWeights.employment },
    { value: sustainability.score, weight: scoringConfig.domainWeights.sustainability }
  ]);
  const limitations = [
    ...(crowding.status === 'unavailable' ? ['Land area or population is unavailable for crowdedness.'] : []),
    ...health.limitations,
    ...education.limitations,
    ...employment.limitations,
    ...sustainability.limitations,
    ...transport.limitations,
    ...transportDemand.hubImpacts.map((hub) => hub.limitation).filter((value): value is string => value !== null)
  ];
  return {
    islandId: island.id,
    islandName: island.name,
    overall: component(overallScore, null, population, 5, limitations),
    health,
    education,
    employment,
    sustainability,
    transport,
    crowdedness: crowding,
    demand: islandDemand,
    externalDemand: external,
    airportAccess: airport,
    limitations: [...new Set(limitations)],
    assumptions: [
      'Cross-island health and education demand uses eligible connected paths, same-atoll fallbacks, and Malé/Hulhumalé overlays when route evidence is missing.',
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
    (connection) =>
      connection.scoreEligible !== false && (connection.fromIslandId === islandId || connection.toIslandId === islandId)
  );
}
