import type { InboundDemandSource, ScoringSnapshot } from './types';
import type {
  ConnectionCoordinate,
  IslandConnectionMode,
  IslandConnectionRouteProperties,
  IslandConnectionRoutes,
  IslandConnectionsResponse,
  IslandInboundFlows
} from '$lib/mobility/island-connections';
import type { Island, TransportRoute } from '$models';

import { transportDistanceKm } from '$lib/mobility/proposal-transport';

import { createConnectionEndpointResolver } from './connection-endpoints';
import { loadScoringSnapshot } from './database-input';
import { getIslandScore } from './island-score';
import { createMarineRouter } from './marine-routing';
import { indexedIslands } from './snapshot-index';

export class IslandConnectionsNotFoundError extends Error {
  constructor(islandId: string) {
    super(`Island ${islandId} was not found.`);
    this.name = 'IslandConnectionsNotFoundError';
  }
}

function coordinate(value: unknown): value is ConnectionCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function rounded(point: ConnectionCoordinate): ConnectionCoordinate {
  return [Number(point[0].toFixed(6)), Number(point[1].toFixed(6))];
}

function islandCenter(island: Island | undefined): ConnectionCoordinate | null {
  const point = island ? [island.longitude, island.latitude] : null;
  return coordinate(point) ? rounded(point) : null;
}

function routeLines(value: unknown): ConnectionCoordinate[][] {
  if (!value || typeof value !== 'object') return [];
  const geometry = value as { type?: unknown; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
  if (geometry.type === 'Feature') return routeLines(geometry.geometry);
  if (geometry.type === 'FeatureCollection' && Array.isArray(geometry.features))
    return geometry.features.flatMap(routeLines);
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates))
    return geometry.coordinates.flatMap((line) => routeLines({ type: 'LineString', coordinates: line }));
  if (geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || !geometry.coordinates.every(coordinate))
    return [];
  const points = (geometry.coordinates as ConnectionCoordinate[])
    .map(rounded)
    .filter((point, index, all) => index === 0 || point[0] !== all[index - 1][0] || point[1] !== all[index - 1][1]);
  return points.length >= 2 ? [points] : [];
}

function parsedLines(json: string | null | undefined): ConnectionCoordinate[][] {
  if (!json) return [];
  try {
    return routeLines(JSON.parse(json));
  } catch {
    return [];
  }
}

function geometryKey(lines: ConnectionCoordinate[][]): string {
  return lines
    .map((line) => {
      const forward = JSON.stringify(line);
      const reverse = JSON.stringify([...line].reverse());
      return forward < reverse ? forward : reverse;
    })
    .sort()
    .join('|');
}

function modeFor(type: string): IslandConnectionMode {
  if (type === 'bus' || type === 'ferry' || type === 'air') return type;
  return 'land';
}

function fitsIslandPair(
  lines: ConnectionCoordinate[][],
  from: ConnectionCoordinate | null,
  to: ConnectionCoordinate | null
): boolean {
  if (!from || !to || !lines.length) return false;
  // A whole multi-island route is not an individual island-to-island segment.
  // Only reuse route shapes whose ends match this connection in either direction.
  const start = lines[0][0];
  const end = lines.at(-1)!.at(-1)!;
  const near = (a: ConnectionCoordinate, b: ConnectionCoordinate) => transportDistanceKm(a, b) <= 5;
  return (near(start, from) && near(end, to)) || (near(start, to) && near(end, from));
}

function nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Deterministic baseline geometry; demand links describe allocations, not a traveled itinerary. */
export function buildIslandConnections(
  snapshot: ScoringSnapshot,
  islandId: string,
  inboundSources: readonly (InboundDemandSource & { originName?: string })[]
): IslandConnectionsResponse {
  const islands = indexedIslands(snapshot);
  const island = islands.get(islandId);
  if (!island) throw new IslandConnectionsNotFoundError(islandId);
  const center = islandCenter(island);
  const routes: IslandConnectionRoutes = { type: 'FeatureCollection', features: [] };
  const inbound: IslandInboundFlows = { type: 'FeatureCollection', features: [] };
  const routeById = new Map(snapshot.routes.map((route) => [route.id, route]));
  const endpoints = createConnectionEndpointResolver(snapshot);
  const airportAccess = endpoints.resolve(islandId, 'air');
  const sharedAirportIslandId = airportAccess && airportAccess.islandId !== islandId ? airportAccess.islandId : null;
  // The land index and routed pairs are shared by this immutable snapshot.
  const marine = createMarineRouter(snapshot);
  const servingRouteIds = new Set([
    ...snapshot.routeStops.filter((stop) => stop.islandId === islandId).map((stop) => stop.routeId),
    ...snapshot.transportStops.filter((stop) => stop.islandId === islandId).flatMap((stop) => stop.routeIds),
    ...snapshot.connections
      .filter((link) => link.fromIslandId === islandId || link.toIslandId === islandId)
      .flatMap((link) => (link.routeId ? [link.routeId] : []))
  ]);
  const seenBusShapes = new Set<string>();
  const drawnBusRouteIds = new Set<string>();
  const shapeCache = new Map<TransportRoute, ConnectionCoordinate[][]>();
  const routeGeometry = (route: TransportRoute) => {
    let lines = shapeCache.get(route);
    if (!lines) shapeCache.set(route, (lines = parsedLines(route.geoJson)));
    return lines;
  };
  for (const route of snapshot.routes) {
    if (route.routeType !== 'bus' || !servingRouteIds.has(route.id)) continue;
    const lines = routeGeometry(route);
    if (!lines.length) continue;
    drawnBusRouteIds.add(route.id);
    const key = geometryKey(lines);
    if (seenBusShapes.has(key)) continue;
    seenBusShapes.add(key);
    routes.features.push({
      type: 'Feature',
      id: `route:${route.id}`,
      geometry: { type: 'MultiLineString', coordinates: lines },
      properties: {
        id: `route:${route.id}`,
        label: route.name || 'Bus route',
        mode: 'bus',
        neighborId: null,
        neighborName: null,
        schematic: route.modeled,
        modeled: route.modeled,
        source: route.source
      }
    });
  }

  const directByKey = new Map<string, IslandConnectionRoutes['features'][number]>();
  let unmappedRoutes = 0;
  for (const connection of snapshot.connections) {
    const local = connection.fromIslandId === islandId || connection.toIslandId === islandId;
    const sharedFlight =
      connection.connectionType === 'air' &&
      sharedAirportIslandId &&
      (connection.fromIslandId === sharedAirportIslandId || connection.toIslandId === sharedAirportIslandId);
    if (!local && !sharedFlight) continue;
    if (connection.connectionType === 'bus' && connection.routeId && drawnBusRouteIds.has(connection.routeId)) continue;
    const departureIslandId = local ? islandId : sharedAirportIslandId!;
    const neighborId = connection.fromIslandId === departureIslandId ? connection.toIslandId : connection.fromIslandId;
    if (neighborId === islandId) continue;
    const neighbor = islands.get(neighborId);
    const neighborCenter = islandCenter(neighbor);
    const route = connection.routeId ? routeById.get(connection.routeId) : undefined;
    const mode = modeFor(connection.connectionType);
    let lines = parsedLines(connection.geoJson);
    let schematic = connection.modeled;
    let source = connection.source;
    let endpointProperties: Partial<IslandConnectionRouteProperties> = {};
    if (!lines.length && route) {
      const candidates = routeGeometry(route);
      if (fitsIslandPair(candidates, center, neighborCenter)) {
        lines = candidates;
        schematic ||= route.modeled;
        source = route.source;
      }
    }
    if (mode === 'ferry' || mode === 'air') {
      const departure = endpoints.resolve(islandId, mode, connection.routeId, neighborCenter);
      const arrival = endpoints.resolve(neighborId, mode, connection.routeId, center ?? departure?.coordinates ?? null);
      if (!departure || !arrival) {
        unmappedRoutes++;
        continue;
      }
      endpointProperties = {
        departureName: departure.name || `${island.name} ${mode === 'air' ? 'airport' : 'ferry access'}`,
        arrivalName: arrival.name || `${neighbor?.name ?? 'Neighbor'} ${mode === 'air' ? 'airport' : 'ferry access'}`,
        departureIslandId: departure.islandId,
        arrivalIslandId: arrival.islandId,
        terminalVerified: departure.terminalVerified && arrival.terminalVerified
      };
      if (mode === 'air') {
        // A gateway access link can resolve to the same shared airport on both
        // sides. Its flights are shown above; do not draw a fictitious zero flight.
        if (transportDistanceKm(departure.coordinates, arrival.coordinates) < 0.01) continue;
        lines = [[departure.coordinates, arrival.coordinates]];
        schematic = true;
        endpointProperties.geometryBasis = 'airport-link';
      } else {
        const startAccess = marine.resolveEndpoint(departure.coordinates);
        const endAccess = marine.resolveEndpoint(arrival.coordinates);
        if (!startAccess || !endAccess) {
          unmappedRoutes++;
          continue;
        }
        const start = startAccess.shoreline;
        const end = endAccess.shoreline;
        // Re-anchor a usable recorded itinerary, retaining its sailing waypoints.
        // Reject a whole multi-island route, disconnected parts or any land crossing.
        let recorded: ConnectionCoordinate[] | null = null;
        if (lines.length === 1 && fitsIslandPair(lines, departure.coordinates, arrival.coordinates)) {
          const line = lines[0];
          const oriented =
            transportDistanceKm(line[0], departure.coordinates) <=
            transportDistanceKm(line.at(-1)!, departure.coordinates)
              ? line
              : [...line].reverse();
          const anchored = [start, ...oriented.slice(1, -1), end];
          if ((!connection.modeled || oriented.length > 2) && marine.isWaterPath(anchored)) recorded = anchored;
        }
        const waterPath = recorded ?? marine.route(departure.coordinates, arrival.coordinates);
        if (!waterPath) {
          unmappedRoutes++;
          continue;
        }
        lines = [waterPath];
        schematic = !recorded || schematic;
        endpointProperties.geometryBasis = recorded ? 'recorded-water-path' : 'coast-aware-water-path';
        endpointProperties.shorelineAdjusted = startAccess.snapped || endAccess.snapped;
      }
    } else if (!lines.length && mode === 'land' && center && neighborCenter) {
      lines = [[center, neighborCenter]];
      schematic = true;
    }
    if (!lines.length) {
      unmappedRoutes++;
      continue;
    }
    // A pair can have several recorded bridges without route IDs. Keep their
    // distinct shapes while collapsing reverse copies and repeated fallbacks.
    const routeKey = connection.routeId ?? `shape:${geometryKey(lines)}`;
    const key = `${connection.connectionType}:${neighborId}:${routeKey}`;
    const feature: IslandConnectionRoutes['features'][number] = {
      type: 'Feature',
      id: `connection:${connection.id}`,
      geometry: { type: 'MultiLineString', coordinates: lines },
      properties: {
        id: `connection:${connection.id}`,
        label: route?.name || `${mode === 'land' ? 'Land' : mode[0].toUpperCase() + mode.slice(1)} connection`,
        mode,
        neighborId,
        neighborName: neighbor?.name ?? null,
        schematic,
        modeled: connection.modeled || Boolean(route?.modeled),
        source,
        ...endpointProperties
      }
    };
    const previous = directByKey.get(key);
    const recordedWaterPath = feature.properties.geometryBasis === 'recorded-water-path';
    const previousRecordedWaterPath = previous?.properties.geometryBasis === 'recorded-water-path';
    if (
      !previous ||
      (previous.properties.schematic && !feature.properties.schematic) ||
      (recordedWaterPath && !previousRecordedWaterPath)
    )
      directByKey.set(key, feature);
  }
  routes.features.push(...directByKey.values());
  routes.features.sort((a, b) => a.id.localeCompare(b.id));

  const sourcesById = new Map<string, { originName?: string; health: number; education: number; total: number }>();
  for (const source of inboundSources) {
    if (source.originIslandId === islandId) continue;
    const value = sourcesById.get(source.originIslandId) ?? { health: 0, education: 0, total: 0 };
    value.originName ||= source.originName;
    value.health += nonnegative(source.health);
    value.education += nonnegative(source.education);
    value.total += nonnegative(source.total);
    sourcesById.set(source.originIslandId, value);
  }
  let inboundSourceCount = 0;
  let maxInboundDemand = 0;
  for (const [originIslandId, source] of sourcesById) {
    if (source.total <= 0) continue;
    inboundSourceCount++;
    const origin = islands.get(originIslandId);
    const originCenter = islandCenter(origin);
    if (!originCenter || !center) continue;
    maxInboundDemand = Math.max(maxInboundDemand, source.total);
    inbound.features.push({
      type: 'Feature',
      id: `inbound:${originIslandId}`,
      geometry: { type: 'LineString', coordinates: [originCenter, center] },
      properties: {
        id: `inbound:${originIslandId}`,
        originIslandId,
        originName: source.originName || origin?.name || 'Unknown island',
        destinationIslandId: islandId,
        health: source.health,
        education: source.education,
        total: source.total,
        schematic: true
      }
    });
  }
  inbound.features.sort((a, b) => b.properties.total - a.properties.total || a.id.localeCompare(b.id));
  const limitations = [
    'Demand links show modeled health and education allocations, not daily trips or unique travelers.',
    'Ferries use mapped terminals and water paths checked against island outlines. Modeled paths are not navigation charts.',
    'Flight links join airports, including a shared airport reached by land where applicable; flight tracks are schematic.'
  ];
  if (unmappedRoutes)
    limitations.push(`${unmappedRoutes} connections lack usable terminals or a verified mapped path.`);
  if (inboundSourceCount > inbound.features.length)
    limitations.push(
      `${inboundSourceCount - inbound.features.length} inbound origins have no usable island coordinates.`
    );

  return {
    islandId,
    islandName: island.name,
    center,
    routes,
    inbound,
    summary: {
      routeCount: routes.features.length,
      unmappedRouteCount: unmappedRoutes,
      ...(sharedAirportIslandId && airportAccess ? { sharedAirportName: airportAccess.name || 'Shared airport' } : {}),
      inboundSourceCount,
      mappedInboundSourceCount: inbound.features.length,
      maxInboundDemand
    },
    limitations
  };
}

export async function getIslandConnections(islandId: string): Promise<IslandConnectionsResponse> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new IslandConnectionsNotFoundError(islandId);
  const snapshot = await loadScoringSnapshot();
  if (!indexedIslands(snapshot).has(normalizedId)) throw new IslandConnectionsNotFoundError(normalizedId);
  const score = await getIslandScore(normalizedId, snapshot);
  return buildIslandConnections(snapshot, normalizedId, score.demand.inboundSources);
}
