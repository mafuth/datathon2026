import { describe, expect, it } from 'vitest';

import { ISLAND_DEMAND_CATEGORIES } from '../../src/lib/components/mobility/island-services';
import { combinedDemandStatus, normalizeDemandWeights } from '../../src/lib/server/scoring/island-services';
import { buildServiceDemandHexes } from '../../src/lib/server/scoring/service-hex-grid';

describe('island service demand map data', () => {
  it('supports all demand categories without mixing their raw units', () => {
    expect(ISLAND_DEMAND_CATEGORIES).toEqual(['all', 'health', 'education', 'transport']);
  });

  it('normalizes demand weights while preserving zero and unavailable values as no heat', () => {
    expect(normalizeDemandWeights([null, 0, 25, 50])).toEqual([0, 0, 0.5, 1]);
  });

  it('keeps unavailable demand distinct from partial demand', () => {
    expect(combinedDemandStatus([{ status: 'unavailable' }, { status: 'unavailable' }])).toBe('unavailable');
    expect(combinedDemandStatus([{ status: 'unavailable' }, { status: 'partial' }])).toBe('partial');
    expect(combinedDemandStatus([{ status: 'numeric' }, { status: 'partial' }])).toBe('numeric');
  });

  it('builds deterministic polygon tiles with gradual demand falloff', () => {
    const hexes = buildServiceDemandHexes(
      {
        type: 'Polygon',
        coordinates: [
          [
            [72.998, 2.998],
            [73.002, 2.998],
            [73.002, 3.002],
            [72.998, 3.002],
            [72.998, 2.998]
          ]
        ]
      },
      [73, 3],
      [
        {
          coordinates: [73, 3],
          weights: { health: 1, education: 0, transport: 0 },
          statuses: { health: 'numeric', education: 'unavailable', transport: 'unavailable' }
        }
      ]
    );

    expect(hexes.features.length).toBeGreaterThan(1);
    expect(hexes.features.every((feature) => feature.geometry.type === 'Polygon')).toBe(true);
    expect(hexes.features.every((feature) => feature.geometry.coordinates[0]?.length === 7)).toBe(true);

    const healthWeights = hexes.features.map((feature) => feature.properties.healthWeight);
    expect(Math.max(...healthWeights)).toBe(1);
    expect(Math.min(...healthWeights)).toBeLessThan(1);
    expect(
      buildServiceDemandHexes(
        {
          type: 'Polygon',
          coordinates: [
            [
              [72.998, 2.998],
              [73.002, 2.998],
              [73.002, 3.002],
              [72.998, 3.002],
              [72.998, 2.998]
            ]
          ]
        },
        [73, 3],
        [
          {
            coordinates: [73, 3],
            weights: { health: 1, education: 0, transport: 0 },
            statuses: { health: 'numeric', education: 'unavailable', transport: 'unavailable' }
          }
        ]
      )
    ).toEqual(hexes);
  });
});
