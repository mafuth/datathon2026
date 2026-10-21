import type { DemandAllocationResult, ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { buildDemandAllocation } from '../../src/lib/server/scoring/demand-allocation';
import { calculateIslandScore } from '../../src/lib/server/scoring/factors';
import { resolveElderlyHospitalRouting } from '../../src/lib/server/scoring/hospital-routing';
import { calculateTransportDemand } from '../../src/lib/server/scoring/transport-demand';

function island(id: string, name: string, atollId: string, longitude: number, latitude: number) {
  return {
    id,
    name,
    islandType: 'inhabited',
    latitude,
    longitude,
    landAreaKm2: 1,
    geoJson: '{}',
    atollId
  };
}

function hospital(id: string, islandId: string, longitude: number, latitude: number) {
  return {
    id,
    islandId,
    serviceType: 'health',
    subtype: 'hospital',
    name: id,
    latitude,
    longitude
  };
}

function education(id: string, islandId: string, subtype: string, longitude: number, latitude: number) {
  return {
    id,
    islandId,
    serviceType: 'education',
    subtype,
    name: id,
    latitude,
    longitude
  };
}

function ferry(id: string, fromIslandId: string, toIslandId: string, distanceM: number | null) {
  return {
    id,
    routeId: null,
    fromIslandId,
    toIslandId,
    connectionType: 'ferry',
    directionality: 'bidirectional',
    sequence: null,
    distanceM,
    geoJson: null,
    source: 'test',
    sourceObjectId: id,
    modeled: false,
    scoreEligible: true
  };
}

function bridge(id: string, fromIslandId: string, toIslandId: string, distanceM: number | null) {
  return { ...ferry(id, fromIslandId, toIslandId, distanceM), connectionType: 'bridge' };
}

function snapshot(
  islands: ReturnType<typeof island>[],
  services: ReturnType<typeof hospital>[],
  connections: ReturnType<typeof ferry>[] = []
): ScoringSnapshot {
  return {
    islands,
    population: [],
    vehicleCounts: [],
    services,
    connections,
    routes: [],
    transportStops: [],
    routeStops: []
  } as ScoringSnapshot;
}

describe('elderly hospital routing', () => {
  it('prefers same-atoll known connectivity before a shorter cross-atoll path', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('relay', 'Relay', 'atoll-a', 0.2, 0),
      island('same-atoll-hospital', 'Same Atoll', 'atoll-a', 0.4, 0),
      island('cross-atoll-hospital', 'Cross Atoll', 'atoll-b', 0.1, 0)
    ];
    const services = [
      hospital('same-hospital', 'same-atoll-hospital', 0.4, 0),
      hospital('cross-hospital', 'cross-atoll-hospital', 0.1, 0)
    ];
    const connections = [
      ferry('short-cross', 'origin', 'cross-atoll-hospital', 10),
      ferry('origin-relay', 'origin', 'relay', 20),
      bridge('relay-same', 'relay', 'same-atoll-hospital', 20)
    ];

    const result = resolveElderlyHospitalRouting(snapshot(islands, services, connections), 'origin');

    expect(result.canonical).toMatchObject({
      destinationIslandId: 'same-atoll-hospital',
      destinationServiceId: 'same-hospital',
      kind: 'connected',
      knownConnectivity: true,
      distanceM: 40,
      hopCount: 2,
      routeType: 'marine',
      routeFactor: 0.63
    });
  });

  it('adds same-atoll and central overlays when no connectivity exists', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('same-atoll-hospital', 'Same Atoll', 'atoll-a', 0.1, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhumale', 'Hulhumalé', 'atoll-capital', 11, 0)
    ];
    const services = [
      hospital('same-hospital', 'same-atoll-hospital', 0.1, 0),
      hospital('male-hospital', 'male', 10, 0),
      hospital('hulhumale-hospital', 'hulhumale', 11, 0)
    ];

    const result = resolveElderlyHospitalRouting(snapshot(islands, services), 'origin');

    expect(result.canonical).toBeNull();
    expect(result.overlays.map((route) => route.destinationIslandId)).toEqual([
      'hulhumale',
      'male',
      'same-atoll-hospital'
    ]);
    expect(result.overlays.filter((route) => route.kind === 'same_atoll')).toHaveLength(1);
    expect(result.overlays.filter((route) => route.kind === 'central')).toHaveLength(2);
    expect(result.overlays.every((route) => route.knownConnectivity === false)).toBe(true);
  });

  it('uses only Malé and Hulhumalé when no same-atoll hospital exists', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('remote-hospital', 'Remote Hospital', 'atoll-b', 0.1, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhumale', 'Hulhumalé', 'atoll-capital', 11, 0)
    ];
    const services = [
      hospital('remote-hospital-service', 'remote-hospital', 0.1, 0),
      hospital('male-hospital', 'male', 10, 0),
      hospital('hulhumale-hospital', 'hulhumale', 11, 0)
    ];

    const result = resolveElderlyHospitalRouting(snapshot(islands, services), 'origin');

    expect(result.canonical).toBeNull();
    expect(result.overlays.map((route) => route.destinationIslandId)).toEqual(['hulhumale', 'male']);
    expect(result.overlays.every((route) => route.kind === 'central')).toBe(true);
  });

  it('adds central and nearest elderly demand to inbound scores', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhumale', 'Hulhumalé', 'atoll-capital', 11, 0)
    ];
    const services = [hospital('male-hospital', 'male', 10, 0), hospital('hulhumale-hospital', 'hulhumale', 11, 0)];
    const scoringSnapshot = {
      ...snapshot(islands, services),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 100 },
        { islandId: 'origin', ageCategory: 'elderly_population_65_plus', amount: 61 },
        { islandId: 'male', ageCategory: 'total', amount: 100 },
        { islandId: 'hulhumale', ageCategory: 'total', amount: 100 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);
    const male = allocations.byIsland.get('male');
    const hulhumale = allocations.byIsland.get('hulhumale');
    const origin = allocations.byIsland.get('origin');
    const maleScore = calculateIslandScore('male', scoringSnapshot, allocations);

    expect(allocations.hospitalOverlays).toHaveLength(2);
    expect(origin?.health.outbound).toBe(100);
    expect(origin?.health.unserved).toBe(100);
    expect(male?.healthByNeed.chronic_elderly.inbound).toBe(61);
    expect(hulhumale?.healthByNeed.chronic_elderly.inbound).toBe(61);
    expect(male?.health.inbound).toBe(61);
    expect(hulhumale?.health.inbound).toBe(61);
    expect(maleScore.externalDemand.inboundHealthDemand).toBe(61);
    expect(maleScore.externalDemand.healthFactor).toBeLessThan(1);
  });

  it('counts known central overlays in transport care-transfer demand', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhumale', 'Hulhumalé', 'atoll-capital', 11, 0)
    ];
    const services = [hospital('male-hospital', 'male', 10, 0), hospital('hulhumale-hospital', 'hulhumale', 11, 0)];
    const connections = [
      ferry('origin-male', 'origin', 'male', 10),
      ferry('origin-hulhumale', 'origin', 'hulhumale', 11)
    ];
    const scoringSnapshot = {
      ...snapshot(islands, services, connections),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 100 },
        { islandId: 'origin', ageCategory: 'elderly_population_65_plus', amount: 20 },
        { islandId: 'male', ageCategory: 'total', amount: 100 },
        { islandId: 'hulhumale', ageCategory: 'total', amount: 100 }
      ],
      transportStops: [
        {
          id: 'origin-port',
          name: 'Origin port',
          islandId: 'origin',
          subtype: 'port',
          latitude: 0,
          longitude: 0,
          routeIds: ['route:male', 'route:hulhumale']
        },
        {
          id: 'male-port',
          name: 'Malé port',
          islandId: 'male',
          subtype: 'port',
          latitude: 0,
          longitude: 10,
          routeIds: ['route:male']
        },
        {
          id: 'hulhumale-port',
          name: 'Hulhumalé port',
          islandId: 'hulhumale',
          subtype: 'port',
          latitude: 0,
          longitude: 11,
          routeIds: ['route:hulhumale']
        }
      ],
      routeStops: [
        { routeId: 'route:male', stopId: 'origin-port', islandId: 'origin', sequence: 0 },
        { routeId: 'route:male', stopId: 'male-port', islandId: 'male', sequence: 1 },
        { routeId: 'route:hulhumale', stopId: 'origin-port', islandId: 'origin', sequence: 0 },
        { routeId: 'route:hulhumale', stopId: 'hulhumale-port', islandId: 'hulhumale', sequence: 1 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);
    const transport = calculateTransportDemand('origin', scoringSnapshot, allocations);

    expect(allocations.hospitalOverlays).toHaveLength(1);
    expect(allocations.hospitalOverlays[0]?.knownConnectivity).toBe(true);
    expect(transport.careTransferDemand).toBe(40);
  });

  it('routes central transfer endpoints to the configured Male jetty and Velana Airport hubs', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhule', 'Hulhule', 'atoll-airport', 11, 0)
    ];
    const connections = [
      ferry('origin-male', 'origin', 'male', 10),
      {
        ...ferry('origin-hulhule', 'origin', 'hulhule', null),
        connectionType: 'air'
      }
    ];
    const scoringSnapshot = {
      ...snapshot(islands, [], connections),
      transportStops: [
        {
          id: 'origin-port',
          name: 'Origin port',
          islandId: 'origin',
          subtype: 'port',
          latitude: 0,
          longitude: 0,
          routeIds: []
        },
        {
          id: 'prost-jetty',
          name: 'Prost Jetty',
          islandId: 'male',
          subtype: 'jetty',
          latitude: 0,
          longitude: 10,
          routeIds: []
        },
        {
          id: 'other-male-port',
          name: 'Other Port',
          islandId: 'male',
          subtype: 'port',
          latitude: 0,
          longitude: 10,
          routeIds: []
        },
        {
          id: 'origin-airport',
          name: 'Origin Airport',
          islandId: 'origin',
          subtype: 'airport',
          latitude: 0,
          longitude: 0,
          routeIds: []
        },
        {
          id: 'airport:vrmm',
          name: 'Velana International Airport',
          islandId: 'hulhule',
          subtype: 'airport',
          latitude: 0,
          longitude: 11,
          routeIds: []
        },
        {
          id: 'hulhule-terminal',
          name: 'International Departure Terminal',
          islandId: 'hulhule',
          subtype: 'air_terminal',
          latitude: 0,
          longitude: 11,
          routeIds: []
        }
      ],
      population: [{ islandId: 'origin', ageCategory: 'total', amount: 100 }]
    } as ScoringSnapshot;
    const allocations = {
      byIsland: new Map(),
      byOriginNeed: new Map(),
      byOriginCohort: new Map([
        [
          'origin:health:chronic_elderly:male',
          {
            originIslandId: 'origin',
            destinationIslandId: 'male',
            category: 'health',
            needKey: 'chronic_elderly',
            demand: 30,
            routeType: 'marine',
            routeFactor: 0.7,
            serviceSubtype: 'hospital',
            pathIslandIds: ['origin', 'male'],
            pathConnectionIds: ['origin-male'],
            knownConnectivity: true
          }
        ]
      ]),
      educationOverlays: [],
      hospitalOverlays: [
        {
          originIslandId: 'origin',
          destinationIslandId: 'hulhule',
          category: 'health',
          needKey: 'chronic_elderly',
          demand: 30,
          routeType: 'airport',
          routeFactor: 0.5,
          serviceSubtype: 'hospital',
          pathIslandIds: ['origin', 'hulhule'],
          pathConnectionIds: ['origin-hulhule'],
          knownConnectivity: true
        }
      ]
    } as DemandAllocationResult;

    const transport = calculateTransportDemand('origin', scoringSnapshot, allocations);

    expect(transport.stops.find((stop) => stop.stopId === 'prost-jetty')?.careTransferDemand).toBe(30);
    expect(transport.stops.find((stop) => stop.stopId === 'other-male-port')?.careTransferDemand).toBe(0);
    expect(transport.stops.find((stop) => stop.stopId === 'airport:vrmm')?.careTransferDemand).toBe(30);
    expect(transport.stops.find((stop) => stop.stopId === 'hulhule-terminal')?.careTransferDemand).toBe(0);
  });

  it('routes every education level through eligible paths and central overlays', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('relay', 'Relay', 'atoll-a', 0.2, 0),
      island('education-destination', 'Education destination', 'atoll-a', 0.4, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0),
      island('hulhumale', 'Hulhumalé', 'atoll-capital', 11, 0)
    ];
    const services = [
      education('preschool', 'education-destination', 'preschool', 0.4, 0),
      education('school', 'education-destination', 'school', 0.4, 0),
      education('high-school', 'education-destination', 'high_school', 0.4, 0),
      education('male-tertiary', 'male', 'tertiary', 10, 0),
      education('hulhumale-tertiary', 'hulhumale', 'tertiary', 11, 0)
    ];
    const connections = [
      ferry('origin-relay', 'origin', 'relay', 10),
      bridge('relay-education', 'relay', 'education-destination', 10)
    ];
    const scoringSnapshot = {
      ...snapshot(islands, services, connections),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 100 },
        { islandId: 'origin', ageCategory: 'child_population_0_14', amount: 10 },
        { islandId: 'origin', ageCategory: 'adolescent_population_10_19', amount: 20 },
        { islandId: 'origin', ageCategory: 'youth_population_18_35', amount: 30 },
        { islandId: 'education-destination', ageCategory: 'total', amount: 100 },
        { islandId: 'male', ageCategory: 'total', amount: 100 },
        { islandId: 'hulhumale', ageCategory: 'total', amount: 100 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);

    expect(allocations.byOriginNeed.get('origin:education:preschool')).toMatchObject({
      destinationIslandId: 'education-destination',
      serviceSubtype: 'preschool',
      routeType: 'marine',
      routeFactor: 0.63,
      pathConnectionIds: ['origin-relay', 'relay-education']
    });
    expect(allocations.byOriginNeed.get('origin:education:primary')).toMatchObject({
      destinationIslandId: 'education-destination',
      serviceSubtype: 'school'
    });
    expect(allocations.byOriginNeed.get('origin:education:secondary')).toMatchObject({
      destinationIslandId: 'education-destination',
      serviceSubtype: 'high_school'
    });
    expect(allocations.byOriginNeed.get('origin:education:higher_secondary')).toMatchObject({
      destinationIslandId: 'education-destination',
      serviceSubtype: 'high_school'
    });
    expect(allocations.byOriginNeed.get('origin:education:tertiary')).toMatchObject({
      destinationIslandId: null,
      routeType: 'unavailable'
    });
    expect(allocations.educationOverlays).toHaveLength(2);
    expect(allocations.educationOverlays.map((allocation) => allocation.destinationIslandId)).toEqual([
      'hulhumale',
      'male'
    ]);
    expect(allocations.byIsland.get('male')?.education.inbound).toBe(30);
    expect(allocations.byIsland.get('hulhumale')?.education.inbound).toBe(30);
  });

  it('falls back from missing adolescent rows to the child cohort', () => {
    const scoringSnapshot = {
      ...snapshot([island('origin', 'Origin', 'atoll-a', 0, 0)], []),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 40 },
        { islandId: 'origin', ageCategory: 'child_population_0_14', amount: 12 },
        { islandId: 'origin', ageCategory: 'youth_population_15_24', amount: 7 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);

    expect(allocations.byOriginNeed.get('origin:education:secondary')?.demand).toBe(12);
    expect(allocations.byOriginNeed.get('origin:education:higher_secondary')?.demand).toBe(12);
    expect(allocations.byOriginCohort.get('origin:education:secondary')?.demand).toBe(12);
    expect(allocations.byOriginCohort.get('origin:education:tertiary')?.demand).toBe(7);
  });

  it('adds nearest same-atoll education demand overlays without inventing transfers', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('same-atoll-school', 'Same Atoll School', 'atoll-a', 0.1, 0),
      island('male', 'Malé', 'atoll-capital', 10, 0)
    ];
    const services = [
      education('same-atoll-school-service', 'same-atoll-school', 'school', 0.1, 0),
      education('male-school-service', 'male', 'school', 10, 0)
    ];
    const scoringSnapshot = {
      ...snapshot(islands, services),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 40 },
        { islandId: 'origin', ageCategory: 'child_population_0_14', amount: 10 },
        { islandId: 'same-atoll-school', ageCategory: 'total', amount: 40 },
        { islandId: 'male', ageCategory: 'total', amount: 100 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);

    expect(allocations.byOriginCohort.get('origin:education:primary')).toMatchObject({
      destinationIslandId: null,
      routeType: 'unavailable'
    });
    expect(allocations.educationOverlays.map((allocation) => allocation.destinationIslandId)).toEqual([
      'male',
      'same-atoll-school'
    ]);
    expect(allocations.educationOverlays.every((allocation) => allocation.knownConnectivity === false)).toBe(true);
    expect(allocations.byIsland.get('same-atoll-school')?.education.inbound).toBe(10);
    expect(allocations.byIsland.get('male')?.education.inbound).toBe(10);
  });

  it('keeps known student transfers separate from care transfers', () => {
    const islands = [
      island('origin', 'Origin', 'atoll-a', 0, 0),
      island('destination', 'Destination', 'atoll-b', 1, 0)
    ];
    const services = [
      education('destination-school', 'destination', 'school', 1, 0),
      education('destination-high-school', 'destination', 'high_school', 1, 0),
      education('destination-tertiary', 'destination', 'tertiary', 1, 0)
    ];
    const scoringSnapshot = {
      ...snapshot(islands, services, [ferry('origin-destination', 'origin', 'destination', 1000)]),
      population: [
        { islandId: 'origin', ageCategory: 'total', amount: 100 },
        { islandId: 'origin', ageCategory: 'child_population_0_14', amount: 10 },
        { islandId: 'origin', ageCategory: 'adolescent_population_10_19', amount: 20 },
        { islandId: 'origin', ageCategory: 'youth_population_18_35', amount: 30 },
        { islandId: 'destination', ageCategory: 'total', amount: 100 }
      ],
      transportStops: [
        {
          id: 'origin-port',
          name: 'Origin port',
          islandId: 'origin',
          subtype: 'port',
          latitude: 0,
          longitude: 0,
          routeIds: ['route:education']
        },
        {
          id: 'destination-port',
          name: 'Destination port',
          islandId: 'destination',
          subtype: 'port',
          latitude: 0,
          longitude: 1,
          routeIds: ['route:education']
        }
      ],
      routeStops: [
        { routeId: 'route:education', stopId: 'origin-port', islandId: 'origin', sequence: 0 },
        { routeId: 'route:education', stopId: 'destination-port', islandId: 'destination', sequence: 1 }
      ]
    } as ScoringSnapshot;

    const allocations = buildDemandAllocation(scoringSnapshot);
    const transport = calculateTransportDemand('origin', scoringSnapshot, allocations);

    expect(transport.educationTransferDemand).toBe(60);
    expect(transport.careTransferDemand).toBe(0);
    expect(transport.modes.marine.educationTransferDemand).toBe(60);
    expect(transport.stops.reduce((sum, stop) => sum + stop.educationTransferDemand, 0)).toBe(60);
  });
});
