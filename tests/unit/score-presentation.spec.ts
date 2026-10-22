import { describe, expect, it } from 'vitest';

import { averagePercentage, scoreColor, scorePresentation } from '../../src/lib/components/mobility/score-presentation';
import { themeColor } from '../../src/lib/config/theme/theme-tokens';

describe('score presentation colors', () => {
  it('treats a perfect benefit score as green', () => {
    expect(scoreColor(100)).toBe(themeColor('--mobility-map-score-4'));
  });

  it('treats high pressure scores as red when requested', () => {
    expect(scoreColor(100, { higherIsWorse: true })).toBe(themeColor('--mobility-map-score-0'));
  });

  it("uses a worried mood for Baarah's 47.04 score", () => {
    expect(scorePresentation(47.04, 'Unavailable')).toMatchObject({
      percent: '47%',
      emojiLabel: 'Worried face'
    });
  });

  it.each([
    [29.99, 'Loudly crying face'],
    [30, 'Worried face'],
    [49.99, 'Worried face'],
    [50, 'Neutral face'],
    [64.99, 'Neutral face'],
    [65, 'Slightly smiling face'],
    [79.99, 'Slightly smiling face'],
    [80, 'Smiling face'],
    [89.99, 'Smiling face'],
    [90, 'Beaming face with smiling eyes']
  ])('keeps the mood threshold at %s', (value, emojiLabel) => {
    expect(scorePresentation(value as number, 'Unavailable').emojiLabel).toBe(emojiLabel);
  });

  it('averages available pressure percentages and caps the display range', () => {
    expect(averagePercentage([20, 80, null])).toBe(50);
    expect(averagePercentage([120, 80])).toBe(100);
    expect(averagePercentage([null, undefined])).toBeNull();
  });
});
