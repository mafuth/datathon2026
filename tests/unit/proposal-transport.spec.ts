import type { ProposalTransportOperation } from '../../src/lib/mobility/proposal-transport';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { projectScenario, ScenarioDomainError } from '../../src/lib/server/mobility/scenario-engine';

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

describe('proposal transport scenario linkage', () => {
  it('returns authoritative transport costs and plans while projecting ferry links', () => {
    const data = snapshot();
    const projected = projectScenario(data, data.islands[0], 'island-1', [bus, ferry]);

    expect(projected.transportCosts.map((item) => item.capital)).toEqual([3_000_000, 30_000_000]);
    expect(projected.transportPlans.map((plan) => plan.mode)).toEqual(['bus', 'ferry']);
    expect(projected.snapshot.routes).toHaveLength(data.routes.length + 1);
    expect(projected.snapshot.connections).toHaveLength(1);
    const connection = projected.snapshot.connections[0];
    expect(connection.sequence).toBe(1);
    expect(projected.snapshot.routeStops.filter((stop) => stop.routeId === connection.routeId)).toEqual([
      expect.objectContaining({ stopId: 'port-1', sequence: 0 }),
      expect.objectContaining({ stopId: 'port-2', sequence: 1 })
    ]);
    expect(projected.snapshot.transportStops.find((stop) => stop.id === 'port-1')?.routeIds).toContain(
      connection.routeId
    );
    expect(data.routeStops).toHaveLength(1);
    expect(data.transportStops.find((stop) => stop.id === 'port-1')?.routeIds).toEqual([]);
    expect(projected.results.map((result) => result.operationId)).toEqual(['new-bus', 'new-ferry']);
  });

  it('rejects duplicate operation identifiers and transport packages', () => {
    const data = snapshot();
    expect(() =>
      projectScenario(data, data.islands[0], 'island-1', [bus, { ...ferry, operationId: bus.operationId }])
    ).toThrow(ScenarioDomainError);
    expect(() =>
      projectScenario(data, data.islands[0], 'island-1', [bus, { ...bus, operationId: 'duplicate-bus' }])
    ).toThrow('route already has a proposed service');
  });

  it('rejects a ferry using a removed or moved landing', () => {
    const data = snapshot();
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

  it('keeps ordinary service operations working', () => {
    const data = snapshot();
    const projected = projectScenario(data, data.islands[0], 'island-1', [
      { kind: 'move_service', operationId: 'move-stop', serviceId: 'bus-stop', coordinates: [73.005, 3] }
    ]);

    expect(projected.snapshot.services.find((service) => service.id === 'bus-stop')?.longitude).toBe(73.005);
    expect(projected.snapshot.transportStops.find((stop) => stop.id === 'bus-stop')?.longitude).toBe(73.005);
    expect(projected.transportCosts).toEqual([]);
    expect(projected.transportPlans).toEqual([]);
  });
});
