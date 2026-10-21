export type AnalyticsRankingInput = {
  id: string;
  overall: number | null;
  health: number | null;
  education: number | null;
  transport: number | null;
  employment?: number | null;
  jobDensity?: number | null;
  jobDemand?: number | null;
  jobSupply?: number | null;
  demand: number;
  outboundDemand?: number;
  pressure: number;
  pollutionPressure?: number | null;
};

export type AnalyticsRankings = {
  demand: string[];
  outbound: string[];
  underserved: string[];
  overall: string[];
  health: string[];
  education: string[];
  transport: string[];
  employment: string[];
  jobRichLowPopulation: string[];
  jobDemandGaps: string[];
  highestPollution: string[];
};

type ScoreKey = 'overall' | 'health' | 'education' | 'transport' | 'employment';

function lowestScores(islands: AnalyticsRankingInput[], key: ScoreKey): string[] {
  return [...islands]
    .filter((island) => typeof island[key] === 'number')
    .sort((left, right) => (left[key] as number) - (right[key] as number) || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((island) => island.id);
}

function percentile(value: number, values: number[]): number {
  if (values.length <= 1) return 50;
  const less = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return ((less + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
}

function jobDemandGaps(islands: AnalyticsRankingInput[]): string[] {
  const eligible = islands.filter(
    (island): island is AnalyticsRankingInput & { jobDemand: number; jobSupply: number } =>
      typeof island.jobDemand === 'number' && typeof island.jobSupply === 'number'
  );
  const demandValues = eligible.map((island) => island.jobDemand);
  const supplyValues = eligible.map((island) => island.jobSupply);

  return eligible
    .map((island) => ({
      id: island.id,
      gap: (percentile(island.jobDemand, demandValues) + (100 - percentile(island.jobSupply, supplyValues))) / 2
    }))
    .sort((left, right) => right.gap - left.gap || left.id.localeCompare(right.id))
    .slice(0, 4)
    .map((island) => island.id);
}

export function buildAnalyticsRankings(islands: AnalyticsRankingInput[]): AnalyticsRankings {
  return {
    demand: islands
      .filter((island) => island.demand > 0)
      .sort((left, right) => right.demand - left.demand || left.id.localeCompare(right.id))
      .slice(0, 3)
      .map((island) => island.id),
    outbound: islands
      .filter((island) => (island.outboundDemand ?? 0) > 0)
      .sort(
        (left, right) => (right.outboundDemand ?? 0) - (left.outboundDemand ?? 0) || left.id.localeCompare(right.id)
      )
      .slice(0, 3)
      .map((island) => island.id),
    underserved: islands
      .slice()
      .sort(
        (left, right) =>
          (100 - (right.overall ?? 100)) * (1 + right.pressure) - (100 - (left.overall ?? 100)) * (1 + left.pressure) ||
          left.id.localeCompare(right.id)
      )
      .slice(0, 4)
      .map((island) => island.id),
    overall: lowestScores(islands, 'overall'),
    health: lowestScores(islands, 'health'),
    education: lowestScores(islands, 'education'),
    transport: lowestScores(islands, 'transport'),
    employment: lowestScores(islands, 'employment'),
    jobRichLowPopulation: islands
      .filter(
        (island): island is AnalyticsRankingInput & { jobDensity: number } => typeof island.jobDensity === 'number'
      )
      .sort((left, right) => right.jobDensity - left.jobDensity || left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((island) => island.id),
    jobDemandGaps: jobDemandGaps(islands),
    highestPollution: islands
      .filter(
        (island): island is AnalyticsRankingInput & { pollutionPressure: number } =>
          typeof island.pollutionPressure === 'number'
      )
      .sort((left, right) => right.pollutionPressure - left.pollutionPressure || left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((island) => island.id)
  };
}
