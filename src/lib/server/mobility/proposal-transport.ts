import type { ProposalCostItem } from '$lib/mobility/proposal-planning';
import type {
  ProposalTransportOperation,
  ProposalTransportOptions,
  ProposalTransportPlan,
  TransportCoordinate
} from '$lib/mobility/proposal-transport';
import type { ScoringSnapshot, TransportStop } from '$lib/server/scoring/types';
import type { TransportConnection, TransportRoute } from '$models';

import * as v from 'valibot';

import {
  proposalTransportOperationSchema,
  TRANSPORT_PLANNING_ASSUMPTIONS,
  transportDeparturesPerDirection,
  transportDistanceKm,
  transportMinimumFleet
} from '$lib/mobility/proposal-transport';
import { createMarineRouter } from '$lib/server/scoring/marine-routing';

export class ProposalTransportError extends Error {
  constructor(
    public readonly code: 'ISLAND_NOT_FOUND' | 'TRANSPORT_INVALID' | 'TRANSPORT_NOT_FOUND',
    message: string,
    public readonly status = 422
  ) {
    super(message);
  }
}

function coordinate(value: unknown): value is TransportCoordinate {
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

function routeLines(value: unknown): TransportCoordinate[][] {
  if (!value || typeof value !== 'object') return [];
  const geometry = value as { type?: unknown; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
  if (geometry.type === 'Feature') return routeLines(geometry.geometry);
  if (geometry.type === 'FeatureCollection' && Array.isArray(geometry.features))
    return geometry.features.flatMap(routeLines);
  if (
    geometry.type === 'LineString' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(coordinate)
  )
    return [geometry.coordinates as TransportCoordinate[]];
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates))
    return geometry.coordinates.flatMap((line) => routeLines({ type: 'LineString', coordinates: line }));
  return [];
}

type PreparedRoute = { lines: TransportCoordinate[][]; distanceKm: number };
const preparedRoutes = new WeakMap<TransportRoute, PreparedRoute>();

function prepareRoute(route: TransportRoute): PreparedRoute {
  const cached = preparedRoutes.get(route);
  if (cached) return cached;
  let lines: TransportCoordinate[][];
  try {
    lines = routeLines(JSON.parse(route.geoJson));
  } catch {
    lines = [];
  }
  const prepared = { lines, distanceKm: lengthKm(lines) };
  preparedRoutes.set(route, prepared);
  return prepared;
}

function lengthKm(lines: TransportCoordinate[][]): number {
  return lines.reduce(
    (total, line) =>
      total + line.slice(1).reduce((sum, point, index) => sum + transportDistanceKm(line[index], point), 0),
    0
  );
}

function busRoutesForIsland(snapshot: ScoringSnapshot, islandId: string): TransportRoute[] {
  const routeIds = new Set([
    ...snapshot.routeStops.filter((stop) => stop.islandId === islandId).map((stop) => stop.routeId),
    ...snapshot.transportStops.filter((stop) => stop.islandId === islandId).flatMap((stop) => stop.routeIds),
    ...snapshot.connections
      .filter(
        (connection) =>
          connection.connectionType === 'bus' &&
          (connection.fromIslandId === islandId || connection.toIslandId === islandId)
      )
      .flatMap((connection) => (connection.routeId ? [connection.routeId] : []))
  ]);
  return snapshot.routes.filter(
    (route) => route.routeType === 'bus' && routeIds.has(route.id) && prepareRoute(route).distanceKm > 0
  );
}

function landing(stop: TransportStop): boolean {
  return (
    ['port', 'jetty', 'ferry_terminal', 'marine_terminal'].includes(stop.subtype) &&
    stop.longitude !== null &&
    stop.latitude !== null &&
    coordinate([stop.longitude, stop.latitude])
  );
}

export function getProposalTransportOptions(snapshot: ScoringSnapshot, islandId: string): ProposalTransportOptions {
  const island = snapshot.islands.find((entry) => entry.id === islandId);
  if (!island) throw new ProposalTransportError('ISLAND_NOT_FOUND', 'Selected island was not found.', 404);
  const islandNames = new Map(snapshot.islands.map((entry) => [entry.id, entry.name]));
  const terminals = snapshot.transportStops
    .filter(landing)
    .filter((stop) => islandNames.has(stop.islandId))
    .map((stop) => ({
      id: stop.id,
      name: stop.name || stop.subtype.replaceAll('_', ' '),
      islandId: stop.islandId,
      islandName: islandNames.get(stop.islandId)!,
      coordinates: [stop.longitude!, stop.latitude!] as TransportCoordinate
    }))
    .sort((a, b) => `${a.islandName} ${a.name}`.localeCompare(`${b.islandName} ${b.name}`));
  return {
    islandId,
    islandName: island.name,
    busRoutes: busRoutesForIsland(snapshot, islandId).map((route) => ({
      id: route.id,
      name: route.name || route.id,
      distanceKm: prepareRoute(route).distanceKm,
      stopCount: snapshot.routeStops.filter((stop) => stop.routeId === route.id).length,
      geometry: { type: 'MultiLineString' as const, coordinates: prepareRoute(route).lines }
    })),
    origins: terminals.filter((stop) => stop.islandId === islandId),
    destinations: terminals.filter((stop) => stop.islandId !== islandId),
    assumptions: [...TRANSPORT_PLANNING_ASSUMPTIONS]
  };
}

export function resolveProposalTransport(
  snapshot: ScoringSnapshot,
  islandId: string,
  rawOperation: ProposalTransportOperation
): {
  plan: ProposalTransportPlan;
  cost: ProposalCostItem;
  route: TransportRoute | null;
  connection: TransportConnection | null;
} {
  const parsed = v.safeParse(proposalTransportOperationSchema, rawOperation);
  if (!parsed.success)
    throw new ProposalTransportError('TRANSPORT_INVALID', 'Transport service parameters are invalid.');
  const operation = parsed.output;
  if (operation.endHour <= operation.startHour)
    throw new ProposalTransportError(
      'TRANSPORT_INVALID',
      'Service end hour must be later than start hour; split overnight services into separate proposals.'
    );
  const options = getProposalTransportOptions(snapshot, islandId);
  const serviceId = `draft:${operation.operationId}`;
  let label: string;
  let lines: TransportCoordinate[][];
  let distanceKm: number;
  let connection: TransportConnection | null = null;
  let route: TransportRoute | null = null;
  const mode = operation.kind === 'add_bus_service' ? 'bus' : 'ferry';
  const speedKph = operation.kind === 'add_ferry_service' ? operation.speedKph : 20;
  const assumptions = [...TRANSPORT_PLANNING_ASSUMPTIONS];
  if (operation.kind === 'add_bus_service') {
    const existing = busRoutesForIsland(snapshot, islandId).find((entry) => entry.id === operation.routeId);
    if (!existing)
      throw new ProposalTransportError(
        'TRANSPORT_NOT_FOUND',
        'Choose a mapped bus route serving the selected island.',
        404
      );
    ({ lines, distanceKm } = prepareRoute(existing));
    label = `Proposed bus service · ${existing.name || existing.id}`;
    assumptions.push(
      'Uses the selected mapped route direction. Return/repositioning mileage is budgeted as the same distance. Existing services and their unknown timetable are retained; these are additional proposed departures.'
    );
  } else {
    const origin = options.origins.find((entry) => entry.id === operation.originStopId);
    const destination = options.destinations.find((entry) => entry.id === operation.destinationStopId);
    if (!origin || !destination || origin.islandId === destination.islandId)
      throw new ProposalTransportError(
        'TRANSPORT_NOT_FOUND',
        'Choose existing landing places on the selected island and a different destination island.',
        404
      );
    const marine = createMarineRouter(snapshot);
    const waterRoute = marine.routeDetailed(origin.coordinates, destination.coordinates);
    if (!waterRoute)
      throw new ProposalTransportError(
        'TRANSPORT_INVALID',
        marine.coastlineComplete
          ? 'A ferry display path avoiding mapped land could not be resolved between these landing places. Choose different landing places or review the coastline data.'
          : 'A ferry display path requires usable coastline geometry for every island. Restore the missing or unsupported island coastline data before adding this service.'
      );
    lines = [waterRoute.coordinates];
    distanceKm = transportDistanceKm(origin.coordinates, destination.coordinates);
    label = `Proposed ferry · ${origin.islandName} ↔ ${destination.islandName}`;
    assumptions.push(
      `Existing landing places: ${origin.name} (${origin.id}) to ${destination.name} (${destination.id}). Assumed sailing speed: ${speedKph} km/h.`
    );
    assumptions.push(
      'The displayed ferry path avoids mapped island land. It is modeled display geometry, not a surveyed navigable sailing route.'
    );
    for (const [landing, endpoint] of [
      [origin, waterRoute.start],
      [destination, waterRoute.end]
    ] as const)
      if (endpoint.snapped)
        assumptions.push(
          `${landing.name}: the mapped landing coordinate is inland, so its display endpoint is moved ${Math.round(endpoint.distanceKm * 1000)} m to the mapped exterior shoreline. The original landing record is retained.`
        );
    assumptions.push(
      'Operating cost, fleet size and sailing-time estimates retain direct endpoint distance as a lower-bound planning assumption. Reefs, landing permission, actual sailing distance and any additional vessels require review; actual operating cost may be higher. No new port is included.'
    );
    route = {
      id: serviceId,
      name: label,
      routeType: 'ferry',
      geoJson: JSON.stringify({ type: 'MultiLineString', coordinates: lines }),
      source: 'proposal',
      sourceObjectId: operation.operationId,
      modeled: true
    };
    connection = {
      id: serviceId,
      routeId: serviceId,
      fromIslandId: origin.islandId,
      toIslandId: destination.islandId,
      connectionType: 'ferry',
      directionality: 'bidirectional',
      sequence: null,
      distanceM: distanceKm * 1000,
      geoJson: route.geoJson,
      source: 'proposal',
      sourceObjectId: operation.operationId,
      modeled: true,
      scoreEligible: true
    };
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0.01)
    throw new ProposalTransportError('TRANSPORT_INVALID', 'A usable nonzero route distance is required.');
  const minimumFleet = transportMinimumFleet(mode, distanceKm, operation.headwayMinutes, speedKph);
  if (operation.vehicleCount < minimumFleet)
    throw new ProposalTransportError(
      'TRANSPORT_INVALID',
      `This headway requires at least ${minimumFleet} ${mode === 'bus' ? 'buses' : 'ferries'} under the stated speed and turnaround assumptions.`
    );
  const departures = transportDeparturesPerDirection(operation.startHour, operation.endHour, operation.headwayMinutes);
  const annualKm = departures * 2 * distanceKm * operation.serviceDaysPerWeek * (365 / 7);
  const capital = operation.vehicleCount * (mode === 'bus' ? 3_000_000 : 15_000_000);
  const annual = Math.round(annualKm * (mode === 'bus' ? 30 : 100) * 100) / 100;
  const plan: ProposalTransportPlan = {
    operationId: operation.operationId,
    mode,
    label,
    geometry: { type: 'MultiLineString', coordinates: lines },
    distanceKm,
    speedKph,
    headwayMinutes: operation.headwayMinutes,
    startHour: operation.startHour,
    endHour: operation.endHour,
    serviceDaysPerWeek: operation.serviceDaysPerWeek,
    vehicleCount: operation.vehicleCount,
    departuresPerDirectionPerDay: departures,
    proposedExpectedWaitMinutes: operation.headwayMinutes / 2,
    bidirectional: mode === 'ferry',
    capital,
    annual,
    assumptions
  };
  return {
    plan,
    route,
    connection,
    cost: {
      operationId: operation.operationId,
      serviceId,
      label,
      kind: operation.kind,
      capital,
      annual,
      basis: `${departures} proposed departures per operating day${mode === 'ferry' ? ' in each direction' : ' in the selected direction, plus return/repositioning mileage'}; ${distanceKm.toFixed(2)} km one way; ${operation.serviceDaysPerWeek} days/week annualized over 365 days; ${operation.vehicleCount} vehicles. ${assumptions.join(' ')}`,
      sourceIds: [],
      estimated: true,
      costAvailable: true
    }
  };
}
