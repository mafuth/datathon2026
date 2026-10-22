import type { AnalyticsIsland } from '../../src/lib/components/mobility/national-analytics-card.svelte';

import { describe, expect, it } from 'vitest';

import { accessLandscapePoints, transportScoreTone } from '../../src/lib/components/mobility/national-chart-data';

const island = (
  id: string,
  health: number | null,
  education: number | null,
  transport: number | null,
  population: number | null = 100
): AnalyticsIsland =>
  ({
    id,
    name: id,
    atollName: 'Test',
    population,
    health: { score: health },
    education: { score: education },
    transport: { score: transport }
  }) as AnalyticsIsland;

describe('national access landscape', () => {
  it('compares populated islands with paired valid scores, preserving real zero and missing colour evidence', () => {
    const points = accessLandscapePoints([
      island('zero', 0, 100, null),
      island('full', 100, 0, 100),
      island('missing', null, 60, 50),
      island('bad', NaN, 60, 50),
      island('range', 101, 60, 50),
      island('no-population', 50, 60, 50, null),
      island('empty', 50, 60, 50, 0)
    ]);
    expect(points.map((point) => point.island.id)).toEqual(['full', 'zero']);
    expect(points[0]).toMatchObject({ x: 364, y: 242, transport: 100 });
    expect(points[1]).toMatchObject({ x: 46, y: 42, transport: null });
  });

  it('does not turn invalid transport evidence into a low score or mutate source order', () => {
    const input = [island('z', 20, 30, Infinity), island('a', 80, 70, 0)];
    expect(accessLandscapePoints(input).map((point) => point.transport)).toEqual([0, null]);
    expect(input.map((point) => point.id)).toEqual(['z', 'a']);
    expect(transportScoreTone(null)).not.toBe(transportScoreTone(0));
  });
});
