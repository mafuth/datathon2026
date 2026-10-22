import type { ScoringSnapshot } from './types';

export type ConnectionEndpoint = {
  id: string;
  name: string | null;
  islandId: string;
  coordinates: [number, number];
  subtype: string;
  source: 'service' | 'transport_stop' | 'route_stop' | 'route_endpoint';
  routeMatched: boolean;
  terminalVerified: boolean;
  airportKind: 'land' | 'seaplane' | 'terminal' | null;
  requestedIslandId: string;
  access: 'local' | 'land_connection';
  viaIslandIds: string[];
  landConnectionIds: string[];
  landRouteIds: string[];
};

export type ConnectionEndpointResolver = {
  resolve(
    islandId: string,
    mode: 'ferry' | 'air',
    routeId?: string | null,
    target?: [number, number] | null
  ): ConnectionEndpoint | null;
};

type Candidate = {
  id: string;
  name: string | null;
  islandId: string;
  coordinates: [number, number];
  subtype: string;
  source: 'service' | 'transport_stop' | 'route_endpoint';
  routeIds: Set<string>;
};
type LandEdge = { to: string; connectionId: string | null; routeId: string | null };
type LandPath = { islandId: string; islands: string[]; connections: string[]; routes: string[] };

const resolvers = new WeakMap<ScoringSnapshot, ConnectionEndpointResolver>();
const marineTypes = new Set(['port', 'jetty', 'ferry_terminal', 'ferry_stop']);
const airTypes = new Set(['airport', 'air_terminal']);
const landTypes = new Set(['bridge', 'causeway', 'land_link', 'bus']);
const waterAirportName = /waterdrome|waterplane|sea[ -]?plane|seat plane|floating|water airport|\btma\b/i;
const nonRunwayAirportName = /\blanding\b|\bheli(?:pad|port|copter)\b|\bmilitary\b|air corps/i;

function coordinates(longitude: number | null, latitude: number | null): [number, number] | null {
  return typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
    ? [longitude, latitude]
    : null;
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const latitude = (b[1] - a[1]) * radians;
  const longitude = (b[0] - a[0]) * radians;
  const haversine =
    Math.sin(latitude / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

function marineRank(candidate: Candidate): number {
  const name = candidate.name ?? '';
  if (/cargo|container|industrial|commercial|fishing/i.test(name)) return 5;
  if (candidate.subtype === 'ferry_terminal' || /ferry.*terminal|passenger.*terminal|\b(?:rtl|mtcc)\b/i.test(name))
    return 0;
  if (/ferry/i.test(name)) return 1;
  if (/terminal/i.test(name)) return 2;
  return name.trim() ? 3 : 4;
}

function landAirport(candidate: Candidate): boolean {
  return (
    candidate.subtype === 'airport' &&
    !waterAirportName.test(candidate.name ?? '') &&
    !nonRunwayAirportName.test(candidate.name ?? '')
  );
}

function airRank(candidate: Candidate): number {
  if (candidate.id.startsWith('airport:')) return 0;
  if (candidate.subtype === 'airport') return 1;
  if (/airport|domestic|international|arrival|departure/i.test(candidate.name ?? '')) return 2;
  return 3;
}

function geometryEnds(value: unknown): [number, number][] {
  if (!value || typeof value !== 'object') return [];
  const shape = value as { type?: string; geometry?: unknown; features?: unknown[]; coordinates?: unknown[] };
  if (shape.type === 'Feature') return geometryEnds(shape.geometry);
  if (shape.type === 'FeatureCollection') return (shape.features ?? []).flatMap(geometryEnds);
  if (shape.type === 'MultiLineString')
    return (shape.coordinates ?? []).flatMap((line) => geometryEnds({ type: 'LineString', coordinates: line }));
  if (shape.type !== 'LineString' || !Array.isArray(shape.coordinates) || shape.coordinates.length < 2) return [];
  const points = shape.coordinates.map((point) => (Array.isArray(point) ? coordinates(point[0], point[1]) : null));
  return points.every((point) => point !== null) ? [points[0]!, points.at(-1)!] : [];
}

/** Source-backed transport access points. Snapshot records and ownership remain immutable. */
export function createConnectionEndpointResolver(snapshot: ScoringSnapshot): ConnectionEndpointResolver {
  const existing = resolvers.get(snapshot);
  if (existing) return existing;

  const islands = new Map(snapshot.islands.map((island) => [island.id, island]));
  const routes = new Map(snapshot.routes.map((route) => [route.id, route]));
  const byId = new Map<string, Candidate>();
  const byIsland = new Map<string, Candidate[]>();
  const add = (
    record: {
      id: string;
      name: string | null;
      islandId: string | null;
      subtype: string;
      longitude: number | null;
      latitude: number | null;
    },
    source: 'service' | 'transport_stop',
    routeIds: string[] = []
  ) => {
    if (!record.islandId || !islands.has(record.islandId)) return;
    if (!marineTypes.has(record.subtype) && !airTypes.has(record.subtype)) return;
    const point = coordinates(record.longitude, record.latitude);
    if (!point) return;
    const key = `${record.islandId}\0${record.id}`;
    const previous = byId.get(key);
    if (previous) {
      for (const routeId of routeIds) previous.routeIds.add(routeId);
      if (source === 'transport_stop') {
        previous.source = source;
        previous.coordinates = point;
        previous.name = record.name ?? previous.name;
      }
      return;
    }
    const candidate: Candidate = {
      id: record.id,
      name: record.name,
      islandId: record.islandId,
      coordinates: point,
      subtype: record.subtype,
      source,
      routeIds: new Set(routeIds)
    };
    byId.set(key, candidate);
    const group = byIsland.get(record.islandId) ?? [];
    group.push(candidate);
    byIsland.set(record.islandId, group);
  };
  for (const service of snapshot.services) if (service.serviceType === 'transport') add(service, 'service');
  for (const stop of snapshot.transportStops) add(stop, 'transport_stop', stop.routeIds);
  for (const stop of snapshot.routeStops) byId.get(`${stop.islandId}\0${stop.stopId}`)?.routeIds.add(stop.routeId);

  // Marine imports sometimes preserve an exact OSM stop ID in the route's source object.
  const osmCandidates = new Map<string, Candidate[]>();
  for (const candidate of byId.values()) {
    const group = osmCandidates.get(candidate.id) ?? [];
    group.push(candidate);
    osmCandidates.set(candidate.id, group);
  }
  for (const connection of snapshot.connections) {
    if (!connection.routeId) continue;
    const sourceIds = connection.sourceObjectId.match(/osm:(?:node|way|relation):\d+/g) ?? [];
    for (const sourceId of sourceIds)
      for (const candidate of osmCandidates.get(sourceId) ?? [])
        if (candidate.islandId === connection.fromIslandId || candidate.islandId === connection.toIslandId)
          candidate.routeIds.add(connection.routeId);
  }

  // Recorded sailing ends identify the correct landing place even when its OSM
  // marker is unnamed (for example the western Malé–Vilimale terminal).
  // A generic named terminal on the other coast must not win over that evidence.
  for (const connection of snapshot.connections) {
    if (connection.connectionType !== 'ferry' || !connection.routeId) continue;
    const route = routes.get(connection.routeId);
    for (const json of [connection.geoJson, route?.geoJson]) {
      if (!json) continue;
      let ends: [number, number][];
      try {
        ends = geometryEnds(JSON.parse(json));
      } catch {
        continue;
      }
      for (const islandId of [connection.fromIslandId, connection.toIslandId]) {
        const island = islands.get(islandId);
        const center = island && coordinates(island.longitude, island.latitude);
        const candidates = (byIsland.get(islandId) ?? []).filter((candidate) => marineTypes.has(candidate.subtype));
        if (!center || !candidates.length || !ends.length) continue;
        const endpoint = ends.toSorted((a, b) => distanceKm(a, center) - distanceKm(b, center))[0];
        // Center-based schematic shapes are not terminal evidence.
        if (distanceKm(endpoint, center) < 0.001) continue;
        const nearest = candidates.toSorted(
          (a, b) =>
            distanceKm(a.coordinates, endpoint) - distanceKm(b.coordinates, endpoint) || a.id.localeCompare(b.id)
        )[0];
        if (distanceKm(nearest.coordinates, endpoint) <= 0.25) nearest.routeIds.add(connection.routeId);
      }
    }
  }

  const land = new Map<string, LandEdge[]>();
  const addLand = (from: string, to: string, connectionId: string | null, routeId: string | null) => {
    if (from === to || !islands.has(from) || !islands.has(to)) return;
    const edges = land.get(from) ?? [];
    if (!edges.some((edge) => edge.to === to && edge.connectionId === connectionId && edge.routeId === routeId))
      edges.push({ to, connectionId, routeId });
    land.set(from, edges);
  };
  for (const connection of snapshot.connections) {
    if (connection.scoreEligible === false || !landTypes.has(connection.connectionType)) continue;
    addLand(connection.fromIslandId, connection.toIslandId, connection.id, connection.routeId);
    if (connection.directionality === 'bidirectional')
      addLand(connection.toIslandId, connection.fromIslandId, connection.id, connection.routeId);
  }
  const orderedBusStops = new Map<string, ScoringSnapshot['routeStops']>();
  for (const stop of snapshot.routeStops) {
    if (routes.get(stop.routeId)?.routeType !== 'bus' || !islands.has(stop.islandId)) continue;
    const stops = orderedBusStops.get(stop.routeId) ?? [];
    stops.push(stop);
    orderedBusStops.set(stop.routeId, stops);
  }
  for (const [routeId, stops] of orderedBusStops) {
    stops.sort((a, b) => a.sequence - b.sequence || a.stopId.localeCompare(b.stopId));
    for (let index = 1; index < stops.length; index++)
      addLand(stops[index - 1].islandId, stops[index].islandId, null, routeId);
  }
  for (const edges of land.values())
    edges.sort(
      (a, b) =>
        a.to.localeCompare(b.to) ||
        (a.connectionId ?? '').localeCompare(b.connectionId ?? '') ||
        (a.routeId ?? '').localeCompare(b.routeId ?? '')
    );

  const landPaths = new Map<string, LandPath[]>();
  const reachable = (islandId: string): LandPath[] => {
    const cached = landPaths.get(islandId);
    if (cached) return cached;
    const visited = new Set([islandId]);
    const paths: LandPath[] = [{ islandId, islands: [islandId], connections: [], routes: [] }];
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      for (const edge of land.get(path.islandId) ?? []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        paths.push({
          islandId: edge.to,
          islands: [...path.islands, edge.to],
          connections: edge.connectionId ? [...path.connections, edge.connectionId] : path.connections,
          routes: edge.routeId ? [...path.routes, edge.routeId] : path.routes
        });
      }
    }
    landPaths.set(islandId, paths);
    return paths;
  };

  const landAirports = new Map<string, Candidate[]>();
  const otherAirports = new Map<string, Candidate[]>();
  for (const [islandId, candidates] of byIsland) {
    const air = candidates.filter(
      (candidate) => airTypes.has(candidate.subtype) && !/\bheli(?:pad|port|copter)\b/i.test(candidate.name ?? '')
    );
    const hasLandAirport = air.some(landAirport);
    landAirports.set(
      islandId,
      hasLandAirport
        ? air.filter(
            (candidate) =>
              landAirport(candidate) ||
              (candidate.subtype === 'air_terminal' && !waterAirportName.test(candidate.name ?? ''))
          )
        : []
    );
    otherAirports.set(islandId, air);
  }

  const ferryFallbacks = new Map<string, Candidate[]>();
  const mappedFerryEnds = (islandId: string): Candidate[] => {
    const cached = ferryFallbacks.get(islandId);
    if (cached) return cached;
    const island = islands.get(islandId)!;
    const center = coordinates(island.longitude, island.latitude);
    const candidates: Candidate[] = [];
    if (center)
      for (const connection of snapshot.connections) {
        if (
          connection.connectionType !== 'ferry' ||
          (connection.fromIslandId !== islandId && connection.toIslandId !== islandId)
        )
          continue;
        const route = connection.routeId ? routes.get(connection.routeId) : undefined;
        for (const shape of [
          { id: connection.id, json: connection.geoJson, modeled: connection.modeled },
          ...(route ? [{ id: route.id, json: route.geoJson, modeled: route.modeled }] : [])
        ]) {
          if (!shape.json || shape.modeled) continue;
          let ends: [number, number][];
          try {
            ends = geometryEnds(JSON.parse(shape.json));
          } catch {
            continue;
          }
          ends.forEach((point, index) => {
            const distance = distanceKm(center, point);
            if (distance === 0 || distance > 0.75) return;
            // Offshore route ends may be valid access evidence, but never borrow another island's point.
            for (const other of snapshot.islands) {
              if (other.id === islandId) continue;
              const otherCenter = coordinates(other.longitude, other.latitude);
              if (otherCenter && distanceKm(otherCenter, point) < distance) return;
            }
            candidates.push({
              id: `route-endpoint:${shape.id}:${index}`,
              name: `${island.name} mapped ferry access`,
              islandId,
              coordinates: point,
              subtype: 'mapped_ferry_access',
              source: 'route_endpoint',
              routeIds: new Set(connection.routeId ? [connection.routeId] : [])
            });
          });
        }
      }
    ferryFallbacks.set(islandId, candidates);
    return candidates;
  };

  const resolver: ConnectionEndpointResolver = {
    resolve(islandId, mode, routeId = null, target = null) {
      if (!islands.has(islandId)) return null;
      const targetPoint = target ? coordinates(target[0], target[1]) : null;
      const choose = (candidates: Candidate[], rank: (candidate: Candidate) => number): Candidate | null => {
        let best: Candidate | null = null;
        const comparison = (a: Candidate, b: Candidate) =>
          Number(Boolean(routeId && b.routeIds.has(routeId))) - Number(Boolean(routeId && a.routeIds.has(routeId))) ||
          rank(a) - rank(b) ||
          (targetPoint ? distanceKm(a.coordinates, targetPoint) - distanceKm(b.coordinates, targetPoint) : 0) ||
          a.id.localeCompare(b.id);
        for (const candidate of candidates) if (!best || comparison(candidate, best) < 0) best = candidate;
        return best;
      };
      let candidate: Candidate | null;
      let path: LandPath = { islandId, islands: [islandId], connections: [], routes: [] };
      let airportKind: ConnectionEndpoint['airportKind'] = null;
      if (mode === 'ferry') {
        const marine = (byIsland.get(islandId) ?? []).filter((entry) => marineTypes.has(entry.subtype));
        candidate = choose(marine.length ? marine : mappedFerryEnds(islandId), marineRank);
      } else {
        candidate = choose(landAirports.get(islandId) ?? [], airRank);
        if (!candidate) {
          let nearestHops = Number.POSITIVE_INFINITY;
          for (const possiblePath of reachable(islandId).slice(1)) {
            if (possiblePath.islands.length > nearestHops) break;
            const possible = choose(landAirports.get(possiblePath.islandId) ?? [], airRank);
            if (!possible) continue;
            if (!candidate || choose([candidate, possible], airRank) === possible) {
              candidate = possible;
              path = possiblePath;
              nearestHops = possiblePath.islands.length;
            }
          }
        }
        if (candidate) airportKind = 'land';
        else {
          candidate = choose(otherAirports.get(islandId) ?? [], airRank);
          if (candidate) airportKind = waterAirportName.test(candidate.name ?? '') ? 'seaplane' : 'terminal';
        }
      }
      if (!candidate) return null;
      const routeMatched = Boolean(routeId && candidate.routeIds.has(routeId));
      return {
        id: candidate.id,
        name: candidate.name,
        islandId: candidate.islandId,
        coordinates: [...candidate.coordinates],
        subtype: candidate.subtype,
        source:
          candidate.source === 'route_endpoint' ? 'route_endpoint' : routeMatched ? 'route_stop' : candidate.source,
        routeMatched,
        terminalVerified: candidate.source !== 'route_endpoint',
        airportKind,
        requestedIslandId: islandId,
        access: candidate.islandId === islandId ? 'local' : 'land_connection',
        viaIslandIds: [...path.islands],
        landConnectionIds: [...new Set(path.connections)],
        landRouteIds: [...new Set(path.routes)]
      };
    }
  };
  resolvers.set(snapshot, resolver);
  return resolver;
}
