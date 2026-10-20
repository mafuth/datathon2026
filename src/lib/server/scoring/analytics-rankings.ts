export type AnalyticsRankingInput = {
  id: string;
  overall: number | null;
  health: number | null;
  education: number | null;
  transport: number | null;
  demand: number;
  outboundDemand?: number;
  pressure: number;
};

export type AnalyticsRankings = {
  demand: string[];
  outbound: string[];
  underserved: string[];
  overall: string[];
  health: string[];
  education: string[];
  transport: string[];
};

type ScoreKey = 'overall' | 'health' | 'education' | 'transport';

function lowestScores(islands: AnalyticsRankingInput[], key: ScoreKey): string[] {
  return [...islands]
    .filter((island) => island[key] !== null)
    .sort((left, right) => (left[key] as number) - (right[key] as number) || left.id.localeCompare(right.id))
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
    transport: lowestScores(islands, 'transport')
  };
}
