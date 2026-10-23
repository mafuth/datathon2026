import type { ConnectionNetworkSource } from './connection-network';
import type { ScoringSnapshot } from '$lib/server/scoring/types';

import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { buildTransportInfrastructure, resolveConnectionStopPair } from '$lib/server/scoring/transport-demand';

let connectionNetworkSourceCache: ConnectionNetworkSource | null = null;
let connectionNetworkSourceRequest: Promise<ConnectionNetworkSource> | null = null;

function networkConnections(snapshot: ScoringSnapshot): ConnectionNetworkSource['connections'] {
  const busRoutes = new Set(
    snapshot.routeStops.filter((call) => call.routeId.startsWith('rtl:bus:')).map((call) => call.routeId)
  );
  const busLegs: ConnectionNetworkSource['connections'] = [];
  for (const routeId of busRoutes) {
    const calls = snapshot.routeStops
      .filter((call) => call.routeId === routeId)
      .sort((a, b) => a.sequence - b.sequence);
    for (let index = 1; index < calls.length; index += 1) {
      const from = calls[index - 1];
      const to = calls[index];
      if (to.sequence !== from.sequence + 1 || from.stopId === to.stopId) continue;
      busLegs.push({
        id: `${routeId}:leg:${to.sequence}`,
        routeId,
        sequence: to.sequence,
        fromIslandId: from.islandId,
        toIslandId: to.islandId,
        connectionType: 'bus',
        directionality: 'forward',
        distanceM: null,
        source: 'RTL',
        sourceObjectId: `${routeId}:calls:${from.sequence}-${to.sequence}`,
        modeled: false,
        scoreEligible: snapshot.connections.some((link) => link.routeId === routeId && link.scoreEligible),
        terminals: {
          fromStopId: from.stopId,
          toStopId: to.stopId,
          fromTerminalEvidence: 'Ordered RTL bus route-stop record',
          toTerminalEvidence: 'Ordered RTL bus route-stop record'
        }
      });
    }
  }
  const base = snapshot.connections.filter(
    (link) => link.connectionType !== 'bus' || !link.routeId || !busRoutes.has(link.routeId)
  );
  // Ferry schedules are normalized into the scoring snapshot. Keeping this
  // source free of a second parser guarantees that scoring, API output, and
  // client pathfinding consume identical adjacent route legs.
  return [...base, ...busLegs];
}

async function loadConnectionNetworkSourceUncached(): Promise<ConnectionNetworkSource> {
  const snapshot = await loadScoringSnapshot();
  const connections = networkConnections(snapshot);
  const stops = buildTransportInfrastructure(snapshot);
  const destinations = new Map<string, Set<string>>();
  const addDestination = (stopId: string, islandId: string): void => {
    const ids = destinations.get(stopId) ?? new Set<string>();
    ids.add(islandId);
    destinations.set(stopId, ids);
  };
  for (const connection of connections) {
    const pair = connection.terminals ?? resolveConnectionStopPair(connection, snapshot.routeStops, stops);
    if (!pair) continue;
    addDestination(pair.fromStopId, connection.toIslandId);
    if (connection.directionality === 'bidirectional') addDestination(pair.toStopId, connection.fromIslandId);
  }

  return {
    islands: snapshot.islands.map((island) => ({ ...island, atollName: island.atollName ?? 'Unknown atoll' })),
    connections,
    routes: snapshot.routes,
    routeStops: snapshot.routeStops ?? [],
    stops: stops.map((stop) => ({
      ...stop,
      connectedIslandIds: [...(destinations.get(stop.id) ?? [])].filter((id) => id !== stop.islandId).sort()
    }))
  };
}

export function loadConnectionNetworkSource(): Promise<ConnectionNetworkSource> {
  if (connectionNetworkSourceCache) return Promise.resolve(connectionNetworkSourceCache);
  if (connectionNetworkSourceRequest) return connectionNetworkSourceRequest;

  const request = loadConnectionNetworkSourceUncached();
  connectionNetworkSourceRequest = request;
  void request.then(
    (source) => {
      if (connectionNetworkSourceRequest !== request) return;
      connectionNetworkSourceRequest = null;
      connectionNetworkSourceCache = source;
    },
    () => {
      if (connectionNetworkSourceRequest === request) connectionNetworkSourceRequest = null;
    }
  );
  return request;
}

export function clearConnectionNetworkSourceCache(): void {
  connectionNetworkSourceCache = null;
  connectionNetworkSourceRequest = null;
}
