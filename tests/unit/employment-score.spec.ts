import type { JobLocation } from '../../src/lib/db/models';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { calculateEmploymentScore } from '../../src/lib/server/scoring/employment-score';

function location(id: string, islandId: string, type: JobLocation['type'], subtype = type): JobLocation {
  return {
    id,
    islandId,
    name: null,
    type,
    subtype,
    latitude: 4,
    longitude: 73
  };
}

function snapshot(overrides: Partial<ScoringSnapshot> = {}): ScoringSnapshot {
  return {
    islands: [
      { id: 'island:one', name: 'One', islandType: 'inhabited' } as ScoringSnapshot['islands'][number],
      { id: 'island:two', name: 'Two', islandType: 'inhabited' } as ScoringSnapshot['islands'][number]
    ],
    population: [
      { islandId: 'island:one', ageCategory: 'working_age_population_15_64', amount: 100 },
      { islandId: 'island:two', ageCategory: 'working_age_population_15_64', amount: 100 },
      { islandId: 'island:two', ageCategory: 'foregner', amount: 100 }
    ],
    services: [],
    jobLocations: [
      location('job:one', 'island:one', 'commercial'),
      location('job:two', 'island:two', 'public_service')
    ],
    connections: [],
    routes: [],
    transportStops: [],
    routeStops: [],
    ...overrides
  };
}

describe('employment scoring', () => {
  it('treats a missing foreign-population row as zero and keeps workplace supply independent from transport', () => {
    const result = calculateEmploymentScore('island:one', snapshot());

    expect(result.foreignPopulation).toBe(0);
    expect(result.foreignPopulationSource).toBe('assumed_zero');
    expect(result.workingAgePopulation).toBe(100);
    expect(result.jobLocationCount).toBe(1);
    expect(result.foreignPerWorkingAge).toBe(0);
    expect(result.jobLocationsPerThousandWorkingAge).toBe(10);
    expect(result.score).toBeGreaterThan(50);
  });

  it('uses the foreign-to-working-age ratio as the job-demand pressure', () => {
    const result = calculateEmploymentScore(
      'island:one',
      snapshot({
        population: [
          { islandId: 'island:one', ageCategory: 'working_age_population_15_64', amount: 100 },
          { islandId: 'island:one', ageCategory: 'foregner', amount: 100 },
          { islandId: 'island:two', ageCategory: 'working_age_population_15_64', amount: 100 },
          { islandId: 'island:two', ageCategory: 'foregner', amount: 0 }
        ]
      })
    );

    expect(result.foreignPerWorkingAge).toBe(1);
    expect(result.pressureScore).toBe(0);
    expect(result.score).toBe(25);
  });

  it('returns category and subtype counts for the island workplace breakdown', () => {
    const result = calculateEmploymentScore(
      'island:one',
      snapshot({
        jobLocations: [
          location('job:one', 'island:one', 'commercial', 'shop'),
          location('job:two', 'island:one', 'commercial', 'shop'),
          location('job:three', 'island:one', 'tourism', 'hotel')
        ]
      })
    );

    expect(result.categories).toEqual([
      {
        key: 'commercial',
        label: 'commercial',
        count: 2,
        subcategories: [{ key: 'shop', label: 'shop', count: 2 }]
      },
      {
        key: 'tourism',
        label: 'tourism',
        count: 1,
        subcategories: [{ key: 'hotel', label: 'hotel', count: 1 }]
      }
    ]);
  });

  it('marks employment unavailable without a positive working-age denominator', () => {
    const result = calculateEmploymentScore(
      'island:one',
      snapshot({
        population: [{ islandId: 'island:one', ageCategory: 'foregner', amount: 10 }]
      })
    );

    expect(result.score).toBeNull();
    expect(result.status).toBe('unavailable');
    expect(result.limitations.join(' ')).toContain('Working-age population');
  });
});
