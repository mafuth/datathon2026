import type { AnalyticsIsland } from './national-analytics-card.svelte';

export type AccessLandscapePoint = {
  island: AnalyticsIsland;
  health: number;
  education: number;
  transport: number | null;
  x: number;
  y: number;
};

function validScore(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Compare like-for-like populated islands, retaining genuine zero scores. */
export function accessLandscapePoints(islands: readonly AnalyticsIsland[]): AccessLandscapePoint[] {
  return islands
    .flatMap((island) => {
      const health = island.health.score;
      const education = island.education.score;
      if (!island.population || island.population <= 0 || !validScore(health) || !validScore(education)) return [];
      return [
        {
          island,
          health,
          education,
          transport: validScore(island.transport.score) ? island.transport.score : null,
          x: 46 + health * 3.18,
          y: 242 - education * 2
        }
      ];
    })
    .sort((a, b) => a.island.name.localeCompare(b.island.name) || a.island.id.localeCompare(b.island.id));
}

export function transportScoreTone(score: number | null): string {
  return score === null
    ? 'var(--mobility-chart-reference)'
    : `color-mix(in srgb, var(--mobility-transport-tone-high) ${score}%, var(--mobility-transport-tone-low))`;
}
