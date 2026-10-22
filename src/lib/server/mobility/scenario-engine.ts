import type { ProposalCostItem } from '$lib/mobility/proposal-planning';
import type { ProposalTransportOperation, ProposalTransportPlan } from '$lib/mobility/proposal-transport';
import type { ScenarioOperation, ScenarioOperationResult } from '$lib/mobility/scenario-contracts';
import type { ScoringSnapshot } from '$lib/server/scoring/types';
import type { Island, Service } from '$models';

import { isTransportStopSubtype, serviceCatalogEntry } from '$lib/mobility/service-catalog';

import { ProposalTransportError, resolveProposalTransport } from './proposal-transport';
import { serviceDowngradeOptions, serviceUpgradeOptions } from './service-rules';

export class ScenarioDomainError extends Error {
  constructor(
    public readonly code:
      | 'ISLAND_NOT_FOUND'
      | 'SERVICE_NOT_FOUND'
      | 'SERVICE_NOT_ON_SELECTED_ISLAND'
      | 'SERVICE_ALREADY_DELETED'
      | 'SERVICE_CATALOG_MISMATCH'
      | 'ADD_OUTSIDE_ISLAND'
      | 'SERVICE_ID_COLLISION'
      | 'UPGRADE_NOT_ELIGIBLE'
      | 'DOWNGRADE_NOT_ELIGIBLE'
      | 'MOVE_OUTSIDE_ISLAND'
      | 'BASELINE_VERSION_MISMATCH'
      | 'PROPOSAL_BUDGET_EXCEEDED'
      | 'PROPOSAL_COST_UNAVAILABLE'
      | 'TRANSPORT_INVALID'
      | 'TRANSPORT_NOT_FOUND'
      | 'OPERATION_CONFLICT',
    message: string,
    public readonly status = 422
  ) {
    super(message);
    this.name = 'ScenarioDomainError';
  }
}

type Coordinate = [number, number];

type ProjectedScenario = {
  snapshot: ScoringSnapshot;
  changes: Map<string, 'added' | 'upgraded' | 'downgraded' | 'moved'>;
  deleted: Set<string>;
  results: ScenarioOperationResult[];
  transportCosts: ProposalCostItem[];
  transportPlans: ProposalTransportPlan[];
};

function parseGeometry(geoJson: string): unknown {
  try {
    return JSON.parse(geoJson) as unknown;
  } catch {
    return null;
  }
}

function pointInRing(point: Coordinate, ring: Coordinate[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const prior = ring[previous];
    if (!current || !prior) continue;
    const crosses = current[1] > point[1] !== prior[1] > point[1];
    if (
      crosses &&
      point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(point: Coordinate, geometry: unknown): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  const value = geometry as { type?: unknown; coordinates?: unknown };
  if (value.type === 'Feature') {
    return pointInGeometry(point, (geometry as { geometry?: unknown }).geometry);
  }
  if (value.type === 'Polygon' && Array.isArray(value.coordinates)) {
    const rings = value.coordinates as unknown[];
    const outer = rings[0];
    if (!Array.isArray(outer)) return false;
    return (
      pointInRing(point, outer as Coordinate[]) &&
      !rings.slice(1).some((ring) => Array.isArray(ring) && pointInRing(point, ring as Coordinate[]))
    );
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    return value.coordinates.some((polygon) => pointInGeometry(point, { type: 'Polygon', coordinates: polygon }));
  }
  return false;
}

function updateTransportStops(
  snapshot: ScoringSnapshot,
  services: Service[],
  deleted: Set<string>,
  added: Set<string>
): ScoringSnapshot['transportStops'] {
  const servicesById = new Map(services.map((service) => [service.id, service]));
  let changed = false;
  const stops = snapshot.transportStops
    .filter((stop) => {
      if (!deleted.has(stop.id)) return true;
      changed = true;
      return false;
    })
    .map((stop) => {
      const service = servicesById.get(stop.id);
      if (
        !service ||
        (service.latitude === stop.latitude && service.longitude === stop.longitude && service.subtype === stop.subtype)
      )
        return stop;
      changed = true;
      return { ...stop, latitude: service.latitude, longitude: service.longitude, subtype: service.subtype };
    });
  const stopIds = new Set(stops.map((stop) => stop.id));

  for (const service of services) {
    if (
      !added.has(service.id) ||
      !service.islandId ||
      service.serviceType !== 'transport' ||
      !isTransportStopSubtype(service.serviceType, service.subtype) ||
      service.latitude === null ||
      service.longitude === null ||
      stopIds.has(service.id)
    ) {
      continue;
    }

    stops.push({
      id: service.id,
      name: service.name,
      islandId: service.islandId,
      subtype: service.subtype,
      latitude: service.latitude,
      longitude: service.longitude,
      routeIds: []
    });
    changed = true;
    stopIds.add(service.id);
  }

  return changed ? stops : snapshot.transportStops;
}

export function projectScenario(
  snapshot: ScoringSnapshot,
  island: Pick<Island, 'id' | 'geoJson'>,
  selectedIslandId: string,
  operations: readonly ScenarioOperation[]
): ProjectedScenario {
  if (island.id !== selectedIslandId) {
    throw new ScenarioDomainError('ISLAND_NOT_FOUND', `Island ${selectedIslandId} was not found.`, 404);
  }

  const changes = new Map<string, 'added' | 'upgraded' | 'downgraded' | 'moved'>();
  const deleted = new Set<string>();
  if (operations.length === 0) {
    return { snapshot, changes, deleted, results: [], transportCosts: [], transportPlans: [] };
  }
  const hasServiceOperations = operations.some(
    (operation) => operation.kind !== 'add_bus_service' && operation.kind !== 'add_ferry_service'
  );
  // Baseline rows are immutable. Only replace rows actually changed by this draft.
  const services = hasServiceOperations ? [...snapshot.services] : snapshot.services;
  const serviceIndexes = new Map(services.map((service, index) => [service.id, index]));
  const added = new Set<string>();
  const moved = new Set<string>();
  const results: ScenarioOperationResult[] = [];
  const transportOperations: ProposalTransportOperation[] = [];
  const geometry = operations.some((operation) => operation.kind === 'add_service' || operation.kind === 'move_service')
    ? parseGeometry(island.geoJson)
    : null;
  const operationIds = new Set<string>();

  for (const operation of operations) {
    if (operationIds.has(operation.operationId)) {
      throw new ScenarioDomainError('OPERATION_CONFLICT', 'Every proposal operation must have a unique identifier.');
    }
    operationIds.add(operation.operationId);
    if (operation.kind === 'add_bus_service' || operation.kind === 'add_ferry_service') {
      transportOperations.push(operation);
      continue;
    }
    if (operation.kind === 'add_service') {
      const catalogEntry = serviceCatalogEntry(operation.serviceType, operation.subtype);
      if (!catalogEntry) {
        throw new ScenarioDomainError(
          'SERVICE_CATALOG_MISMATCH',
          `${operation.subtype} is not available for ${operation.serviceType} services.`
        );
      }

      const serviceId = `draft:${operation.operationId}`;
      if (serviceIndexes.has(serviceId)) {
        throw new ScenarioDomainError('SERVICE_ID_COLLISION', `Draft service ${serviceId} already exists.`);
      }

      const [longitude, latitude] = operation.coordinates;
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90 ||
        !pointInGeometry(operation.coordinates, geometry)
      ) {
        throw new ScenarioDomainError('ADD_OUTSIDE_ISLAND', 'Choose a point inside the selected island.');
      }

      serviceIndexes.set(serviceId, services.length);
      services.push({
        id: serviceId,
        islandId: selectedIslandId,
        serviceType: operation.serviceType,
        subtype: operation.subtype,
        name: operation.name?.trim() || catalogEntry.label,
        latitude,
        longitude
      });
      added.add(serviceId);
      changes.set(serviceId, 'added');
      results.push({
        operationId: operation.operationId,
        kind: operation.kind,
        serviceId,
        status: 'applied',
        message: `${catalogEntry.label} added to this draft.`
      });
      continue;
    }

    const serviceIndex = serviceIndexes.get(operation.serviceId);
    if (serviceIndex === undefined) {
      throw new ScenarioDomainError('SERVICE_NOT_FOUND', `Service ${operation.serviceId} was not found.`);
    }
    const service = services[serviceIndex];
    if (!service) continue;
    if (service.islandId !== selectedIslandId) {
      throw new ScenarioDomainError(
        'SERVICE_NOT_ON_SELECTED_ISLAND',
        `Service ${operation.serviceId} does not belong to the selected island.`
      );
    }
    if (deleted.has(service.id)) {
      throw new ScenarioDomainError('SERVICE_ALREADY_DELETED', `Service ${service.id} has already been deleted.`);
    }

    if (operation.kind === 'upgrade_service' || operation.kind === 'downgrade_service') {
      const isUpgrade = operation.kind === 'upgrade_service';
      const options = isUpgrade ? serviceUpgradeOptions(service) : serviceDowngradeOptions(service);
      const option = options.find((entry) => entry.targetSubtype === operation.targetSubtype);
      if (!option) {
        throw new ScenarioDomainError(
          isUpgrade ? 'UPGRADE_NOT_ELIGIBLE' : 'DOWNGRADE_NOT_ELIGIBLE',
          `${service.subtype} cannot be ${isUpgrade ? 'upgraded' : 'downgraded'} to ${operation.targetSubtype}.`
        );
      }
      services[serviceIndex] = { ...service, subtype: operation.targetSubtype };
      changes.set(service.id, changes.get(service.id) === 'added' ? 'added' : isUpgrade ? 'upgraded' : 'downgraded');
      results.push({
        operationId: operation.operationId,
        kind: operation.kind,
        serviceId: service.id,
        status: 'applied',
        message: option.label
      });
      continue;
    }

    if (operation.kind === 'move_service') {
      const [longitude, latitude] = operation.coordinates;
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90 ||
        !pointInGeometry(operation.coordinates, geometry)
      ) {
        throw new ScenarioDomainError('MOVE_OUTSIDE_ISLAND', 'Choose a point inside the selected island.');
      }
      services[serviceIndex] = { ...service, longitude, latitude };
      moved.add(service.id);
      changes.set(service.id, changes.get(service.id) === 'added' ? 'added' : 'moved');
      results.push({
        operationId: operation.operationId,
        kind: operation.kind,
        serviceId: service.id,
        status: 'applied',
        message: 'Service moved within the selected island.'
      });
      continue;
    }

    deleted.add(service.id);
    results.push({
      operationId: operation.operationId,
      kind: operation.kind,
      serviceId: service.id,
      status: 'applied',
      message: 'Service removed from this draft.'
    });
  }

  const activeServices = deleted.size > 0 ? services.filter((service) => !deleted.has(service.id)) : services;
  const transportCosts: ProposalCostItem[] = [];
  const transportPlans: ProposalTransportPlan[] = [];
  const routes = transportOperations.length > 0 ? [...snapshot.routes] : snapshot.routes;
  const connections = transportOperations.length > 0 ? [...snapshot.connections] : snapshot.connections;
  const transportKeys = new Set<string>();
  for (const operation of transportOperations) {
    const key =
      operation.kind === 'add_bus_service'
        ? `bus:${operation.routeId}`
        : `ferry:${[operation.originStopId, operation.destinationStopId].sort().join('|')}`;
    if (transportKeys.has(key))
      throw new ScenarioDomainError(
        'OPERATION_CONFLICT',
        'This route already has a proposed service. Remove or undo the earlier service before changing its frequency.'
      );
    transportKeys.add(key);
    if (
      operation.kind === 'add_ferry_service' &&
      [operation.originStopId, operation.destinationStopId].some((id) => deleted.has(id) || moved.has(id))
    ) {
      throw new ScenarioDomainError(
        'OPERATION_CONFLICT',
        'A proposed ferry must use existing landing places that remain at their recorded locations.'
      );
    }
    try {
      const resolved = resolveProposalTransport(snapshot, selectedIslandId, operation);
      transportCosts.push(resolved.cost);
      transportPlans.push(resolved.plan);
      if (resolved.route) routes.push(resolved.route);
      if (resolved.connection) connections.push(resolved.connection);
      results.push({
        operationId: operation.operationId,
        kind: operation.kind,
        serviceId: `draft:${operation.operationId}`,
        status: 'applied',
        message: `${resolved.plan.label}: ${resolved.plan.departuresPerDirectionPerDay} proposed departures per operating day${resolved.plan.bidirectional ? ' in each direction' : ''}.`
      });
    } catch (error) {
      if (error instanceof ProposalTransportError)
        throw new ScenarioDomainError(error.code, error.message, error.status);
      throw error;
    }
  }
  return {
    snapshot: {
      ...snapshot,
      routes,
      connections,
      services: activeServices,
      transportStops: hasServiceOperations
        ? updateTransportStops(snapshot, activeServices, deleted, added)
        : snapshot.transportStops,
      routeStops:
        deleted.size > 0 ? snapshot.routeStops.filter((stop) => !deleted.has(stop.stopId)) : snapshot.routeStops
    },
    changes,
    deleted,
    results,
    transportCosts,
    transportPlans
  };
}
