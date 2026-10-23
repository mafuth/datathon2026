import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';
import type { TransportRouteStop } from '$lib/server/scoring/types';
import type { TransportConnection, TransportRoute } from '$models';

import { resolveConnectionStopPair } from '$lib/server/scoring/transport-demand';

export type ConnectionNetworkSource = {
  islands: Array<{
    id: string;
    name: string;
    atollName: string;
    islandType: string;
    longitude: number;
    latitude: number;
  }>;
  connections: Array<
    Pick<
      TransportConnection,
      | 'id'
      | 'routeId'
      | 'sequence'
      | 'fromIslandId'
      | 'toIslandId'
      | 'connectionType'
      | 'directionality'
      | 'distanceM'
      | 'source'
      | 'sourceObjectId'
      | 'modeled'
      | 'scoreEligible'
    > & {
      tripId?: string;
      terminals?: NonNullable<ReturnType<typeof resolveConnectionStopPair>>;
    }
  >;
  routes: Array<Pick<TransportRoute, 'id' | 'name' | 'routeType'>>;
  stops: ConnectionNetworkResponse['stops'];
  routeStops: TransportRouteStop[];
};

export function buildConnectionNetwork(
  source: ConnectionNetworkSource
): Omit<ConnectionNetworkResponse, 'baselineVersion'> {
  const islandIds = new Set(source.islands.map((island) => island.id));
  const connections = source.connections.filter(
    (link) => islandIds.has(link.fromIslandId) && islandIds.has(link.toIslandId)
  );
  const stops = source.stops.filter((stop) => islandIds.has(stop.islandId));
  const networkIslandIds = new Set([
    ...connections.flatMap((link) => [link.fromIslandId, link.toIslandId]),
    ...stops.map((stop) => stop.islandId)
  ]);
  const networkIslands = source.islands.filter(
    (island) => island.islandType === 'inhabited' || networkIslandIds.has(island.id)
  );
  const routesById = new Map(source.routes.map((route) => [route.id, route]));

  return {
    status: 'partial',
    islandDirectory: source.islands
      .map((island) => ({
        id: island.id,
        name: island.name,
        atollName: island.atollName ?? 'Unknown atoll',
        islandType: island.islandType,
        centroid: [island.longitude, island.latitude] as [number, number]
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    stops,
    islands: networkIslands
      .map((island) => ({
        id: island.id,
        name: island.name,
        atollName: island.atollName ?? 'Unknown atoll',
        islandType: island.islandType,
        centroid: [island.longitude, island.latitude] as [number, number]
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    connections: connections
      .filter(
        (connection) =>
          connection.source !== 'RTL' ||
          connection.connectionType !== 'ferry' ||
          connection.terminals !== undefined ||
          resolveConnectionStopPair(connection, source.routeStops, source.stops) !== null
      )
      .map((connection) => {
        const route = connection.routeId ? routesById.get(connection.routeId) : undefined;
        const mode =
          connection.connectionType === 'air'
            ? ('air' as const)
            : connection.connectionType === 'ferry'
              ? ('marine' as const)
              : ('land' as const);
        const pair = connection.terminals ?? resolveConnectionStopPair(connection, source.routeStops, source.stops);
        // Explicit schedule endpoints must satisfy the same ownership/mode rules
        // as resolved endpoints. Never turn a bad reference into a jetty link.
        const validTerminal = (id: string | undefined, islandId: string) =>
          source.stops.some(
            (stop) =>
              stop.id === id &&
              stop.islandId === islandId &&
              stop.mode === mode &&
              connection.routeId !== null &&
              stop.routeIds.includes(connection.routeId)
          );
        const fromValid = validTerminal(pair?.fromStopId, connection.fromIslandId);
        const toValid = validTerminal(pair?.toStopId, connection.toIslandId);
        return {
          id: connection.id,
          routeId: connection.routeId,
          sequence: connection.sequence,
          tripId: connection.tripId ?? null,
          mode,
          fromStopId: fromValid ? pair!.fromStopId : null,
          toStopId: toValid ? pair!.toStopId : null,
          fromTerminalEvidence: ['bridge', 'causeway', 'land_link'].includes(connection.connectionType)
            ? 'Island-level land infrastructure; no departure terminal required'
            : fromValid
              ? pair!.fromTerminalEvidence
              : 'Terminal unresolved: no matching owned, mode-compatible route call',
          toTerminalEvidence: ['bridge', 'causeway', 'land_link'].includes(connection.connectionType)
            ? 'Island-level land infrastructure; no arrival terminal required'
            : toValid
              ? pair!.toTerminalEvidence
              : 'Terminal unresolved: no matching owned, mode-compatible route call',
          fromIslandId: connection.fromIslandId,
          toIslandId: connection.toIslandId,
          connectionType: connection.connectionType,
          routeType: route?.routeType ?? connection.connectionType,
          directionality: connection.directionality,
          distanceM: connection.distanceM,
          routeName: route?.name ?? null,
          source: connection.source,
          sourceObjectId: connection.sourceObjectId,
          modeled: connection.modeled,
          scoreEligible:
            connection.source === 'RTL' && connection.connectionType === 'ferry' ? true : connection.scoreEligible
        };
      })
      .sort(
        (left, right) =>
          (left.routeId ?? '').localeCompare(right.routeId ?? '') ||
          (left.tripId ?? '').localeCompare(right.tripId ?? '') ||
          (left.sequence ?? 0) - (right.sequence ?? 0) ||
          left.id.localeCompare(right.id)
      ),
    limitations: [
      'Mapped transfer islands are retained regardless of island type. Missing links are not inferred.',
      'Land links include consecutive island-polygon crossings of packaged OSM highways and RTL roadshapes; disconnected geometry parts are never joined. Land infrastructure does not require bus stops.',
      'Stop endpoints require matching ordered route calls; otherwise links remain island-level with unresolved terminals.',
      'RTL schedule legs preserve recorded call order and direction. Missing or ambiguous calls remain gaps; snapshots are not live departures.',
      'Physical RTL ferry terminals require a unique exact shared OSM route endpoint and terminal geometry with the same route code; proximity is not used.',
      'Air links may be modeled; this is connectivity evidence, not a flight schedule.',
      'Historical modeled airport-gateway links require ground-airport evidence; waterdromes and unclassified landing areas do not establish domestic air service.',
      'The graph represents logical island connectivity; geographic route geometry remains on the map.'
    ],
    provenance: {
      source: 'current-mobility-database+packaged-source-topology',
      islands: 'island and atoll records',
      connections:
        'transport_connection, transport_route, normalized ferry route calls, and source-backed OSM/RTL road geometry polygon crossings'
    }
  };
}
