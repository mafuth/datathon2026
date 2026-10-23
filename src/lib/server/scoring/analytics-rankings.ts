export type AnalyticsRankingInput = {
  id: string;
  label?: string;
  overall: number | null;
  health: number | null;
  education: number | null;
  transport: number | null;
  employment?: number | null;
  workingAgePopulation?: number | null;
  jobDensity?: number | null;
  jobDemand?: number | null;
  jobSupply?: number | null;
  demand: number;
  outboundDemand?: number;
  pressure: number | null;
  pollutionPressure?: number | null;
};

export type AnalyticsRank = {
  id: string;
  value: number;
};

export type AnalyticsRankings = {
  demand: AnalyticsRank[];
  outbound: AnalyticsRank[];
  underserved: AnalyticsRank[];
  overall: AnalyticsRank[];
  health: AnalyticsRank[];
  education: AnalyticsRank[];
  transport: AnalyticsRank[];
  employment: AnalyticsRank[];
  jobRichLowPopulation: AnalyticsRank[];
  jobDemandGaps: AnalyticsRank[];
  highestPollution: AnalyticsRank[];
};

type ScoreKey = 'overall' | 'health' | 'education' | 'transport' | 'employment';

function compareLabels(left: AnalyticsRankingInput, right: AnalyticsRankingInput): number {
  return (left.label ?? left.id).localeCompare(right.label ?? right.id) || left.id.localeCompare(right.id);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function lowestScores(islands: AnalyticsRankingInput[], key: ScoreKey): AnalyticsRank[] {
  return [...islands]
    .map((island) => ({ island, value: island[key] }))
    .filter((entry): entry is { island: AnalyticsRankingInput; value: number } => isFiniteNumber(entry.value))
    .sort((left, right) => left.value - right.value || compareLabels(left.island, right.island))
    .slice(0, 4)
    .map(({ island, value }) => ({ id: island.id, value }));
}

function percentile(value: number, values: number[]): number {
  if (values.length <= 1) return 50;
  const less = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  return ((less + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
}

function jobDemandGaps(islands: AnalyticsRankingInput[]): AnalyticsRank[] {
  const eligible = islands.filter(
    (island): island is AnalyticsRankingInput & { jobDemand: number; jobSupply: number } =>
      isFiniteNumber(island.jobDemand) && isFiniteNumber(island.jobSupply)
  );
  const demandValues = eligible.map((island) => island.jobDemand);
  const supplyValues = eligible.map((island) => island.jobSupply);

  return eligible
    .map((island) => ({
      island,
      value: (percentile(island.jobDemand, demandValues) + (100 - percentile(island.jobSupply, supplyValues))) / 2
    }))
    .sort(
      (left, right) =>
        right.value - left.value ||
        right.island.jobDemand - left.island.jobDemand ||
        left.island.jobSupply - right.island.jobSupply ||
        compareLabels(left.island, right.island)
    )
    .slice(0, 4)
    .map(({ island, value }) => ({ id: island.id, value }));
}

export function buildAnalyticsRankings(islands: AnalyticsRankingInput[]): AnalyticsRankings {
  return {
    demand: islands
      .filter((island) => isFiniteNumber(island.demand) && island.demand > 0)
      .sort((left, right) => right.demand - left.demand || compareLabels(left, right))
      .slice(0, 3)
      .map((island) => ({ id: island.id, value: island.demand })),
    outbound: islands
      .filter((island) => isFiniteNumber(island.outboundDemand) && island.outboundDemand > 0)
      .sort((left, right) => (right.outboundDemand ?? 0) - (left.outboundDemand ?? 0) || compareLabels(left, right))
      .slice(0, 3)
      .map((island) => ({ id: island.id, value: island.outboundDemand ?? 0 })),
    underserved: islands
      .filter((island): island is AnalyticsRankingInput & { overall: number } => isFiniteNumber(island.overall))
      .map((island) => ({ island, value: (100 - island.overall) * (1 + (island.pressure ?? 0)) }))
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.island.overall - right.island.overall ||
          (right.island.pressure ?? -1) - (left.island.pressure ?? -1) ||
          compareLabels(left.island, right.island)
      )
      .slice(0, 4)
      .map(({ island, value }) => ({ id: island.id, value })),
    overall: lowestScores(islands, 'overall'),
    health: lowestScores(islands, 'health'),
    education: lowestScores(islands, 'education'),
    transport: lowestScores(islands, 'transport'),
    employment: lowestScores(islands, 'employment'),
    jobRichLowPopulation: islands
      .filter((island): island is AnalyticsRankingInput & { jobDensity: number } => isFiniteNumber(island.jobDensity))
      .sort(
        (left, right) =>
          right.jobDensity - left.jobDensity ||
          (left.workingAgePopulation ?? Number.POSITIVE_INFINITY) -
            (right.workingAgePopulation ?? Number.POSITIVE_INFINITY) ||
          compareLabels(left, right)
      )
      .slice(0, 4)
      .map((island) => ({ id: island.id, value: island.jobDensity })),
    jobDemandGaps: jobDemandGaps(islands),
    highestPollution: islands
      .filter((island): island is AnalyticsRankingInput & { pollutionPressure: number } =>
        isFiniteNumber(island.pollutionPressure)
      )
      .sort((left, right) => right.pollutionPressure - left.pollutionPressure || compareLabels(left, right))
      .slice(0, 4)
      .map((island) => ({ id: island.id, value: island.pollutionPressure }))
  };
}
