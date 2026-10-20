import { describe, expect, it } from 'vitest';

import { isUnavailableScore, scorePercentage } from '../../src/lib/components/mobility/score-presentation';
import { preserveExistingServiceIslandMappings } from '../../src/lib/server/mobility/preserve-service-island-mappings';
import {
  applyConfirmedServiceMappings,
  confirmedServiceMappings
} from '../../src/lib/server/mobility/reviewed-service-overlay';
import { classifyZeroScore } from '../../src/lib/server/scoring/analytics-coverage';
import { buildAnalyticsRankings } from '../../src/lib/server/scoring/analytics-rankings';

describe('reviewed mobility mappings', () => {
  it('promotes only confirmed rows and leaves non-confirmed rows out', () => {
    const mappings = confirmedServiceMappings([
      { service_id: 'confirmed', island_id: 'island:1', disposition: 'confirmed' },
      { service_id: 'provisional', island_id: 'island:2', disposition: 'provisional' },
      { service_id: 'no-coordinates', island_id: 'island:4', disposition: 'no_coordinates' }
    ]);
    const records = applyConfirmedServiceMappings(
      [
        { id: 'confirmed', island_id: null },
        { id: 'provisional', island_id: null },
        { id: 'no-coordinates', island_id: null },
        { id: 'existing', island_id: 'island:3' }
      ],
      mappings
    );
    expect(records).toEqual([
      { id: 'confirmed', island_id: 'island:1' },
      { id: 'provisional', island_id: null },
      { id: 'no-coordinates', island_id: null },
      { id: 'existing', island_id: 'island:3' }
    ]);
  });

  it('preserves existing non-null mappings, including conflicts with incoming data', () => {
    expect(
      preserveExistingServiceIslandMappings(
        [
          { id: 'facility:health:753', islandId: null },
          { id: 'conflict', islandId: 'island:new' },
          { id: 'unmapped', islandId: null }
        ],
        new Map([
          ['facility:health:753', 'island:625'],
          ['conflict', 'island:existing']
        ])
      )
    ).toEqual([
      { id: 'facility:health:753', islandId: 'island:625' },
      { id: 'conflict', islandId: 'island:existing' },
      { id: 'unmapped', islandId: null }
    ]);
  });
});

describe('analytics data gaps', () => {
  it('keeps zero as a numeric score', () => {
    expect(isUnavailableScore(0)).toBe(false);
    expect(scorePercentage(0)).toBe('0%');
  });

  it('classifies unmapped and connection gaps without fabricating scores', () => {
    expect(
      classifyZeroScore('health', {
        databaseServiceCount: 0,
        canonicalMappedServiceCount: 0,
        canonicalUnmappedServiceCount: 1,
        transportConnectionCount: 0
      })
    ).toBe('missing_island_mapping');
    expect(
      classifyZeroScore('transport', {
        databaseServiceCount: 1,
        canonicalMappedServiceCount: 0,
        canonicalUnmappedServiceCount: 0,
        transportConnectionCount: 0
      })
    ).toBe('score_semantics');
    expect(
      classifyZeroScore('transport', {
        databaseServiceCount: 0,
        canonicalMappedServiceCount: 0,
        canonicalUnmappedServiceCount: 0,
        transportConnectionCount: 0
      })
    ).toBe('missing_connection');
  });
});

describe('database-backed analytics rankings', () => {
  it('orders rankings on the server from calculated score fields', () => {
    expect(
      buildAnalyticsRankings([
        { id: 'a', overall: 20, health: 40, education: 30, transport: 10, demand: 5, pressure: 0.1 },
        { id: 'b', overall: 60, health: 10, education: 50, transport: 40, demand: 20, pressure: 0.2 },
        { id: 'c', overall: null, health: null, education: null, transport: null, demand: 0, pressure: 0 }
      ])
    ).toMatchObject({
      demand: ['b', 'a'],
      underserved: ['a', 'b', 'c'],
      overall: ['a', 'b'],
      health: ['b', 'a'],
      education: ['a', 'b'],
      transport: ['a', 'b']
    });
  });
});
