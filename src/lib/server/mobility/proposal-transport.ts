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

const APPROVED_CROSS_ATOLL_FERRY_LINKS = new Set(['island:640:island:684']);

function eligibleFerryIslands(
  originIslandId: string,
  destinationIslandId: string,
  islands: ScoringSnapshot['islands']
): boolean {
  if (originIslandId === destinationIslandId) return false;
  const islandsById = new Map(islands.map((island) => [island.id, island]));
  const origin = islandsById.get(originIslandId);
  const destination = islandsById.get(destinationIslandId);
  if (!origin || !destination) return false;
  return (
    origin.atollId === destination.atollId ||
    APPROVED_CROSS_ATOLL_FERRY_LINKS.has(`${originIslandId}:${destinationIslandId}`)
  );
}

export function getProposalTransportOptions(snapshot: ScoringSnapshot, islandId: string): ProposalTransportOptions {
  const island = snapshot.islands.find((entry) => entry.id === islandId);
  if (!island) throw new ProposalTransportError('ISLAND_NOT_FOUND', 'Selected island was not found.', 404);
  const islands = new Map(snapshot.islands.map((entry) => [entry.id, entry]));
  const terminals = snapshot.transportStops
    .filter(landing)
    .filter((stop) => islands.has(stop.islandId))
    .map((stop) => ({
      id: stop.id,
      name: stop.name || stop.subtype.replaceAll('_', ' '),
      islandId: stop.islandId,
      islandName: islands.get(stop.islandId)!.name,
      coordinates: [stop.longitude!, stop.latitude!] as TransportCoordinate
    }))
    .sort((a, b) => `${a.islandName} ${a.name}`.localeCompare(`${b.islandName} ${b.name}`));
  const eligibleTerminals = terminals.filter((stop) => eligibleFerryIslands(islandId, stop.islandId, snapshot.islands));
  const terminalIds = new Set(terminals.map((stop) => stop.id));
  const baselineFerryChains = snapshot.routes
    .filter((route) => route.routeType === 'ferry')
    .map((route) => {
      const stops = snapshot.routeStops
        .filter((stop) => stop.routeId === route.id && terminalIds.has(stop.stopId))
        .sort((a, b) => a.sequence - b.sequence);
      return {
        routeId: route.id,
        routeName: route.name || route.id,
        stopIds: stops.map((stop) => stop.stopId),
        islandIds: stops.map((stop) => stop.islandId)
      };
    })
    .filter((route) => route.stopIds.length >= 2 && route.islandIds.includes(islandId));
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
    destinations: eligibleTerminals,
    eligibleDestinations: eligibleTerminals.map((stop) => ({
      ...stop,
      atollId: islands.get(stop.islandId)!.atollId,
      atollName: islands.get(stop.islandId)!.atollName ?? null
    })),
    baselineFerryChains,
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
    const stopIds =
      operation.stopIds ??
      (operation.originStopId && operation.destinationStopId
        ? [operation.originStopId, operation.destinationStopId]
        : []);
    if (stopIds.length < 2 || new Set(stopIds).size !== stopIds.length)
      throw new ProposalTransportError(
        'TRANSPORT_INVALID',
        'Choose an ordered chain of at least two distinct landing places.'
      );
    const stopsById = new Map(snapshot.transportStops.filter(landing).map((stop) => [stop.id, stop]));
    const islandsById = new Map(snapshot.islands.map((entry) => [entry.id, entry]));
    const stops = stopIds.map((id) => stopsById.get(id));
    if (
      stops.some((stop) => !stop) ||
      stops[0]?.islandId !== islandId ||
      stops.some(
        (stop, index) =>
          index > 0 && !eligibleFerryIslands(stops[index - 1]!.islandId, stop!.islandId, snapshot.islands)
      )
    )
      throw new ProposalTransportError(
        'TRANSPORT_NOT_FOUND',
        'Choose existing landing places beginning on the selected island and following an eligible ferry corridor.',
        404
      );
    const landings = stops.map((stop) => ({
      stop: stop!,
      island: islandsById.get(stop!.islandId)!,
      coordinates: [stop!.longitude!, stop!.latitude!] as TransportCoordinate
    }));
    const marine = createMarineRouter(snapshot);
    lines = [];
    distanceKm = 0;
    for (let index = 1; index < landings.length; index += 1) {
      const from = landings[index - 1];
      const to = landings[index];
      const waterRoute = marine.routeDetailed(from.coordinates, to.coordinates);
      if (!waterRoute)
        throw new ProposalTransportError(
          'TRANSPORT_INVALID',
          marine.coastlineComplete
            ? `A ferry display path could not be resolved for leg ${index} (${from.stop.name || from.stop.id} to ${to.stop.name || to.stop.id}).`
            : 'A ferry display path requires usable coastline geometry for every island. Restore the missing or unsupported island coastline data before adding this service.'
        );
      lines.push(waterRoute.coordinates);
      distanceKm += transportDistanceKm(from.coordinates, to.coordinates);
      for (const [landing, endpoint] of [
        [from, waterRoute.start],
        [to, waterRoute.end]
      ] as const)
        if (endpoint.snapped)
          assumptions.push(
            `${landing.stop.name || landing.stop.id}: the mapped landing coordinate is inland, so its display endpoint is moved ${Math.round(endpoint.distanceKm * 1000)} m to the mapped exterior shoreline. The original landing record is retained.`
          );
    }
    label = `Proposed ferry · ${landings.map((entry) => entry.island.name).join(' → ')}`;
    assumptions.push(
      `Existing landing chain: ${landings.map((entry) => `${entry.stop.name || entry.stop.id} (${entry.stop.id})`).join(' to ')}. Assumed sailing speed: ${speedKph} km/h.`
    );
    assumptions.push(
      'Each displayed ferry leg avoids mapped island land. Geometry is modeled, not a surveyed navigable sailing route.'
    );
    assumptions.push(
      'Operating cost, fleet size and sailing-time estimates use the sum of direct consecutive-leg distances as a lower-bound planning assumption. Reefs, landing permission, actual sailing distance and any additional vessels require review; actual operating cost may be higher. No new port is included.'
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
      fromIslandId: landings[0].stop.islandId,
      toIslandId: landings[landings.length - 1].stop.islandId,
      connectionType: 'ferry',
      directionality: 'bidirectional',
      sequence: 1,
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
