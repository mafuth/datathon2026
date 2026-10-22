import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it, vi } from 'vitest';

import {
  buildIslandConnections,
  getIslandConnections,
  IslandConnectionsNotFoundError
} from '../../src/lib/server/scoring/island-connections';
import { createMarineRouter } from '../../src/lib/server/scoring/marine-routing';

const loaders = vi.hoisted(() => ({ snapshot: vi.fn(), score: vi.fn() }));
vi.mock('../../src/lib/server/scoring/database-input', () => ({ loadScoringSnapshot: loaders.snapshot }));
vi.mock('../../src/lib/server/scoring/island-score', () => ({ getIslandScore: loaders.score }));

function snapshot(): ScoringSnapshot {
  return {
    islands: [
      { id: 'a', name: 'Selected', longitude: 73, latitude: 3 },
      { id: 'b', name: 'Neighbor', longitude: 73.1, latitude: 3.1 },
      { id: 'c', name: 'Distant', longitude: 73.4, latitude: 4 }
    ].map((island) => ({
      ...island,
      atollId: 'atoll',
      islandType: 'inhabited',
      landAreaKm2: 1,
      geoJson: JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [island.longitude - 0.001, island.latitude - 0.001],
            [island.longitude + 0.001, island.latitude - 0.001],
            [island.longitude + 0.001, island.latitude + 0.001],
            [island.longitude - 0.001, island.latitude + 0.001],
            [island.longitude - 0.001, island.latitude - 0.001]
          ]
        ]
      })
    })),
    population: [],
    vehicleCounts: [],
    services: [],
    routes: [
      {
        id: 'bus',
        name: 'Town bus',
        routeType: 'bus',
        source: 'fixture',
        sourceObjectId: 'bus',
        modeled: false,
        geoJson: JSON.stringify({
          type: 'LineString',
          coordinates: [
            [73, 3],
            [73.01, 3.01],
            [73.02, 3.01]
          ]
        })
      }
    ],
    routeStops: [{ routeId: 'bus', stopId: 'stop', islandId: 'a', sequence: 0 }],
    transportStops: [
      {
        id: 'port-a',
        name: 'Selected ferry terminal',
        islandId: 'a',
        subtype: 'ferry_terminal',
        longitude: 73.001,
        latitude: 3,
        routeIds: []
      },
      {
        id: 'port-b',
        name: 'Neighbor ferry terminal',
        islandId: 'b',
        subtype: 'ferry_terminal',
        longitude: 73.099,
        latitude: 3.1,
        routeIds: []
      },
      {
        id: 'airport-a',
        name: 'Selected airport',
        islandId: 'a',
        subtype: 'airport',
        longitude: 73.0004,
        latitude: 3.0002,
        routeIds: []
      },
      {
        id: 'airport-b',
        name: 'Neighbor airport',
        islandId: 'b',
        subtype: 'airport',
        longitude: 73.1004,
        latitude: 3.1002,
        routeIds: []
      }
    ],
    connections: [
      {
        id: 'ferry',
        routeId: null,
        fromIslandId: 'a',
        toIslandId: 'b',
        connectionType: 'ferry',
        directionality: 'bidirectional',
        sequence: null,
        distanceM: null,
        geoJson: null,
        source: 'fixture',
        sourceObjectId: 'ferry',
        modeled: false,
        scoreEligible: true
      }
    ]
  };
}

describe('selected island routes and modeled inbound flow geometry', () => {
  it('uses recorded local bus geometry and anchors ferry links at real terminals', () => {
    const result = buildIslandConnections(snapshot(), 'a', [
      { originIslandId: 'b', health: 30, education: 10, total: 40 }
    ]);
    expect(result.center).toEqual([73, 3]);
    expect(result.routes.features.find((route) => route.properties.mode === 'bus')).toMatchObject({
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [73, 3],
            [73.01, 3.01],
            [73.02, 3.01]
          ]
        ]
      },
      properties: { label: 'Town bus', schematic: false, source: 'fixture' }
    });
    expect(result.routes.features.find((route) => route.properties.mode === 'ferry')).toMatchObject({
      geometry: {
        coordinates: [
          [
            [73.001, 3],
            [73.099, 3.1]
          ]
        ]
      },
      properties: {
        neighborId: 'b',
        neighborName: 'Neighbor',
        schematic: true,
        modeled: false,
        departureName: 'Selected ferry terminal',
        arrivalName: 'Neighbor ferry terminal',
        geometryBasis: 'coast-aware-water-path'
      }
    });
    expect(result.inbound.features[0]).toMatchObject({
      geometry: {
        coordinates: [
          [73.1, 3.1],
          [73, 3]
        ]
      },
      properties: { originName: 'Neighbor', health: 30, education: 10, total: 40, schematic: true }
    });
  });

  it('deduplicates reverse connection records and bus shapes without changing source arrays', () => {
    const data = snapshot();
    data.connections.push({ ...data.connections[0], id: 'reverse', fromIslandId: 'b', toIslandId: 'a' });
    data.routes.push({
      ...data.routes[0],
      id: 'bus-reverse',
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73.02, 3.01],
          [73.01, 3.01],
          [73, 3]
        ]
      })
    });
    data.routeStops.push({ routeId: 'bus-reverse', stopId: 'stop-2', islandId: 'a', sequence: 0 });
    const before = JSON.stringify(data);
    const result = buildIslandConnections(data, 'a', []);
    expect(result.routes.features.map((route) => route.properties.mode).sort()).toEqual(['bus', 'ferry']);
    expect(JSON.stringify(data)).toBe(before);
    expect(buildIslandConnections(data, 'a', [])).toEqual(result);
  });

  it('keeps distinct bridges without route IDs while deduplicating reverse shapes and schematic fallbacks', () => {
    const data = snapshot();
    const firstBridge = [
      [73, 3],
      [73.03, 3.04],
      [73.1, 3.1]
    ];
    const secondBridge = [
      [73, 3.001],
      [73.04, 3.06],
      [73.1, 3.101]
    ];
    data.connections.push(
      { ...data.connections[0], id: 'ferry-reverse', fromIslandId: 'b', toIslandId: 'a' },
      {
        ...data.connections[0],
        id: 'bridge-one',
        connectionType: 'bridge',
        geoJson: JSON.stringify({ type: 'LineString', coordinates: firstBridge })
      },
      {
        ...data.connections[0],
        id: 'bridge-two',
        connectionType: 'bridge',
        geoJson: JSON.stringify({ type: 'LineString', coordinates: secondBridge })
      },
      {
        ...data.connections[0],
        id: 'bridge-one-reverse',
        connectionType: 'bridge',
        fromIslandId: 'b',
        toIslandId: 'a',
        geoJson: JSON.stringify({ type: 'LineString', coordinates: [...firstBridge].reverse() })
      }
    );
    const result = buildIslandConnections(data, 'a', []);
    expect(
      result.routes.features
        .filter((route) => route.properties.mode === 'land')
        .map((route) => route.geometry.coordinates)
    ).toEqual([[firstBridge], [secondBridge]]);
    expect(result.routes.features.filter((route) => route.properties.mode === 'ferry')).toHaveLength(1);
    expect(result.routes.features.map((route) => route.id)).not.toContain('connection:bridge-one-reverse');
  });

  it('keeps direct recorded segment geometry and does not invent bus routes through stops', () => {
    const data = snapshot();
    data.connections[0].geoJson = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [73.001, 3.001],
          [73.05, 3.03],
          [73.1, 3.1]
        ]
      }
    });
    data.routeStops = [];
    data.transportStops.push({
      id: 'stop',
      name: null,
      islandId: 'a',
      subtype: 'bus_stop',
      latitude: 3,
      longitude: 73,
      routeIds: []
    });
    const result = buildIslandConnections(data, 'a', []);
    expect(result.routes.features).toHaveLength(1);
    expect(result.routes.features[0]).toMatchObject({
      geometry: {
        coordinates: [
          [
            [73.001, 3],
            [73.05, 3.03],
            [73.099, 3.1]
          ]
        ]
      },
      properties: { mode: 'ferry', schematic: false }
    });
  });

  it('rejects unrelated whole-route shapes and routes directly between terminals', () => {
    const data = snapshot();
    data.routes.push({
      ...data.routes[0],
      id: 'long-ferry',
      routeType: 'ferry',
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73, 3],
          [73.1, 3.1],
          [73.4, 4]
        ]
      })
    });
    data.connections[0].routeId = 'long-ferry';
    const result = buildIslandConnections(data, 'a', []);
    expect(result.routes.features.find((route) => route.properties.mode === 'ferry')).toMatchObject({
      geometry: {
        coordinates: [
          [
            [73.001, 3],
            [73.099, 3.1]
          ]
        ]
      },
      properties: { schematic: true }
    });
  });

  it('uses pair-matching route geometry when a connection has no individual shape', () => {
    const data = snapshot();
    data.routes.push({
      ...data.routes[0],
      id: 'ferry-shape',
      name: 'Atoll ferry',
      routeType: 'ferry',
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73, 3],
          [73.05, 3.07],
          [73.1, 3.1]
        ]
      })
    });
    data.connections[0].routeId = 'ferry-shape';
    const result = buildIslandConnections(data, 'a', []);
    expect(result.routes.features.find((route) => route.properties.mode === 'ferry')).toMatchObject({
      geometry: {
        coordinates: [
          [
            [73.001, 3],
            [73.05, 3.07],
            [73.099, 3.1]
          ]
        ]
      },
      properties: { label: 'Atoll ferry', schematic: false }
    });
  });

  it('merges repeated inbound origins, preserves names and orders their demand by magnitude', () => {
    const result = buildIslandConnections(snapshot(), 'a', [
      { originIslandId: 'b', originName: 'Provided name', health: 4, education: 6, total: 10 },
      { originIslandId: 'c', health: 40, education: 60, total: 100 },
      { originIslandId: 'b', health: 2, education: 3, total: 5 },
      { originIslandId: 'a', health: 500, education: 0, total: 500 }
    ]);
    expect(result.inbound.features.map((flow) => flow.properties.originIslandId)).toEqual(['c', 'b']);
    expect(result.inbound.features[1].properties).toMatchObject({
      originName: 'Provided name',
      health: 6,
      education: 9,
      total: 15
    });
    expect(result.summary).toMatchObject({ inboundSourceCount: 2, mappedInboundSourceCount: 2, maxInboundDemand: 100 });
  });

  it('replaces center-based flight shapes with actual airport coordinates in either direction', () => {
    const data = snapshot();
    data.connections[0].connectionType = 'air';
    data.connections[0].geoJson = JSON.stringify({
      type: 'LineString',
      coordinates: [
        [73, 3],
        [73.1, 3.1]
      ]
    });
    const outward = buildIslandConnections(data, 'a', []).routes.features.find(
      (route) => route.properties.mode === 'air'
    )!;
    const inward = buildIslandConnections(data, 'b', []).routes.features.find(
      (route) => route.properties.mode === 'air'
    )!;
    expect(outward.geometry.coordinates).toEqual([
      [
        [73.0004, 3.0002],
        [73.1004, 3.1002]
      ]
    ]);
    expect(inward.geometry.coordinates).toEqual([
      [
        [73.1004, 3.1002],
        [73.0004, 3.0002]
      ]
    ]);
    expect(outward.properties).toMatchObject({
      departureName: 'Selected airport',
      arrivalName: 'Neighbor airport',
      geometryBasis: 'airport-link'
    });
  });

  it('shows shared-airport flights for a connected island and omits a zero-length airport access flight', () => {
    const data = snapshot();
    data.transportStops = data.transportStops.filter((stop) => stop.id !== 'airport-a');
    data.transportStops.push({
      id: 'airport-c',
      name: 'Distant airport',
      islandId: 'c',
      subtype: 'airport',
      longitude: 73.4004,
      latitude: 4.0002,
      routeIds: []
    });
    data.connections.push(
      { ...data.connections[0], id: 'bridge', connectionType: 'bridge' },
      { ...data.connections[0], id: 'airport-access', connectionType: 'air' },
      { ...data.connections[0], id: 'flight', fromIslandId: 'b', toIslandId: 'c', connectionType: 'air' }
    );
    const result = buildIslandConnections(data, 'a', []);
    const flights = result.routes.features.filter((route) => route.properties.mode === 'air');
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      geometry: {
        coordinates: [
          [
            [73.1004, 3.1002],
            [73.4004, 4.0002]
          ]
        ]
      },
      properties: { neighborId: 'c', departureIslandId: 'b', departureName: 'Neighbor airport' }
    });
    expect(result.summary.sharedAirportName).toBe('Neighbor airport');
  });

  it('replaces a recorded ferry shortcut that crosses an intervening island with a checked water path', () => {
    const data = snapshot();
    data.islands.push({
      ...data.islands[0],
      id: 'obstacle',
      name: 'Intervening island',
      longitude: 73.05,
      latitude: 3.05,
      geoJson: JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [73.04, 3.04],
            [73.06, 3.04],
            [73.06, 3.06],
            [73.04, 3.06],
            [73.04, 3.04]
          ]
        ]
      })
    });
    data.connections[0].geoJson = JSON.stringify({
      type: 'LineString',
      coordinates: [
        [73, 3],
        [73.1, 3.1]
      ]
    });
    const ferry = buildIslandConnections(data, 'a', []).routes.features.find(
      (route) => route.properties.mode === 'ferry'
    )!;
    expect(ferry.geometry.coordinates[0].length).toBeGreaterThan(2);
    expect(ferry.geometry.coordinates[0][0]).toEqual([73.001, 3]);
    expect(ferry.geometry.coordinates[0].at(-1)).toEqual([73.099, 3.1]);
    expect(createMarineRouter(data).isWaterPath(ferry.geometry.coordinates[0])).toBe(true);
    expect(ferry.properties.geometryBasis).toBe('coast-aware-water-path');
  });

  it('does not invent a ferry terminal at an island center when no mapped access exists', () => {
    const data = snapshot();
    data.transportStops = data.transportStops.filter((stop) => stop.subtype !== 'ferry_terminal');
    const result = buildIslandConnections(data, 'a', []);
    expect(result.routes.features.filter((route) => route.properties.mode === 'ferry')).toEqual([]);
    expect(result.summary.unmappedRouteCount).toBe(1);
  });

  it('omits unusable coordinates and malformed geometry and reports partial data', () => {
    const data = snapshot();
    data.islands[1].latitude = Number.NaN;
    data.transportStops = data.transportStops.filter((stop) => stop.islandId !== 'b');
    data.routes[0].geoJson = '{invalid';
    const result = buildIslandConnections(data, 'a', [
      { originIslandId: 'b', health: 10, education: 0, total: 10 },
      { originIslandId: 'missing', health: 3, education: 0, total: 3 },
      { originIslandId: 'c', health: Number.NaN, education: -4, total: Number.POSITIVE_INFINITY }
    ]);
    expect(result.routes.features).toEqual([]);
    expect(result.inbound.features).toEqual([]);
    expect(result.summary).toMatchObject({ inboundSourceCount: 2, mappedInboundSourceCount: 0, maxInboundDemand: 0 });
    expect(result.limitations).toContain('2 inbound origins have no usable island coordinates.');
    expect(result.limitations).toContain('1 connections lack usable terminals or a verified mapped path.');
  });

  it('does not map a missing island', async () => {
    expect(() => buildIslandConnections(snapshot(), 'unknown', [])).toThrow(IslandConnectionsNotFoundError);
    await expect(getIslandConnections(' ')).rejects.toBeInstanceOf(IslandConnectionsNotFoundError);
    loaders.snapshot.mockResolvedValueOnce(snapshot());
    await expect(getIslandConnections('unknown')).rejects.toBeInstanceOf(IslandConnectionsNotFoundError);
  });

  it('loads baseline demand from the same immutable snapshot as the route data', async () => {
    const data = snapshot();
    loaders.snapshot.mockResolvedValueOnce(data);
    loaders.score.mockResolvedValueOnce({
      demand: { inboundSources: [{ originIslandId: 'b', health: 5, education: 7, total: 12 }] }
    });
    const result = await getIslandConnections(' a ');
    expect(loaders.score).toHaveBeenLastCalledWith('a', data);
    expect(result.inbound.features[0].properties.total).toBe(12);
  });
});
