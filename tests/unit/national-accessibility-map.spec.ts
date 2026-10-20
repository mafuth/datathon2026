import { describe, expect, it } from 'vitest';

import {
  buildZoomInterpolation,
  NATIONAL_ISLAND_FILL_OPACITY_STOPS,
  NATIONAL_ISLAND_FILL_START_ZOOM,
  NATIONAL_SCORE_FIELD_OPACITY_STOPS,
  NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM
} from '../../src/lib/components/mobility/national-accessibility-map-style';

describe('national accessibility map zoom handoff', () => {
  it('keeps score fields visible past the old cutoff and crossfades island fill', () => {
    expect(NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM).toBe(7.4);
    expect(NATIONAL_SCORE_FIELDS_HANDOFF_ZOOM).toBeGreaterThan(6.8);
    expect(NATIONAL_ISLAND_FILL_START_ZOOM).toBe(5.8);
    expect(NATIONAL_SCORE_FIELD_OPACITY_STOPS).toEqual([
      [4.4, 0.58],
      [5.8, 0.46],
      [7.4, 0]
    ]);
    expect(NATIONAL_ISLAND_FILL_OPACITY_STOPS).toEqual([
      [5.8, 0.18],
      [7.4, 0.92]
    ]);
    expect(buildZoomInterpolation(NATIONAL_SCORE_FIELD_OPACITY_STOPS)).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      4.4,
      0.58,
      5.8,
      0.46,
      7.4,
      0
    ]);
  });
});
