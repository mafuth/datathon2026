import type { IslandDemandMetric, IslandPopulationBand } from '../../src/lib/components/mobility/island-profile';

import { describe, expect, it } from 'vitest';

import {
  chartScore,
  demandComposition,
  ISLAND_SCORE_CATEGORIES,
  islandScoreHighlights,
  islandScoreMetrics,
  populationComposition,
  populationWaffle
} from '../../src/lib/components/mobility/island-chart-data';

const metric: IslandDemandMetric = {
  local: 30,
  inbound: 10,
  outbound: 120,
  unserved: 8,
  combined: 40,
  demandPercent: 40,
  outboundPercent: 100
};

const bands: IslandPopulationBand[] = [
  { key: 'child_population_0_14', label: 'Children', amount: 20, share: 20, overlapping: false },
  { key: 'working_age_population_15_64', label: 'Working age', amount: 60, share: 60, overlapping: false },
  { key: 'elderly_population_65_plus', label: 'Older adults', amount: 15, share: 15, overlapping: false },
  { key: 'youth_population_15_24', label: 'Youth', amount: 40, share: 40, overlapping: true }
];

describe('island chart data', () => {
  it('keeps real zero and full scores, and rejects unavailable or invalid scores', () => {
    expect([0, 57.4, 100, null, undefined, NaN, Infinity, -1, 101].map(chartScore)).toEqual([
      0,
      57.4,
      100,
      null,
      null,
      null,
      null,
      null,
      null
    ]);
  });

  it('compares only the five categories that make up the overall index', () => {
    expect(ISLAND_SCORE_CATEGORIES.map((value) => value.key)).toEqual([
      'health',
      'education',
      'transport',
      'employment',
      'sustainability'
    ]);
    expect(islandScoreMetrics(null).map((value) => value.value)).toEqual([null, null, null, null, null]);
  });

  it('finds highest/lowest available categories without treating missing data as zero or mutating input', () => {
    const metrics = [
      { key: 'a', label: 'A', value: null },
      { key: 'b', label: 'B', value: 0 },
      { key: 'c', label: 'C', value: 80 }
    ];
    expect(islandScoreHighlights(metrics)).toEqual({ strongest: metrics[2], weakest: metrics[1] });
    expect(metrics.map((value) => value.key)).toEqual(['a', 'b', 'c']);
    expect(islandScoreHighlights([metrics[2]])).toEqual({ strongest: null, weakest: null });
    expect(islandScoreHighlights([metrics[2], { key: 'd', label: 'D', value: 80 }])).toEqual({
      strongest: null,
      weakest: null
    });
  });

  it('builds on-island demand composition from local + inbound only; outbound/unserved remain independent', () => {
    expect(demandComposition(metric)).toEqual({
      local: 30,
      inbound: 10,
      combined: 40,
      localShare: 75,
      inboundShare: 25,
      outbound: 120,
      unserved: 8
    });
    expect(demandComposition({ ...metric, outbound: 9999, unserved: 9999 }).inboundShare).toBe(25);
    expect(demandComposition({ ...metric, combined: 9999 }).combined).toBe(40);
  });

  it('distinguishes empty composition from unavailable demand without NaN shares', () => {
    expect(demandComposition({ ...metric, local: 0, inbound: 0 })).toMatchObject({
      combined: 0,
      localShare: null,
      inboundShare: null
    });
    expect(demandComposition(null)).toMatchObject({ combined: null, local: null, inbound: null });
    expect(demandComposition({ ...metric, local: NaN })).toMatchObject({ combined: null, localShare: null });
  });

  it('uses only nonoverlapping age bands and retains an explicit unclassified remainder', () => {
    const composition = populationComposition(bands, 100);
    expect(composition?.map((value) => value.amount)).toEqual([20, 60, 15, 5]);
    expect(composition?.reduce((total, value) => total + value.share, 0)).toBe(100);
    expect(composition?.map((value) => value.key)).not.toContain('youth_population_15_24');
  });

  it('does not invent a population pie when age groups are missing, overlapping, or exceed the population', () => {
    expect(populationComposition(bands.slice(0, 2), 100)).toBeNull();
    expect(populationComposition(bands, 90)).toBeNull();
    expect(populationComposition(bands, 0)).toBeNull();
    expect(
      populationComposition(
        bands.map((band) => ({ ...band, overlapping: true })),
        100
      )
    ).toBeNull();
  });

  it('rounds the population waffle to exactly 100 cells without changing its denominator', () => {
    const parts = populationComposition(bands, 100)!;
    const cells = populationWaffle(parts);
    expect(cells).toHaveLength(100);
    expect(parts.map((part) => cells.filter((key) => key === part.key).length)).toEqual([20, 60, 15, 5]);
    const thirds = ['a', 'b', 'c'].map((key) => ({ key, label: key, amount: 1, share: 100 / 3 }));
    const rounded = populationWaffle(thirds);
    expect(thirds.map((part) => rounded.filter((key) => key === part.key).length)).toEqual([34, 33, 33]);
    expect(thirds.map((part) => part.amount)).toEqual([1, 1, 1]);
    expect(populationWaffle([])).toEqual([]);
    expect(populationWaffle([{ key: 'unknown', label: 'Unknown', amount: NaN, share: 100 }])).toEqual([]);
  });
});
