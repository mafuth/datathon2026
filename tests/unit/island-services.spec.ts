import { describe, expect, it } from 'vitest';

import { ISLAND_DEMAND_CATEGORIES } from '../../src/lib/components/mobility/island-services';
import {
  healthDemand,
  healthPopulationProfile,
  healthServiceTargetSubtypes
} from '../../src/lib/server/scoring/health-demand';
import {
  combinedDemandStatus,
  normalizeDemandWeights,
  normalizeProportionalDemandWeights
} from '../../src/lib/server/scoring/island-services';
import { buildServiceDemandHexes } from '../../src/lib/server/scoring/service-hex-grid';

describe('island service demand map data', () => {
  it('supports all demand categories without mixing their raw units', () => {
    expect(ISLAND_DEMAND_CATEGORIES).toEqual(['all', 'health', 'education', 'transport']);
  });

  it('splits heat demand equally across available services', () => {
    expect(normalizeDemandWeights([null, 0, 25, 50])).toEqual([0, 0, 0.5, 0.5]);
    expect(normalizeDemandWeights([25, 50, 100])).toEqual([0.33, 0.33, 0.33]);
    expect(normalizeProportionalDemandWeights([1, 2, 0])).toEqual([0.33, 0.67, 0]);
  });

  it('deduplicates children and adolescents for health demand policy', () => {
    const records = [
      { ageCategory: 'total', amount: 100 },
      { ageCategory: 'child_population_0_14', amount: 20 },
      { ageCategory: 'adolescent_population_10_19', amount: 30 },
      { ageCategory: 'elderly_population_65_plus', amount: 10 }
    ];

    expect(healthPopulationProfile(records)).toMatchObject({
      total: 100,
      children: 20,
      adolescents: 30,
      younger: 30,
      elderly: 10,
      hospitalEmergency: 30
    });
    expect(healthDemand(records)).toEqual({
      primary: 90,
      maternal_child: 30,
      hospital_emergency: 30,
      chronic_elderly: 10
    });
    expect(healthServiceTargetSubtypes('maternal_child', ['hospital', 'health_center', 'clinic'])).toEqual(['clinic']);
    expect(healthServiceTargetSubtypes('maternal_child', ['hospital', 'health_center'])).toEqual(['health_center']);
    expect(healthServiceTargetSubtypes('chronic_elderly', ['health_center', 'clinic'])).toEqual([]);
  });

  it('keeps elderly population out of the baseline while preserving hospital demand', () => {
    const records = [
      { ageCategory: 'total', amount: 50 },
      { ageCategory: 'elderly_population_65_plus', amount: 50 }
    ];

    expect(healthDemand(records)).toEqual({
      primary: 0,
      maternal_child: 0,
      hospital_emergency: 50,
      chronic_elderly: 50
    });
    expect(healthServiceTargetSubtypes('chronic_elderly', ['hospital'])).toEqual(['hospital']);
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

  it('combines facility pressure with residential access gaps', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [72.998, 2.998],
          [73.006, 2.998],
          [73.006, 3.006],
          [72.998, 3.006],
          [72.998, 2.998]
        ]
      ]
    };
    const services = [
      {
        coordinates: [73, 3] as [number, number],
        weights: { health: 1, education: 0, transport: 0 },
        coverageWeights: { health: 1, education: 0, transport: 0 },
        statuses: { health: 'numeric' as const, education: 'unavailable' as const, transport: 'unavailable' as const }
      }
    ];
    const residentialPoints = [
      { id: 'building:near', islandId: 'island:test', coordinates: [73, 3] as [number, number], weight: 1 },
      { id: 'building:far', islandId: 'island:test', coordinates: [73.004, 3.004] as [number, number], weight: 4 }
    ];

    const hexes = buildServiceDemandHexes(geometry, [73, 3], services, residentialPoints);

    expect(hexes.features.length).toBeGreaterThan(1);
    expect(hexes.features.some((feature) => feature.properties.healthStatus === 'numeric')).toBe(true);
    expect(hexes.features.some((feature) => feature.properties.healthWeight > 0)).toBe(true);
    expect(buildServiceDemandHexes(geometry, [73, 3], services, residentialPoints)).toEqual(hexes);
  });

  it('reduces facility heat intensity when demand is split across services', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [72.998, 2.998],
          [73.006, 2.998],
          [73.006, 3.006],
          [72.998, 3.006],
          [72.998, 2.998]
        ]
      ]
    };
    const statuses = {
      health: 'numeric' as const,
      education: 'unavailable' as const,
      transport: 'unavailable' as const
    };
    const singleService = buildServiceDemandHexes(
      geometry,
      [73, 3],
      [
        {
          coordinates: [73, 3],
          weights: { health: 1, education: 0, transport: 0 },
          statuses
        }
      ]
    );
    const splitServices = buildServiceDemandHexes(
      geometry,
      [73, 3],
      [
        {
          coordinates: [73, 3],
          weights: { health: 0.5, education: 0, transport: 0 },
          statuses
        },
        {
          coordinates: [73.004, 3.004],
          weights: { health: 0.5, education: 0, transport: 0 },
          statuses
        }
      ]
    );

    expect(Math.max(...splitServices.features.map((feature) => feature.properties.healthWeight))).toBeLessThan(
      Math.max(...singleService.features.map((feature) => feature.properties.healthWeight))
    );
  });
});
