import type { Service } from '../../src/lib/db/models';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { isUnavailableScore, scorePercentage } from '../../src/lib/components/mobility/score-presentation';
import {
  assertServiceIslandMappings,
  auditServiceIslandMappings,
  preserveExistingServiceIslandMappings
} from '../../src/lib/server/mobility/preserve-service-island-mappings';
import {
  applyConfirmedServiceMappings,
  confirmedServiceMappings
} from '../../src/lib/server/mobility/reviewed-service-overlay';
import { flattenRtlRouteDetails } from '../../src/lib/server/mobility/rtl-bus-routes';
import { classifyZeroScore } from '../../src/lib/server/scoring/analytics-coverage';
import { buildAnalyticsRankings } from '../../src/lib/server/scoring/analytics-rankings';
import {
  bestEducationService,
  bestHealthService,
  buildDemandAllocation
} from '../../src/lib/server/scoring/demand-allocation';
import { calculateCrowdedness, calculateIslandScore } from '../../src/lib/server/scoring/factors';

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

  it('audits confirmed, preserved, and excluded mappings', () => {
    expect(
      auditServiceIslandMappings(
        [
          { id: 'confirmed', islandId: 'island:1' },
          { id: 'provisional', islandId: null },
          { id: 'conflict', islandId: 'island:existing' }
        ],
        new Map([
          ['confirmed', 'island:1'],
          ['missing', 'island:2']
        ]),
        new Map([
          ['conflict', 'island:existing'],
          ['not-in-seed', 'island:3']
        ]),
        ['provisional']
      )
    ).toEqual({
      confirmedUniqueMappings: 2,
      confirmedMappingsAppliedToSeedServiceRows: 1,
      existingNonNullMappingsPreserved: 2,
      nonConfirmedRowsExcluded: 1
    });
  });

  it('throws when a readback mapping differs from its expected value', () => {
    expect(() =>
      assertServiceIslandMappings(
        new Map([['service', 'island:wrong']]),
        new Map([['service', 'island:right']]),
        'Seed'
      )
    ).toThrow('Seed mapping changed for service');
  });
});

describe('RTL bus route normalization', () => {
  it('flattens atoll route groups into seedable routes', () => {
    const routes = flattenRtlRouteDetails([
      {
        name: 'Laamu',
        atollRouteResponse: [{ id: 5, code: '105', name: 'Fonadhoo To Gan', busRouteStopList: [{ id: 3413 }] }]
      }
    ]);

    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBe('Fonadhoo To Gan');
    expect(routes[0]?.busRouteStopList?.[0]?.id).toBe(3413);
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
        {
          id: 'a',
          overall: 20,
          health: 40,
          education: 30,
          transport: 10,
          employment: 80,
          jobDensity: 10,
          jobDemand: 0.1,
          jobSupply: 10,
          demand: 5,
          outboundDemand: 25,
          pressure: 0.1,
          pollutionPressure: 1.4
        },
        {
          id: 'b',
          overall: 60,
          health: 10,
          education: 50,
          transport: 40,
          employment: 10,
          jobDensity: 20,
          jobDemand: 0.8,
          jobSupply: 5,
          demand: 20,
          outboundDemand: 10,
          pressure: 0.2,
          pollutionPressure: 2.1
        },
        {
          id: 'c',
          overall: null,
          health: null,
          education: null,
          transport: null,
          employment: null,
          jobDensity: null,
          jobDemand: null,
          jobSupply: null,
          demand: 0,
          outboundDemand: 0,
          pressure: 0,
          pollutionPressure: null
        }
      ])
    ).toMatchObject({
      demand: ['b', 'a'],
      outbound: ['a', 'b'],
      underserved: ['a', 'b', 'c'],
      overall: ['a', 'b'],
      health: ['b', 'a'],
      education: ['a', 'b'],
      transport: ['a', 'b'],
      employment: ['b', 'a'],
      jobRichLowPopulation: ['b', 'a'],
      jobDemandGaps: ['b', 'a'],
      highestPollution: ['b', 'a']
    });
  });
});

describe('crowdedness calculation', () => {
  it('keeps dense islands distinct using their table population and land area', () => {
    const cases = [
      {
        id: 'island:1443',
        name: 'Malé',
        population: 137238,
        landAreaKm2: 2.08033728722,
        density: 65969.11,
        pressure: 0.93,
        score: 92.95
      },
      {
        id: 'island:1442',
        name: 'Hulhumalé',
        population: 65714,
        landAreaKm2: 4.1867060488,
        density: 15695.87,
        pressure: 0.76,
        score: 75.84
      },
      {
        id: 'island:1382',
        name: "Vilin'gili",
        population: 6755,
        landAreaKm2: 0.329136945115,
        density: 20523.37,
        pressure: 0.8,
        score: 80.41
      }
    ] as const;

    const results = cases.map((entry) =>
      calculateCrowdedness(
        {
          id: entry.id,
          name: entry.name,
          islandType: 'inhabited',
          latitude: 0,
          longitude: 0,
          landAreaKm2: entry.landAreaKm2,
          geoJson: '{}',
          atollId: 'test'
        },
        entry.population
      )
    );

    expect(results.map((result) => result.populationDensity)).toEqual(cases.map((entry) => entry.density));
    expect(results.map((result) => result.pressure)).toEqual(cases.map((entry) => entry.pressure));
    expect(results.map((result) => result.score)).toEqual(cases.map((entry) => entry.score));
    expect(new Set(results.map((result) => result.score)).size).toBe(cases.length);
  });
});

describe('age-based service demand allocation', () => {
  it('prioritizes clinics for younger care and requires hospitals for specialist care', () => {
    const services = ['clinic', 'health_center', 'hospital'].map(
      (subtype) =>
        ({
          id: subtype,
          islandId: 'island',
          serviceType: 'health',
          subtype,
          name: subtype,
          latitude: null,
          longitude: null
        }) as Service
    );

    expect(bestHealthService(services, 'maternal_child')?.subtype).toBe('clinic');
    expect(bestHealthService(services, 'primary')?.subtype).toBe('hospital');
    expect(bestHealthService(services, 'chronic_elderly')?.subtype).toBe('hospital');
    expect(
      bestHealthService(
        services.filter((service) => service.subtype !== 'hospital'),
        'chronic_elderly'
      )
    ).toBeNull();
  });

  it('maps every education level to its required service subtype', () => {
    const services = ['preschool', 'school', 'high_school', 'tertiary'].map(
      (subtype) =>
        ({
          id: subtype,
          islandId: 'island',
          serviceType: 'education',
          subtype,
          name: subtype,
          latitude: null,
          longitude: null
        }) as Service
    );

    expect(bestEducationService(services, 'preschool')?.subtype).toBe('preschool');
    expect(bestEducationService(services, 'primary')?.subtype).toBe('school');
    expect(bestEducationService(services, 'secondary')?.subtype).toBe('high_school');
    expect(bestEducationService(services, 'higher_secondary')?.subtype).toBe('high_school');
    expect(bestEducationService(services, 'tertiary')?.subtype).toBe('tertiary');
  });

  it('deduplicates age cohorts while preserving detailed service demand', () => {
    const snapshot = {
      islands: [
        {
          id: 'origin',
          name: 'Origin',
          islandType: 'inhabited',
          latitude: 0,
          longitude: 0,
          landAreaKm2: 1,
          geoJson: '{}',
          atollId: 'atoll'
        },
        {
          id: 'destination',
          name: 'Destination',
          islandType: 'inhabited',
          latitude: 0,
          longitude: 1,
          landAreaKm2: 1,
          geoJson: '{}',
          atollId: 'atoll'
        },
        {
          id: 'origin-two',
          name: 'Origin Two',
          islandType: 'inhabited',
          latitude: 0,
          longitude: 2,
          landAreaKm2: 1,
          geoJson: '{}',
          atollId: 'atoll'
        }
      ],
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 100 },
        { islandId: 'origin', ageCategory: 'child_population_0_14', amount: 20 },
        { islandId: 'origin', ageCategory: 'adolescent_population_10_19', amount: 30 },
        { islandId: 'origin', ageCategory: 'youth_population_18_35', amount: 40 },
        { islandId: 'origin', ageCategory: 'elderly_population_65_plus', amount: 10 },
        { islandId: 'destination', ageCategory: 'total', amount: 50 },
        { islandId: 'destination', ageCategory: 'child_population_0_14', amount: 10 },
        { islandId: 'destination', ageCategory: 'elderly_population_65_plus', amount: 5 },
        { islandId: 'origin-two', ageCategory: 'total', amount: 200 },
        { islandId: 'origin-two', ageCategory: 'child_population_0_14', amount: 80 },
        { islandId: 'origin-two', ageCategory: 'elderly_population_65_plus', amount: 40 }
      ],
      vehicleCounts: [],
      services: [
        {
          id: 'destination-hospital',
          islandId: 'destination',
          serviceType: 'health',
          subtype: 'hospital',
          name: 'Destination hospital',
          latitude: 0,
          longitude: 1
        },
        {
          id: 'origin-port',
          islandId: 'origin',
          serviceType: 'transport',
          subtype: 'port',
          name: 'Origin port',
          latitude: 0,
          longitude: 0
        },
        {
          id: 'destination-stop-a',
          islandId: 'destination',
          serviceType: 'transport',
          subtype: 'bus_stop',
          name: 'Destination stop A',
          latitude: 0,
          longitude: 1
        },
        {
          id: 'destination-stop-b',
          islandId: 'destination',
          serviceType: 'transport',
          subtype: 'bus_stop',
          name: 'Destination stop B',
          latitude: 0,
          longitude: 1
        },
        {
          id: 'destination-port',
          islandId: 'destination',
          serviceType: 'transport',
          subtype: 'port',
          name: 'Destination port',
          latitude: 0,
          longitude: 1
        }
      ],
      connections: [
        {
          id: 'origin-destination',
          routeId: null,
          fromIslandId: 'origin',
          toIslandId: 'destination',
          connectionType: 'ferry',
          directionality: 'bidirectional',
          sequence: null,
          distanceM: 1000,
          geoJson: null,
          source: 'test',
          sourceObjectId: 'test',
          modeled: false,
          scoreEligible: true
        },
        {
          id: 'origin-two-destination',
          routeId: null,
          fromIslandId: 'origin-two',
          toIslandId: 'destination',
          connectionType: 'ferry',
          directionality: 'bidirectional',
          sequence: null,
          distanceM: 1000,
          geoJson: null,
          source: 'test',
          sourceObjectId: 'test',
          modeled: false,
          scoreEligible: true
        }
      ],
      routes: [],
      transportStops: [
        {
          id: 'origin-port',
          name: 'Origin port',
          islandId: 'origin',
          subtype: 'port',
          latitude: 0,
          longitude: 0,
          routeIds: ['ferry:origin-destination']
        },
        {
          id: 'destination-stop-a',
          name: 'Destination stop A',
          islandId: 'destination',
          subtype: 'bus_stop',
          latitude: 0,
          longitude: 1,
          routeIds: ['bus:one']
        },
        {
          id: 'destination-stop-b',
          name: 'Destination stop B',
          islandId: 'destination',
          subtype: 'bus_stop',
          latitude: 0,
          longitude: 1,
          routeIds: ['bus:two']
        },
        {
          id: 'destination-port',
          name: 'Destination port',
          islandId: 'destination',
          subtype: 'port',
          latitude: 0,
          longitude: 1,
          routeIds: ['ferry:origin-destination']
        },
        {
          id: 'origin-two-stop',
          name: 'Origin Two stop',
          islandId: 'origin-two',
          subtype: 'bus_stop',
          latitude: 0,
          longitude: 2,
          routeIds: ['bus:two']
        },
        {
          id: 'origin-bus-stop',
          name: 'Origin bus stop',
          islandId: 'origin',
          subtype: 'bus_stop',
          latitude: 0,
          longitude: 0,
          routeIds: ['bus:one', 'bus:two']
        }
      ],
      routeStops: [
        { routeId: 'ferry:origin-destination', stopId: 'origin-port', islandId: 'origin', sequence: 0 },
        { routeId: 'ferry:origin-destination', stopId: 'destination-port', islandId: 'destination', sequence: 1 },
        { routeId: 'bus:one', stopId: 'destination-stop-a', islandId: 'destination', sequence: 0 },
        { routeId: 'bus:one', stopId: 'origin-bus-stop', islandId: 'origin', sequence: 1 },
        { routeId: 'bus:two', stopId: 'destination-stop-b', islandId: 'destination', sequence: 0 },
        { routeId: 'bus:two', stopId: 'origin-bus-stop', islandId: 'origin', sequence: 1 },
        { routeId: 'bus:two', stopId: 'origin-two-stop', islandId: 'origin-two', sequence: 2 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(snapshot);
    const origin = allocations.byIsland.get('origin');
    const destination = allocations.byIsland.get('destination');
    const score = calculateIslandScore('origin', snapshot, allocations);
    const hospitalRow = score.health.breakdown.find((row) => row.key === 'hospital_emergency');
    const transportStops = score.transport.demand.stops;

    expect(origin?.healthByNeed.hospital_emergency.local).toBe(30);
    expect(origin?.healthByNeed.hospital_emergency.outbound).toBe(30);
    expect(origin?.healthByNeed.primary.outbound).toBe(90);
    expect(origin?.healthByNeed.chronic_elderly.outbound).toBe(10);
    expect(origin?.health.local).toBe(0);
    expect(origin?.health.outbound).toBe(100);
    expect(origin?.education.local).toBe(90);
    expect(destination?.healthByNeed.hospital_emergency.inbound).toBe(150);
    expect(destination?.health.inbound).toBe(300);
    expect(destination?.inboundSources.map((source) => [source.originIslandId, source.total])).toEqual([
      ['origin-two', 200],
      ['origin', 100]
    ]);
    expect(destination?.healthByNeed.hospital_emergency.demandPercent).toBeLessThanOrEqual(1);
    expect(hospitalRow?.demandSource).toBe('outbound');
    expect(hospitalRow?.score).toBeLessThan(100);
    expect(score.transport.demand.careTransferDemand).toBeGreaterThan(0);
    expect(score.transport.demand.averageLoad).not.toBeNull();
    expect(score.transport.demand.modes.marine.careTransferDemand).toBeGreaterThan(0);
    const roundedStopDemand = transportStops.reduce(
      (sum, stop) => sum + stop.workingDemand + stop.studentDemand + stop.elderlyDemand,
      0
    );
    const cohortDemand =
      score.transport.demand.workingDemand +
      score.transport.demand.studentDemand +
      score.transport.demand.elderlyDemand;
    // Each of three cohorts is rounded independently to two decimals per stop.
    expect(Math.abs(roundedStopDemand - cohortDemand)).toBeLessThanOrEqual(transportStops.length * 3 * 0.005);
    expect(transportStops.find((stop) => stop.stopId === 'destination-stop-b')?.totalDemand).toBeGreaterThan(
      transportStops.find((stop) => stop.stopId === 'destination-stop-a')?.totalDemand ?? 0
    );

    const childOnlyHealthSnapshot: ScoringSnapshot = {
      ...snapshot,
      services: [
        ...snapshot.services,
        {
          id: 'origin-health-center',
          islandId: 'origin',
          serviceType: 'health',
          subtype: 'health_center',
          name: 'Origin health centre',
          latitude: 0,
          longitude: 0
        }
      ]
    };
    const childOnlyAllocations = buildDemandAllocation(childOnlyHealthSnapshot);
    const primaryCare = childOnlyAllocations.byOriginNeed.get('origin:health:primary');
    const childCare = childOnlyAllocations.byOriginCohort.get('origin:health:maternal_child');
    const elderlyCare = childOnlyAllocations.byOriginCohort.get('origin:health:chronic_elderly');
    const childOnlyScore = calculateIslandScore('origin', childOnlyHealthSnapshot, childOnlyAllocations);
    const elderlyBreakdown = childOnlyScore.health.breakdown.find((row) => row.key === 'chronic_elderly');

    expect(primaryCare).toMatchObject({
      demand: 90,
      destinationIslandId: 'origin',
      routeType: 'local',
      serviceSubtype: 'health_center'
    });
    expect(childCare).toMatchObject({
      demand: 30,
      destinationIslandId: 'origin',
      routeType: 'local',
      serviceSubtype: 'health_center'
    });
    expect(elderlyCare).toMatchObject({
      demand: 10,
      destinationIslandId: 'destination',
      routeType: 'marine',
      serviceSubtype: 'hospital'
    });
    expect(elderlyBreakdown).toMatchObject({
      demandSource: 'outbound',
      destinationIslandId: 'destination',
      routeType: 'marine'
    });

    const noRouteHealthSnapshot: ScoringSnapshot = { ...childOnlyHealthSnapshot, connections: [] };
    const noRouteAllocations = buildDemandAllocation(noRouteHealthSnapshot);
    const noRouteOrigin = noRouteAllocations.byIsland.get('origin');
    const noRouteDestination = noRouteAllocations.byIsland.get('destination');
    const noRouteElderlyCare = noRouteAllocations.byOriginCohort.get('origin:health:chronic_elderly');

    expect(noRouteElderlyCare).toMatchObject({
      demand: 10,
      destinationIslandId: null,
      routeType: 'unavailable'
    });
    expect(noRouteOrigin?.healthByNeed.chronic_elderly.outbound).toBe(10);
    expect(noRouteOrigin?.healthByNeed.chronic_elderly.unserved).toBe(10);
    // Both origins contribute potential same-atoll hospital pressure (10 + 40),
    // while their actual routes remain unavailable and demand remains unserved.
    expect(noRouteAllocations.hospitalOverlays).toEqual([
      expect.objectContaining({
        originIslandId: 'origin',
        destinationIslandId: 'destination',
        demand: 10,
        knownConnectivity: false
      }),
      expect.objectContaining({
        originIslandId: 'origin-two',
        destinationIslandId: 'destination',
        demand: 40,
        knownConnectivity: false
      })
    ]);
    expect(noRouteAllocations.byIsland.get('origin-two')?.healthByNeed.chronic_elderly.unserved).toBe(40);
    expect(noRouteDestination?.healthByNeed.chronic_elderly.inbound).toBe(50);
    expect(noRouteDestination?.health.inbound).toBe(50);
  });
});
