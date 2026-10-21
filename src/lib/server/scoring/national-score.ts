import type {
  DemandAllocationResult,
  DemandMetric,
  DemandSummary,
  EmploymentCategory,
  EmploymentScoreResult,
  InboundDemandSource,
  IslandScoreResult,
  NationalScoreResult,
  ScoreComponent,
  ScoreStatus,
  ScoringSnapshot,
  SustainabilityScoreResult,
  TransportStopMode
} from './types';

import { loadScoringSnapshot } from './database-input';
import { buildDemandAllocation, populationForIsland, totalPopulation } from './demand-allocation';
import { getIslandScore } from './island-score';
import { calculateSustainabilityScore } from './sustainability-score';

function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2));
}

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function aggregateDemandMetric(
  results: IslandScoreResult[],
  selector: (result: IslandScoreResult) => DemandMetric
): DemandMetric {
  const metrics = results.map(selector);
  const local = sum(metrics.map((metric) => metric.local));
  const inbound = sum(metrics.map((metric) => metric.inbound));
  const outbound = sum(metrics.map((metric) => metric.outbound));
  const unserved = sum(metrics.map((metric) => metric.unserved));
  const population = sum(results.map((result) => result.demand.population ?? 0));
  return {
    local,
    inbound,
    outbound,
    unserved,
    combined: sum([local, inbound]),
    demandPercent: population > 0 ? Number(Math.min(1, (local + inbound) / population).toFixed(2)) : null,
    outboundPercent: population > 0 ? Number(Math.min(1, outbound / population).toFixed(2)) : null
  };
}

function aggregateDemandByNeed(
  results: IslandScoreResult[],
  category: 'health' | 'education'
): Record<string, DemandMetric> {
  const keys = new Set(
    results.flatMap((result) =>
      Object.keys(category === 'health' ? result.demand.healthByNeed : result.demand.educationByNeed)
    )
  );
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      aggregateDemandMetric(
        results,
        (result) =>
          (category === 'health' ? result.demand.healthByNeed : result.demand.educationByNeed)[key] ?? {
            local: 0,
            inbound: 0,
            outbound: 0,
            unserved: 0,
            combined: 0,
            demandPercent: null,
            outboundPercent: null
          }
      )
    ])
  );
}

function aggregateDemand(results: IslandScoreResult[]): DemandSummary {
  const populationValues = results
    .map((result) => result.demand.population)
    .filter((value): value is number => value !== null);
  const population = populationValues.length === 0 ? null : sum(populationValues);
  return {
    population,
    health: aggregateDemandMetric(results, (result) => result.demand.health),
    education: aggregateDemandMetric(results, (result) => result.demand.education),
    healthByNeed: aggregateDemandByNeed(results, 'health'),
    educationByNeed: aggregateDemandByNeed(results, 'education'),
    inboundSources: aggregateInboundSources(results)
  };
}

function aggregateInboundSources(results: IslandScoreResult[]): InboundDemandSource[] {
  const sources = new Map<string, InboundDemandSource>();
  for (const result of results) {
    for (const source of result.demand.inboundSources) {
      const current = sources.get(source.originIslandId) ?? {
        originIslandId: source.originIslandId,
        health: 0,
        education: 0,
        total: 0
      };
      current.health += source.health;
      current.education += source.education;
      current.total += source.total;
      sources.set(source.originIslandId, current);
    }
  }
  return [...sources.values()]
    .map((source) => ({
      ...source,
      health: sum([source.health]),
      education: sum([source.education]),
      total: sum([source.total])
    }))
    .sort((left, right) => right.total - left.total || left.originIslandId.localeCompare(right.originIslandId));
}

function aggregateComponents(components: ScoreComponent[]): ScoreComponent {
  const score = average(components.map((component) => component.score));
  const baseScore = average(components.map((component) => component.baseScore));
  const adjustmentFactor = average(components.map((component) => component.adjustmentFactor));
  const denominatorPopulation = average(components.map((component) => component.denominatorPopulation));
  const numericPopulation = average(components.map((component) => component.numericPopulation));
  const partial = components.some((component) => component.status === 'partial');
  return {
    baseScore,
    score,
    adjustmentFactor,
    status: score === null ? 'unavailable' : partial ? 'partial' : 'numeric',
    coverageRatio: average(components.map((component) => component.coverageRatio)) ?? 0,
    denominatorPopulation,
    numericPopulation,
    evidenceCount: components.reduce((sum, component) => sum + component.evidenceCount, 0),
    limitations: [...new Set(components.flatMap((component) => component.limitations))]
  };
}

function aggregateComponent(
  results: IslandScoreResult[],
  selector: (result: IslandScoreResult) => ScoreComponent
): ScoreComponent {
  return aggregateComponents(results.map(selector));
}

function aggregateCrowdedness(results: IslandScoreResult[]): ScoreComponent {
  const components: ScoreComponent[] = results.map(
    (result) =>
      ({
        baseScore: result.crowdedness.score,
        score: result.crowdedness.score,
        adjustmentFactor: 1,
        status: result.crowdedness.status,
        coverageRatio: result.crowdedness.score === null ? 0 : 1,
        denominatorPopulation: result.crowdedness.population,
        numericPopulation: result.crowdedness.population,
        evidenceCount: result.crowdedness.score === null ? 0 : 1,
        limitations: result.crowdedness.status === 'unavailable' ? ['Crowdedness data is unavailable.'] : []
      }) satisfies ScoreComponent
  );
  return aggregateComponents(components);
}

function aggregateEmployment(results: IslandScoreResult[]): EmploymentScoreResult {
  const foreignPopulation = sum(results.map((result) => result.employment.foreignPopulation));
  const workingAgeValues = results
    .map((result) => result.employment.workingAgePopulation)
    .filter((value): value is number => value !== null);
  const workingAgePopulation = workingAgeValues.length > 0 ? sum(workingAgeValues) : null;
  const jobLocationCount = results.reduce((total, result) => total + result.employment.jobLocationCount, 0);
  const score = average(results.map((result) => result.employment.score));
  const categories = new Map<string, EmploymentCategory>();
  for (const result of results) {
    for (const category of result.employment.categories) {
      const current = categories.get(category.key) ?? {
        key: category.key,
        label: category.label,
        count: 0,
        subcategories: []
      };
      current.count += category.count;
      for (const subcategory of category.subcategories) {
        const currentSubcategory = current.subcategories.find((entry) => entry.key === subcategory.key);
        if (currentSubcategory) currentSubcategory.count += subcategory.count;
        else current.subcategories.push({ ...subcategory });
      }
      current.subcategories.sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
      categories.set(category.key, current);
    }
  }
  return {
    baseScore: score,
    score,
    adjustmentFactor: score === null ? null : 1,
    status: score === null ? 'unavailable' : 'partial',
    coverageRatio: average(results.map((result) => result.employment.coverageRatio)) ?? 0,
    denominatorPopulation: workingAgePopulation,
    numericPopulation: score === null ? null : workingAgePopulation,
    evidenceCount: jobLocationCount,
    limitations: [...new Set(results.flatMap((result) => result.employment.limitations))],
    foreignPopulation,
    foreignPopulationSource: results.some((result) => result.employment.foreignPopulationSource === 'assumed_zero')
      ? 'assumed_zero'
      : 'observed',
    workingAgePopulation,
    jobLocationCount,
    foreignPerWorkingAge:
      workingAgePopulation && workingAgePopulation > 0 ? round(foreignPopulation / workingAgePopulation) : null,
    foreignPerJobLocation: round(foreignPopulation / Math.max(1, jobLocationCount)),
    jobLocationsPerThousandWorkingAge:
      workingAgePopulation && workingAgePopulation > 0 ? round((jobLocationCount / workingAgePopulation) * 1000) : null,
    pressureScore: average(results.map((result) => result.employment.pressureScore)),
    supplyScore: average(results.map((result) => result.employment.supplyScore)),
    categories: [...categories.values()].sort(
      (left, right) => right.count - left.count || left.key.localeCompare(right.key)
    )
  };
}

function aggregateSustainabilityDemand(results: IslandScoreResult[], mode: TransportStopMode): number | null {
  const values = results
    .filter((result) => result.transport.demand.modes[mode].stopCount > 0)
    .map((result) => result.transport.demand.modes[mode].totalDemand);
  return values.length === 0 ? null : sum(values);
}

function nationalSustainability(
  snapshot: ScoringSnapshot,
  inhabitedIslandIds: Set<string>,
  inhabitedResults: IslandScoreResult[]
): SustainabilityScoreResult {
  const populationValues = snapshot.islands
    .filter((island) => inhabitedIslandIds.has(island.id))
    .map((island) => totalPopulation(populationForIsland(snapshot, island.id)))
    .filter((value): value is number => value !== null);
  const vehicleCounts = (snapshot.vehicleCounts ?? []).filter((row) => inhabitedIslandIds.has(row.islandId));
  const result = calculateSustainabilityScore({
    totalPopulation: populationValues.length === 0 ? null : sum(populationValues),
    vehicleCounts,
    transportDemand: {
      land: aggregateSustainabilityDemand(inhabitedResults, 'land'),
      marine: aggregateSustainabilityDemand(inhabitedResults, 'marine'),
      air: aggregateSustainabilityDemand(inhabitedResults, 'air')
    },
    airLinkExists:
      inhabitedResults.some((island) => island.airportAccess.available) ||
      snapshot.connections.some(
        (connection) =>
          connection.scoreEligible !== false &&
          connection.connectionType === 'air' &&
          (inhabitedIslandIds.has(connection.fromIslandId) || inhabitedIslandIds.has(connection.toIslandId))
      )
  });
  const islandsWithVehicleCounts = new Set(vehicleCounts.map((row) => row.islandId)).size;
  const coverageRatio =
    inhabitedIslandIds.size === 0
      ? result.coverageRatio
      : Math.min(1, islandsWithVehicleCounts / inhabitedIslandIds.size);
  const limitations = [
    ...result.limitations,
    ...(islandsWithVehicleCounts < inhabitedIslandIds.size
      ? [
          `Vehicle-count rows cover ${islandsWithVehicleCounts} of ${inhabitedIslandIds.size} inhabited islands; national vehicle pressure may be understated.`
        ]
      : [])
  ];
  return {
    ...result,
    coverageRatio: result.score === null ? 0 : coverageRatio,
    limitations: [...new Set(limitations)]
  };
}

function externalDemandComponent(results: IslandScoreResult[]): ScoreComponent {
  return {
    baseScore: average(
      results.map((result) => {
        const health = result.externalDemand.healthFactor;
        const education = result.externalDemand.educationFactor;
        return health === null || education === null ? null : ((health + education) / 2) * 100;
      })
    ),
    score: average(
      results.map((result) => {
        const health = result.externalDemand.healthFactor;
        const education = result.externalDemand.educationFactor;
        return health === null || education === null ? null : ((health + education) / 2) * 100;
      })
    ),
    adjustmentFactor: average(
      results.map((result) => {
        const health = result.externalDemand.healthFactor;
        const education = result.externalDemand.educationFactor;
        return health === null || education === null ? null : (health + education) / 2;
      })
    ),
    status: results.some((result) => result.externalDemand.status === 'unavailable') ? 'partial' : 'partial',
    coverageRatio: average(results.map((result) => (result.externalDemand.status === 'unavailable' ? 0 : 1))) ?? 0,
    denominatorPopulation: null,
    numericPopulation: null,
    evidenceCount: results.length,
    limitations: [...new Set(results.flatMap((result) => result.externalDemand.limitations))]
  };
}

export async function getNationalScore(
  snapshot: ScoringSnapshot | undefined = undefined,
  demandAllocations: DemandAllocationResult | undefined = undefined
): Promise<NationalScoreResult> {
  const scoringSnapshot = snapshot ?? (await loadScoringSnapshot());
  const scoringDemandAllocations = demandAllocations ?? buildDemandAllocation(scoringSnapshot);
  const inhabitedIslands = scoringSnapshot.islands.filter((island) => island.islandType === 'inhabited');
  const inhabitedIslandIds = new Set(inhabitedIslands.map((island) => island.id));
  const scores = await Promise.all(
    inhabitedIslands.map((island) => getIslandScore(island.id, scoringSnapshot, scoringDemandAllocations))
  );
  const numericScores = scores.filter((result) => result.overall.score !== null);
  const health = aggregateComponent(numericScores, (result) => result.health);
  const education = aggregateComponent(numericScores, (result) => result.education);
  const employment = aggregateEmployment(scores);
  const transport = aggregateComponent(numericScores, (result) => result.transport);
  const land = aggregateComponent(numericScores, (result) => result.transport.land);
  const marine = aggregateComponent(numericScores, (result) => result.transport.marine);
  const air = aggregateComponent(numericScores, (result) => result.transport.air);
  const sustainability = nationalSustainability(scoringSnapshot, inhabitedIslandIds, scores);
  const overall = average(numericScores.map((result) => result.overall.score));
  const hasPartial = scores.some((result) => result.overall.status === 'partial');
  const status: ScoreStatus = overall === null ? 'unavailable' : hasPartial ? 'partial' : 'numeric';
  const limitations = [
    ...new Set([
      ...scores.flatMap((result) => result.limitations),
      ...sustainability.limitations,
      ...(numericScores.length < scores.length
        ? ['Unavailable island scores were excluded from the national average.']
        : [])
    ])
  ];
  return {
    score: overall,
    status,
    health,
    education,
    employment,
    sustainability,
    transport: { ...transport, land, marine, air },
    crowdedness: aggregateCrowdedness(numericScores),
    demand: aggregateDemand(scores),
    externalDemand: externalDemandComponent(numericScores),
    islandCount: scoringSnapshot.islands.length,
    inhabitedIslandCount: inhabitedIslands.length,
    scoredIslandCount: numericScores.length,
    partialIslandCount: scores.filter((result) => result.overall.status === 'partial').length,
    unavailableIslandCount: scores.filter((result) => result.overall.status === 'unavailable').length,
    scores,
    limitations
  };
}
