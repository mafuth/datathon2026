import type { ProposalTransportOperation } from '../../src/lib/mobility/proposal-transport';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
  proposalTransportOperationSchema,
  snapToProposalBusRoute,
  transportDeparturesPerDirection,
  transportDistanceKm,
  transportMinimumFleet
} from '../../src/lib/mobility/proposal-transport';
import {
  getProposalTransportOptions,
  ProposalTransportError,
  resolveProposalTransport
} from '../../src/lib/server/mobility/proposal-transport';
import { projectScenario, ScenarioDomainError } from '../../src/lib/server/mobility/scenario-engine';
import { createMarineRouter } from '../../src/lib/server/scoring/marine-routing';

function snapshot(): ScoringSnapshot {
  const islands = [
    { id: 'island-1', name: 'Origin', longitude: 73 },
    { id: 'island-2', name: 'Destination', longitude: 73.1 }
  ].map((island) => ({
    ...island,
    latitude: 3,
    islandType: 'inhabited',
    landAreaKm2: 1,
    atollId: 'atoll-1',
    geoJson: JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [island.longitude - 0.02, 2.98],
          [island.longitude + 0.02, 2.98],
          [island.longitude + 0.02, 3.02],
          [island.longitude - 0.02, 3.02],
          [island.longitude - 0.02, 2.98]
        ]
      ]
    })
  }));
  const services = [
    {
      id: 'port-1',
      islandId: 'island-1',
      longitude: 73,
      latitude: 3,
      name: 'Origin port',
      serviceType: 'transport',
      subtype: 'port'
    },
    {
      id: 'port-2',
      islandId: 'island-2',
      longitude: 73.1,
      latitude: 3,
      name: 'Destination jetty',
      serviceType: 'transport',
      subtype: 'jetty'
    },
    {
      id: 'bus-stop',
      islandId: 'island-1',
      longitude: 73.01,
      latitude: 3,
      name: 'Bus stop',
      serviceType: 'transport',
      subtype: 'bus_stop'
    }
  ];
  return {
    islands,
    services,
    population: [],
    vehicleCounts: [],
    connections: [],
    routes: [
      {
        id: 'bus-route',
        name: 'Mapped bus direction',
        routeType: 'bus',
        geoJson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [73, 3],
            [73.01, 3]
          ]
        }),
        source: 'fixture',
        sourceObjectId: 'bus',
        modeled: false
      },
      {
        id: 'ferry-route',
        name: 'Existing ferry',
        routeType: 'ferry',
        geoJson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [73, 3],
            [73.1, 3]
          ]
        }),
        source: 'fixture',
        sourceObjectId: 'ferry',
        modeled: false
      }
    ],
    transportStops: services.map((service) => ({
      ...service,
      routeIds: service.subtype === 'bus_stop' ? ['bus-route'] : []
    })),
    routeStops: [{ routeId: 'bus-route', stopId: 'bus-stop', islandId: 'island-1', sequence: 0 }]
  };
}

const bus: ProposalTransportOperation = {
  operationId: 'new-bus',
  kind: 'add_bus_service',
  routeId: 'bus-route',
  headwayMinutes: 60,
  startHour: 6,
  endHour: 22,
  serviceDaysPerWeek: 7,
  vehicleCount: 1
};
const ferry: ProposalTransportOperation = {
  operationId: 'new-ferry',
  kind: 'add_ferry_service',
  originStopId: 'port-1',
  destinationStopId: 'port-2',
  headwayMinutes: 60,
  startHour: 6,
  endHour: 22,
  serviceDaysPerWeek: 7,
  vehicleCount: 2,
  speedKph: 30
};

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

describe('native transport proposal contracts and fleet assumptions', () => {
  it('sizes fleets for a full return cycle including turnaround', () => {
    expect(transportMinimumFleet('bus', 10, 20)).toBe(4);
    expect(transportMinimumFleet('ferry', 30, 30, 30)).toBe(5);
    expect(transportMinimumFleet('bus', 10, 0)).toBe(0);
    expect(transportMinimumFleet('ferry', Number.NaN, 30, 30)).toBe(0);
    expect(() => resolveProposalTransport(snapshot(), 'island-1', { ...ferry, vehicleCount: 1 })).toThrow(
      'at least 2 ferries'
    );
  });

  it('counts departures inside an end-exclusive operating window', () => {
    expect(transportDeparturesPerDirection(6, 22, 60)).toBe(16);
    expect(transportDeparturesPerDirection(6, 7, 40)).toBe(2);
    expect(transportDeparturesPerDirection(22, 6, 60)).toBe(0);
    expect(transportDeparturesPerDirection(6, 22, 0)).toBe(0);
    expect(transportDeparturesPerDirection(Number.NaN, 22, 60)).toBe(0);
  });

  it.each([
    { headwayMinutes: 0 },
    { headwayMinutes: 1441 },
    { headwayMinutes: Number.NaN },
    { startHour: -1 },
    { startHour: 6.5 },
    { endHour: 25 },
    { serviceDaysPerWeek: 0 },
    { serviceDaysPerWeek: 8 },
    { serviceDaysPerWeek: 1.5 },
    { vehicleCount: 0 },
    { vehicleCount: 101 },
    { speedKph: 0 }
  ])('rejects invalid service parameters %j', (invalid) => {
    expect(v.safeParse(proposalTransportOperationSchema, { ...ferry, ...invalid }).success).toBe(false);
  });

  it('rejects equal or overnight hours on the server', () => {
    for (const operation of [
      { ...ferry, endHour: 6 },
      { ...ferry, startHour: 22, endHour: 6 }
    ]) {
      expect(() => resolveProposalTransport(snapshot(), 'island-1', operation)).toThrow('end hour must be later');
    }
  });
});

describe('transport route and landing validation', () => {
  it('snaps a proposed bus stop to mapped bus geometry only within 35 metres', () => {
    const options = getProposalTransportOptions(snapshot(), 'island-1');
    const latitudeOffset = (metres: number) => ((metres / 6_371_000) * 180) / Math.PI;
    const boundary = snapToProposalBusRoute([73.005, 3 + latitudeOffset(35)], options.busRoutes);
    expect(boundary).toMatchObject({ routeId: 'bus-route', routeName: 'Mapped bus direction' });
    expect(boundary?.coordinates[0]).toBeCloseTo(73.005, 7);
    expect(boundary?.coordinates[1]).toBe(3);
    expect(boundary?.distanceMeters).toBeCloseTo(35, 5);
    expect(snapToProposalBusRoute([73.005, 3 + latitudeOffset(35.01)], options.busRoutes)).toBeNull();
    expect(snapToProposalBusRoute([73.005, 3], [{ id: 'no-geometry', name: 'Missing geometry' }])).toBeNull();
    expect(snapToProposalBusRoute([73.1, 3], options.busRoutes)).toBeNull();
    expect(snapToProposalBusRoute([Number.NaN, 3], options.busRoutes)).toBeNull();
  });

  it('offers only routes serving the selected island and existing marine terminals', () => {
    const options = getProposalTransportOptions(snapshot(), 'island-1');
    expect(options.busRoutes.map((route) => route.id)).toEqual(['bus-route']);
    expect(options.busRoutes[0].distanceKm).toBeGreaterThan(1.1);
    expect(options.busRoutes[0].distanceKm).toBeLessThan(1.12);
    expect(options.origins.map((stop) => stop.id)).toEqual(['port-1']);
    expect(options.destinations.map((stop) => stop.id)).toEqual(['port-2']);
    expect(() => getProposalTransportOptions(snapshot(), 'missing')).toThrow(ProposalTransportError);
  });

  it('rejects unknown, wrong-mode and wrong-island bus routes', () => {
    for (const routeId of ['missing', 'ferry-route']) {
      expect(() => resolveProposalTransport(snapshot(), 'island-1', { ...bus, routeId })).toThrow(
        ProposalTransportError
      );
    }
    expect(() => resolveProposalTransport(snapshot(), 'island-2', bus)).toThrow('serving the selected island');
  });

  it.each([
    { originStopId: 'missing' },
    { destinationStopId: 'missing' },
    { originStopId: 'port-2', destinationStopId: 'port-1' },
    { destinationStopId: 'port-1' },
    { destinationStopId: 'bus-stop' }
  ])('rejects invalid ferry endpoints %j', (invalid) => {
    expect(() => resolveProposalTransport(snapshot(), 'island-1', { ...ferry, ...invalid })).toThrow(
      ProposalTransportError
    );
  });
});

describe('authoritative transport costing and immutable projection', () => {
  it('keeps empty drafts and untouched baseline rows shared while moving only the affected stop', () => {
    const data = snapshot();
    freeze(data);
    expect(projectScenario(data, data.islands[0], 'island-1', []).snapshot).toBe(data);
    const projected = projectScenario(data, data.islands[0], 'island-1', [
      { kind: 'move_service', operationId: 'move-bus', serviceId: 'bus-stop', coordinates: [73.005, 3] }
    ]);
    expect(projected.snapshot.services[0]).toBe(data.services[0]);
    expect(projected.snapshot.routes).toBe(data.routes);
    expect(projected.snapshot.connections).toBe(data.connections);
    expect(projected.snapshot.transportStops.find((stop) => stop.id === 'bus-stop')?.longitude).toBe(73.005);
    expect(projected.snapshot.transportStops.find((stop) => stop.id === 'port-1')).toBe(data.transportStops[0]);
    expect(data.transportStops.find((stop) => stop.id === 'bus-stop')?.longitude).toBe(73.01);
  });

  it('prices bus mapped mileage and the selected service window without client-provided costs', () => {
    const result = resolveProposalTransport(snapshot(), 'island-1', bus);
    expect(result.plan.distanceKm).toBeGreaterThan(1.1);
    expect(result.plan.distanceKm).toBeLessThan(1.12);
    expect(result.cost.capital).toBe(3_000_000);
    // 16 outward departures and budgeted repositioning over 365 operating days.
    expect(result.cost.annual).toBeGreaterThan(385_000);
    expect(result.cost.annual).toBeLessThan(391_000);
    const halfFrequency = resolveProposalTransport(snapshot(), 'island-1', { ...bus, headwayMinutes: 120 });
    expect(halfFrequency.cost.annual).toBeCloseTo(result.cost.annual / 2, 1);
    expect(result.connection).toBeNull();
    expect(result.cost.costAvailable).toBe(true);
  });

  it('prices a bidirectional ferry package and qualifies its lower-bound cost and fleet distance', () => {
    const result = resolveProposalTransport(snapshot(), 'island-1', ferry);
    expect(result.plan.distanceKm).toBeGreaterThan(11);
    expect(result.plan.distanceKm).toBeLessThan(11.2);
    expect(result.cost.capital).toBe(30_000_000);
    expect(result.cost.annual).toBeGreaterThan(12_800_000);
    expect(result.cost.annual).toBeLessThan(13_100_000);
    expect(result.connection).toMatchObject({
      directionality: 'bidirectional',
      fromIslandId: 'island-1',
      toIslandId: 'island-2',
      modeled: true
    });
    expect(result.plan.assumptions.join(' ')).toContain('lower-bound planning assumption');
    expect(result.plan.assumptions.join(' ')).toContain('displayed ferry path avoids mapped island land');
    expect(result.plan.assumptions.join(' ')).toContain('mapped landing coordinate is inland');
    expect(result.plan.assumptions.join(' ')).toContain('Current waiting time');
    expect(result.plan.proposedExpectedWaitMinutes).toBe(30);
  });

  it('routes an accepted ferry around intervening land while retaining the direct cost-distance contract', () => {
    const data = snapshot();
    // Put both landing places on their islands' facing shores, with another island between them.
    for (const records of [data.services, data.transportStops]) {
      records.find((entry) => entry.id === 'port-1')!.longitude = 73.02;
      records.find((entry) => entry.id === 'port-2')!.longitude = 73.08;
    }
    data.islands.push({
      ...data.islands[0],
      id: 'obstacle',
      name: 'Intervening island',
      longitude: 73.05,
      geoJson: JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [73.04, 2.99],
            [73.06, 2.99],
            [73.06, 3.01],
            [73.04, 3.01],
            [73.04, 2.99]
          ]
        ]
      })
    });
    const result = resolveProposalTransport(data, 'island-1', ferry);
    const path = result.plan.geometry.coordinates[0];
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]).toEqual([73.02, 3]);
    expect(path.at(-1)).toEqual([73.08, 3]);
    for (let index = 1; index < path.length; index++)
      for (let step = 0; step <= 100; step++) {
        const fraction = step / 100;
        const x = path[index - 1][0] + (path[index][0] - path[index - 1][0]) * fraction;
        const y = path[index - 1][1] + (path[index][1] - path[index - 1][1]) * fraction;
        expect(x > 73.04 + 1e-9 && x < 73.06 - 1e-9 && y > 2.99 + 1e-9 && y < 3.01 - 1e-9).toBe(false);
      }
    expect(createMarineRouter(data).isWaterPath(path)).toBe(true);
    const directKm = transportDistanceKm([73.02, 3], [73.08, 3]);
    const displayKm = path.slice(1).reduce((sum, point, index) => sum + transportDistanceKm(path[index], point), 0);
    expect(displayKm).toBeGreaterThan(directKm);
    expect(result.plan.distanceKm).toBe(directKm);
    expect(result.connection?.distanceM).toBe(directKm * 1000);
    expect(result.route?.geoJson).toBe(JSON.stringify(result.plan.geometry));
    expect(result.connection?.geoJson).toBe(result.route?.geoJson);
    const expectedAnnual = Math.round(16 * 2 * directKm * 365 * 100 * 100) / 100;
    expect(result.cost.annual).toBe(expectedAnnual);
    expect(result.cost.basis).toContain('fleet size and sailing-time estimates retain direct endpoint distance');
  });

  it('rejects ferry proposals when coastline data cannot support land-avoiding display geometry', () => {
    const data = snapshot();
    data.islands[1].geoJson = '{}';
    let error: unknown;
    try {
      resolveProposalTransport(data, 'island-1', ferry);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ProposalTransportError);
    expect(error).toMatchObject({ code: 'TRANSPORT_INVALID', status: 422 });
    expect((error as Error).message).toContain('usable coastline geometry for every island');
  });

  it('projects deterministic routes and costs while leaving a deeply frozen baseline untouched', () => {
    const data = snapshot();
    const before = structuredClone(data);
    freeze(data);
    const projected = projectScenario(data, data.islands[0], 'island-1', [bus, ferry]);
    expect(data).toEqual(before);
    expect(projected.snapshot.routes).toHaveLength(data.routes.length + 1);
    expect(projected.snapshot.connections).toHaveLength(1);
    expect(projected.snapshot.services).toEqual(data.services);
    expect(projected.transportCosts.map((item) => item.capital)).toEqual([3_000_000, 30_000_000]);
    expect(projected.transportPlans).toHaveLength(2);
    expect(projectScenario(data, data.islands[0], 'island-1', [bus, ferry])).toEqual(projected);
  });

  it('rejects duplicate service packages and a ferry using a removed or moved landing', () => {
    const data = snapshot();
    expect(() =>
      projectScenario(data, data.islands[0], 'island-1', [bus, { ...bus, operationId: 'duplicate-bus' }])
    ).toThrow(ScenarioDomainError);
    expect(() =>
      projectScenario(data, data.islands[0], 'island-1', [
        ferry,
        { kind: 'delete_service', operationId: 'remove-port', serviceId: 'port-1' }
      ])
    ).toThrow('existing landing places');
    expect(() =>
      projectScenario(data, data.islands[0], 'island-1', [
        { kind: 'move_service', operationId: 'move-port', serviceId: 'port-1', coordinates: [73.001, 3] },
        ferry
      ])
    ).toThrow('existing landing places');
  });
});
