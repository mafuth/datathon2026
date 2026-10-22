import type { Service, TransportConnection, TransportRoute } from '../../src/lib/db/models';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it } from 'vitest';

import { createConnectionEndpointResolver } from '../../src/lib/server/scoring/connection-endpoints';

function snapshot(): ScoringSnapshot {
  return {
    islands: [
      { id: 'a', name: 'Selected', longitude: 73, latitude: 3 },
      { id: 'b', name: 'Airport island', longitude: 73.1, latitude: 3.1 },
      { id: 'c', name: 'Distant island', longitude: 73.4, latitude: 4 }
    ].map((island) => ({ ...island, atollId: 'atoll', islandType: 'inhabited', landAreaKm2: 1, geoJson: '{}' })),
    population: [],
    vehicleCounts: [],
    services: [],
    transportStops: [],
    routeStops: [],
    connections: [],
    routes: []
  };
}

function service(
  id: string,
  islandId: string,
  subtype: string,
  name: string | null,
  longitude = 73.001,
  latitude = 3.001
): Service {
  return { id, islandId, serviceType: 'transport', subtype, name, longitude, latitude };
}

function connection(
  id: string,
  fromIslandId: string,
  toIslandId: string,
  connectionType = 'bridge',
  directionality = 'bidirectional'
): TransportConnection {
  return {
    id,
    routeId: null,
    fromIslandId,
    toIslandId,
    connectionType,
    directionality,
    sequence: null,
    distanceM: null,
    geoJson: null,
    source: 'fixture',
    sourceObjectId: id,
    modeled: false,
    scoreEligible: true
  };
}

function route(id: string, routeType = 'bus'): TransportRoute {
  return { id, name: id, routeType, geoJson: '{}', source: 'fixture', sourceObjectId: id, modeled: false };
}

describe('source-backed island connection endpoints', () => {
  it('uses the terminal at a recorded sailing endpoint even when a different coast has a named terminal', () => {
    const data = snapshot();
    data.services.push(
      service('west-landing', 'a', 'port', null, 72.992, 3),
      service('east-terminal', 'a', 'port', 'Public Ferry Terminal', 73.008, 3)
    );
    const ferry = {
      ...connection('ferry', 'a', 'b', 'ferry'),
      routeId: 'ferry-route',
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [72.992, 3],
          [73.1, 3.1]
        ]
      })
    };
    data.connections.push(ferry);
    data.routes.push(route('ferry-route', 'ferry'));
    expect(createConnectionEndpointResolver(data).resolve('a', 'ferry', 'ferry-route', [73.1, 3.1])).toMatchObject({
      id: 'west-landing',
      coordinates: [72.992, 3],
      routeMatched: true
    });
  });
  it('prefers an explicitly associated route stop over a different named ferry terminal', () => {
    const data = snapshot();
    data.services.push(service('public-terminal', 'a', 'port', 'Public Ferry Terminal'));
    data.transportStops.push({
      id: 'route-jetty',
      name: 'East jetty',
      islandId: 'a',
      subtype: 'jetty',
      longitude: 73.005,
      latitude: 3.002,
      routeIds: []
    });
    data.routeStops.push({ stopId: 'route-jetty', islandId: 'a', routeId: 'ferry-route', sequence: 0 });
    const resolver = createConnectionEndpointResolver(data);
    expect(resolver.resolve('a', 'ferry', 'ferry-route')).toMatchObject({
      id: 'route-jetty',
      islandId: 'a',
      coordinates: [73.005, 3.002],
      source: 'route_stop',
      routeMatched: true,
      terminalVerified: true,
      access: 'local',
      airportKind: null
    });
    expect(resolver.resolve('a', 'ferry')?.id).toBe('public-terminal');
  });

  it('uses exact imported source-stop IDs as route evidence without partial ID matches', () => {
    const data = snapshot();
    data.services.push(
      service('osm:way:123', 'a', 'jetty', null),
      service('osm:way:12', 'a', 'port', 'Ferry Terminal')
    );
    data.connections.push({
      ...connection('ferry', 'a', 'b', 'ferry'),
      routeId: 'route',
      sourceObjectId: 'marine:route:start:osm:way:123'
    });
    expect(createConnectionEndpointResolver(data).resolve('a', 'ferry', 'route')).toMatchObject({
      id: 'osm:way:123',
      routeMatched: true
    });
  });

  it('prefers named passenger access and uses the target to choose between equally ranked terminals', () => {
    const data = snapshot();
    data.services.push(
      service('cargo', 'a', 'port', 'Cargo Terminal', 73.009),
      service('west', 'a', 'port', 'West Ferry Terminal', 73.001),
      service('east', 'a', 'port', 'East Ferry Terminal', 73.008)
    );
    const resolver = createConnectionEndpointResolver(data);
    expect(resolver.resolve('a', 'ferry', null, [73.009, 3.001])?.id).toBe('east');
    expect(resolver.resolve('a', 'ferry', null, [73, 3.001])?.id).toBe('west');
  });

  it('rejects unusable coordinates, unrelated service categories and other islands rather than using a center', () => {
    const data = snapshot();
    data.services.push(
      service('neighbor-port', 'b', 'port', 'Ferry Terminal'),
      service('invalid', 'a', 'port', 'Ferry Terminal', Number.NaN),
      service('out-of-range', 'a', 'port', 'Ferry Terminal', 181),
      { ...service('clinic', 'a', 'port', 'Ferry Terminal'), serviceType: 'health' }
    );
    const resolver = createConnectionEndpointResolver(data);
    expect(resolver.resolve('a', 'ferry')).toBeNull();
    expect(resolver.resolve('a', 'air')).toBeNull();
    expect(resolver.resolve('missing', 'ferry')).toBeNull();
  });

  it('prefers a canonical land airport and keeps route-matched airport terminal coordinates when available', () => {
    const data = snapshot();
    data.services.push(
      service('osm:way:airport', 'a', 'airport', 'Local Airport'),
      service('airport:canonical', 'a', 'airport', 'Local Airport', 73.002),
      service('terminal', 'a', 'air_terminal', 'Domestic Terminal', 73.003),
      service('tma', 'a', 'air_terminal', 'TMA Departure Terminal', 73.004),
      service('airport:neighbor', 'b', 'airport', 'Other Airport')
    );
    data.transportStops.push({
      ...service('terminal', 'a', 'air_terminal', 'Domestic Terminal', 73.003),
      islandId: 'a',
      routeIds: ['flight']
    });
    data.connections.push(connection('bridge', 'a', 'b'));
    const resolver = createConnectionEndpointResolver(data);
    expect(resolver.resolve('a', 'air')).toMatchObject({
      id: 'airport:canonical',
      airportKind: 'land',
      access: 'local'
    });
    expect(resolver.resolve('a', 'air', 'flight')).toMatchObject({
      id: 'terminal',
      airportKind: 'land',
      coordinates: [73.003, 3.001],
      source: 'route_stop'
    });
  });

  it('uses a reachable land airport before a local waterdrome and exposes exact access evidence', () => {
    const data = snapshot();
    data.services.push(
      service('water', 'a', 'airport', 'Waterdrome'),
      service('airport:land', 'b', 'airport', 'International Airport', 73.101, 3.101)
    );
    data.connections.push(connection('causeway', 'a', 'b', 'causeway'));
    const result = createConnectionEndpointResolver(data).resolve('a', 'air');
    expect(result).toMatchObject({
      id: 'airport:land',
      islandId: 'b',
      requestedIslandId: 'a',
      coordinates: [73.101, 3.101],
      airportKind: 'land',
      access: 'land_connection',
      viaIslandIds: ['a', 'b'],
      landConnectionIds: ['causeway'],
      landRouteIds: []
    });
  });

  it('finds shared airports through ordered recorded bus stops without inventing a bridge', () => {
    const data = snapshot();
    data.services.push(
      service('water', 'a', 'airport', 'Waterdrome'),
      service('airport:velana', 'b', 'airport', 'Velana International Airport')
    );
    data.routes.push(route('to-via'));
    data.routeStops.push(
      { routeId: 'to-via', stopId: 'hm', islandId: 'a', sequence: 0 },
      { routeId: 'to-via', stopId: 'via', islandId: 'b', sequence: 1 }
    );
    expect(createConnectionEndpointResolver(data).resolve('a', 'air')).toMatchObject({
      id: 'airport:velana',
      airportKind: 'land',
      viaIslandIds: ['a', 'b'],
      landConnectionIds: [],
      landRouteIds: ['to-via']
    });
  });

  it('respects directed and ineligible land links and never treats ferry access as airport land access', () => {
    const data = snapshot();
    data.services.push(service('airport:a', 'a', 'airport', 'Airport'));
    data.connections.push(
      connection('forward', 'a', 'b', 'bridge', 'forward'),
      { ...connection('disabled', 'b', 'a'), scoreEligible: false },
      connection('marine', 'b', 'a', 'ferry')
    );
    expect(createConnectionEndpointResolver(data).resolve('b', 'air')).toBeNull();
  });

  it('keeps mapped seaplane access as a fallback and excludes helipads from airplane endpoints', () => {
    const data = snapshot();
    data.services.push(
      service('seaplane', 'a', 'airport', 'Amilla floating air terminal'),
      service('heli', 'b', 'helipad', 'Hospital Helipad'),
      service('landing', 'c', 'airport', 'Landing Dhiggiri')
    );
    const resolver = createConnectionEndpointResolver(data);
    expect(resolver.resolve('a', 'air')).toMatchObject({
      id: 'seaplane',
      airportKind: 'seaplane',
      access: 'local',
      islandId: 'a'
    });
    expect(resolver.resolve('b', 'air')).toBeNull();
    expect(resolver.resolve('c', 'air')).toMatchObject({ id: 'landing', airportKind: 'terminal' });
  });

  it('uses a real nearby incident ferry geometry end only when no mapped marine terminal exists', () => {
    const data = snapshot();
    data.connections.push({
      ...connection('ferry', 'a', 'b', 'ferry'),
      routeId: 'ferry-route',
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73.001, 3.001],
          [73.1, 3.1]
        ]
      })
    });
    const result = createConnectionEndpointResolver(data).resolve('a', 'ferry', 'ferry-route');
    expect(result).toMatchObject({
      source: 'route_endpoint',
      terminalVerified: false,
      routeMatched: true,
      coordinates: [73.001, 3.001],
      name: 'Selected mapped ferry access',
      islandId: 'a'
    });
    expect(createConnectionEndpointResolver(data).resolve('c', 'ferry')).toBeNull();
  });

  it('rejects geometry ends outside the island threshold or closer to a different recorded island', () => {
    const data = snapshot();
    data.islands[1].longitude = 73.002;
    data.islands[1].latitude = 3;
    data.connections.push({
      ...connection('ferry', 'a', 'b', 'ferry'),
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73.0019, 3],
          [73.5, 4]
        ]
      })
    });
    expect(createConnectionEndpointResolver(data).resolve('a', 'ferry')).toBeNull();
  });

  it('never relabels modeled centroid lines or an exact island center as mapped ferry access', () => {
    const modeled = snapshot();
    modeled.connections.push({
      ...connection('modeled-ferry', 'a', 'b', 'ferry'),
      modeled: true,
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73.001, 3.001],
          [73.1, 3.1]
        ]
      })
    });
    expect(createConnectionEndpointResolver(modeled).resolve('a', 'ferry')).toBeNull();
    const centered = snapshot();
    centered.connections.push({
      ...connection('center-ferry', 'a', 'b', 'ferry'),
      geoJson: JSON.stringify({
        type: 'LineString',
        coordinates: [
          [73, 3],
          [73.1, 3.1]
        ]
      })
    });
    expect(createConnectionEndpointResolver(centered).resolve('a', 'ferry')).toBeNull();
  });

  it('caches its snapshot indexes, preserves input records and returns caller-safe point/path arrays', () => {
    const data = snapshot();
    data.services.push(
      service('z-terminal', 'a', 'port', 'Ferry Terminal'),
      service('a-terminal', 'a', 'port', 'Ferry Terminal')
    );
    const before = JSON.stringify(data);
    const resolver = createConnectionEndpointResolver(data);
    expect(createConnectionEndpointResolver(data)).toBe(resolver);
    const result = resolver.resolve('a', 'ferry')!;
    expect(result.id).toBe('a-terminal');
    result.coordinates[0] = 0;
    result.viaIslandIds.push('changed');
    expect(resolver.resolve('a', 'ferry')).toMatchObject({ coordinates: [73.001, 3.001], viaIslandIds: ['a'] });
    expect(JSON.stringify(data)).toBe(before);
    const reversed = { ...data, services: [...data.services].reverse() };
    expect(createConnectionEndpointResolver(reversed).resolve('a', 'ferry')).toEqual(resolver.resolve('a', 'ferry'));
  });
});
