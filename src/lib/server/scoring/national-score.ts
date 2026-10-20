import type { IslandScoreResult, NationalScoreResult, ScoreComponent, ScoreStatus } from './types';

import { loadScoringSnapshot } from './database-input';
import { getIslandScore } from './island-score';

function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2));
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

export async function getNationalScore(): Promise<NationalScoreResult> {
  const snapshot = await loadScoringSnapshot();
  const inhabitedIslands = snapshot.islands.filter((island) => island.islandType === 'inhabited');
  const scores = await Promise.all(inhabitedIslands.map((island) => getIslandScore(island.id, snapshot)));
  const numericScores = scores.filter((result) => result.overall.score !== null);
  const health = aggregateComponent(numericScores, (result) => result.health);
  const education = aggregateComponent(numericScores, (result) => result.education);
  const transport = aggregateComponent(numericScores, (result) => result.transport);
  const land = aggregateComponent(numericScores, (result) => result.transport.land);
  const marine = aggregateComponent(numericScores, (result) => result.transport.marine);
  const air = aggregateComponent(numericScores, (result) => result.transport.air);
  const overall = average(numericScores.map((result) => result.overall.score));
  const hasPartial = scores.some((result) => result.overall.status === 'partial');
  const status: ScoreStatus = overall === null ? 'unavailable' : hasPartial ? 'partial' : 'numeric';
  const limitations = [
    ...new Set(scores.flatMap((result) => result.limitations)),
    ...(numericScores.length < scores.length
      ? ['Unavailable island scores were excluded from the national average.']
      : [])
  ];
  return {
    score: overall,
    status,
    health,
    education,
    transport: { ...transport, land, marine, air },
    crowdedness: aggregateCrowdedness(numericScores),
    externalDemand: externalDemandComponent(numericScores),
    islandCount: snapshot.islands.length,
    inhabitedIslandCount: inhabitedIslands.length,
    scoredIslandCount: numericScores.length,
    partialIslandCount: scores.filter((result) => result.overall.status === 'partial').length,
    unavailableIslandCount: scores.filter((result) => result.overall.status === 'unavailable').length,
    scores,
    limitations
  };
}
