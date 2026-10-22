import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  presentationRoutePosition,
  presentationRouteReveal
} from '../../src/lib/components/mobility/presentation-route';
import { PRESENTATION_STEPS } from '../../src/lib/components/mobility/presentation-story';
import { createMarineRouter } from '../../src/lib/server/scoring/marine-routing';

type Coordinate = [number, number];

describe('presentation route sampling', () => {
  const route: Coordinate[] = [
    [0, 0],
    [3, 0],
    [3, 4],
    [6, 4]
  ];
  const fallback: Coordinate = [73.2, 3.4];

  it('uses cumulative route distance for the camera and vehicle', () => {
    expect(presentationRoutePosition(route, 0.15, fallback)).toEqual([1.5, 0]);
    expect(presentationRoutePosition(route, 0.5, fallback)).toEqual([3, 2]);
    expect(presentationRoutePosition(route, 0.85, fallback)).toEqual([4.5, 4]);
  });

  it('ends the revealed route at the same point as the vehicle', () => {
    for (const progress of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) {
      expect(presentationRouteReveal(route, progress).at(-1)).toEqual(
        presentationRoutePosition(route, progress, fallback)
      );
    }
    expect(presentationRouteReveal(route, 0.5)).toEqual([
      [0, 0],
      [3, 0],
      [3, 2]
    ]);
  });

  it('handles repeated coordinates and clamps the journey endpoints', () => {
    const repeated: Coordinate[] = [
      [0, 0],
      [0, 0],
      [3, 0],
      [3, 0]
    ];
    expect(presentationRoutePosition(repeated, 0.5, fallback)).toEqual([1.5, 0]);
    expect(presentationRouteReveal(repeated, -1)).toEqual([
      [0, 0],
      [0, 0]
    ]);
    expect(presentationRoutePosition(repeated, 2, fallback)).toEqual([3, 0]);
    expect(
      presentationRoutePosition(
        [
          [3, 4],
          [3, 4]
        ],
        0.5,
        fallback
      )
    ).toEqual([3, 4]);
  });

  it('handles missing and single-point routes without mutating source coordinates', () => {
    expect(presentationRoutePosition([], 0.5, fallback)).toEqual(fallback);
    expect(presentationRouteReveal([], 0.5)).toEqual([]);
    expect(presentationRoutePosition([[3, 4]], 0.5, fallback)).toEqual([3, 4]);
    presentationRouteReveal(route, 0.5);
    expect(route).toEqual([
      [0, 0],
      [3, 0],
      [3, 4],
      [6, 4]
    ]);
  });

  it('keeps every static ferry trace and vehicle position outside the complete baseline island coastlines', () => {
    const baseline = JSON.parse(
      readFileSync(new URL('../../data/mobility/normalized/current-db-baseline.json', import.meta.url), 'utf8')
    ) as Pick<ScoringSnapshot, 'islands'>;
    const marine = createMarineRouter(baseline);
    expect(marine.coastlineComplete).toBe(true);
    const ferrySteps = PRESENTATION_STEPS.filter((step) => step.journey?.vehicle === 'ferry');
    expect(ferrySteps).toHaveLength(3);
    for (const step of ferrySteps) {
      const feature = step.mapData.features.find((entry) => entry.id === step.journey?.featureId);
      if (!feature || feature.geometry.type !== 'LineString') throw new Error(`Missing ferry path: ${step.id}`);
      const coordinates = feature.geometry.coordinates;
      expect(marine.isWaterPath(coordinates), step.id).toBe(true);
      expect(presentationRoutePosition(coordinates, 0, fallback)).toEqual(coordinates[0]);
      expect(presentationRoutePosition(coordinates, 1, fallback)).toEqual(coordinates.at(-1));
      for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const trace = presentationRouteReveal(coordinates, progress);
        expect(marine.isWaterPath(trace), `${step.id} at ${progress}`).toBe(true);
        expect(presentationRoutePosition(coordinates, progress, fallback)).toEqual(trace.at(-1));
      }
    }
  });
});
