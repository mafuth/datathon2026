import type { IslandDemandMetric, IslandPopulationBand } from './island-profile';
import type { AnalyticsIsland } from './national-analytics-card.svelte';
import type { ScoreCardMetric } from './score-presentation';

export const ISLAND_SCORE_CATEGORIES = [
  { key: 'health', label: 'Health' },
  { key: 'education', label: 'Education' },
  { key: 'transport', label: 'Transport' },
  { key: 'employment', label: 'Employment' },
  { key: 'sustainability', label: 'Sustainability' }
] as const;

export function chartScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function islandScoreMetrics(island: AnalyticsIsland | null): ScoreCardMetric[] {
  return ISLAND_SCORE_CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    value: chartScore(island?.[key].score)
  }));
}

export function islandScoreHighlights(metrics: readonly ScoreCardMetric[]): {
  strongest: ScoreCardMetric | null;
  weakest: ScoreCardMetric | null;
} {
  const available = metrics.filter((metric) => chartScore(metric.value) !== null);
  if (available.length < 2) return { strongest: null, weakest: null };

  const ordered = [...available].sort((left, right) => (right.value ?? 0) - (left.value ?? 0));
  if (ordered[0].value === ordered[ordered.length - 1].value) return { strongest: null, weakest: null };

  return { strongest: ordered[0], weakest: ordered[ordered.length - 1] };
}

export function chartAmount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function demandComposition(metric: IslandDemandMetric | null | undefined) {
  const local = chartAmount(metric?.local);
  const inbound = chartAmount(metric?.inbound);
  const outbound = chartAmount(metric?.outbound);
  const combined = local === null || inbound === null ? null : local + inbound;
  const chartTotal = local === null || inbound === null || outbound === null ? null : local + inbound + outbound;

  return {
    local,
    inbound,
    outbound,
    combined,
    chartTotal,
    localShare: chartTotal !== null && chartTotal > 0 ? ((local ?? 0) / chartTotal) * 100 : null,
    inboundShare: chartTotal !== null && chartTotal > 0 ? ((inbound ?? 0) / chartTotal) * 100 : null,
    outboundShare: chartTotal !== null && chartTotal > 0 ? ((outbound ?? 0) / chartTotal) * 100 : null,
    unserved: chartAmount(metric?.unserved)
  };
}

export type PopulationCompositionPart = {
  key: string;
  label: string;
  amount: number;
  share: number;
};

export function populationWaffle(parts: readonly PopulationCompositionPart[], cells = 100): string[] {
  if (!Number.isInteger(cells) || cells < 1 || !parts.length) return [];

  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (!Number.isFinite(total) || total <= 0 || parts.some((part) => !Number.isFinite(part.amount) || part.amount < 0)) {
    return [];
  }

  const allocations = parts.map((part, index) => {
    const exact = (part.amount / total) * cells;
    return { key: part.key, index, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let remaining = cells - allocations.reduce((sum, part) => sum + part.count, 0);
  for (const part of [...allocations].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index
  )) {
    if (remaining <= 0) break;
    part.count += 1;
    remaining -= 1;
  }

  return allocations.flatMap((part) => Array.from({ length: part.count }, () => part.key));
}

export function populationComposition(
  bands: readonly IslandPopulationBand[],
  total: number | null
): PopulationCompositionPart[] | null {
  if (chartAmount(total) === null || total === null || total <= 0) return null;

  const definitions = [
    { key: 'child_population_0_14', label: 'Children 0-14' },
    { key: 'working_age_population_15_64', label: 'Working age 15-64' },
    { key: 'elderly_population_65_plus', label: 'Older adults 65+' }
  ];
  const parts: PopulationCompositionPart[] = [];

  for (const definition of definitions) {
    const band = bands.find((entry) => entry.key === definition.key && !entry.overlapping);
    const amount = chartAmount(band?.amount);
    if (amount === null) return null;
    parts.push({ ...definition, amount, share: (amount / total) * 100 });
  }

  const sum = parts.reduce((value, part) => value + part.amount, 0);
  if (sum > total) return null;
  if (sum < total) {
    parts.push({
      key: 'unclassified',
      label: 'Age not classified',
      amount: total - sum,
      share: ((total - sum) / total) * 100
    });
  }

  return parts;
}
