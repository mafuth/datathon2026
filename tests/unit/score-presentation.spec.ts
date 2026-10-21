import { describe, expect, it } from 'vitest';

import { averagePercentage, scoreColor } from '../../src/lib/components/mobility/score-presentation';

describe('score presentation colors', () => {
  it('treats a perfect benefit score as green', () => {
    expect(scoreColor(100)).toBe('#1a9850');
  });

  it('treats high pressure scores as red when requested', () => {
    expect(scoreColor(100, { higherIsWorse: true })).toBe('#d73027');
  });

  it('averages available pressure percentages and caps the display range', () => {
    expect(averagePercentage([20, 80, null])).toBe(50);
    expect(averagePercentage([120, 80])).toBe(100);
    expect(averagePercentage([null, undefined])).toBeNull();
  });
});
