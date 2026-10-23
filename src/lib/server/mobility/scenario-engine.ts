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
      | 'OPERATION_CONFLICT'
      | 'PROPOSAL_COST_UNAVAILABLE'
      | 'PROPOSAL_BUDGET_EXCEEDED'
      | 'TRANSPORT_INVALID'
      | 'TRANSPORT_NOT_FOUND',
    message: string,
    public readonly status = 422
  ) {
    super(message);
    this.name = 'ScenarioDomainError';
  }
}

type Coordinate = [number, number];

function ferryStopIds(operation: Extract<ProposalTransportOperation, { kind: 'add_ferry_service' }>): string[] {
  return (operation.stopIds ?? [operation.originStopId, operation.destinationStopId]).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
}

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
  const activeIds = new Set(services.map((service) => service.id));
  const stops = snapshot.transportStops
    .filter((stop) => !deleted.has(stop.id))
    .map((stop) => {
      const service = services.find((entry) => entry.id === stop.id);
      if (!service || !activeIds.has(stop.id)) return stop;
      return { ...stop, latitude: service.latitude, longitude: service.longitude, subtype: service.subtype };
    });

  for (const service of services) {
    if (
      !added.has(service.id) ||
      !service.islandId ||
      service.serviceType !== 'transport' ||
      !isTransportStopSubtype(service.serviceType, service.subtype) ||
      service.latitude === null ||
      service.longitude === null ||
      stops.some((stop) => stop.id === service.id)
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
  }

  return stops;
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

  const services = snapshot.services.map((service) => ({ ...service }));
  const changes = new Map<string, 'added' | 'upgraded' | 'downgraded' | 'moved'>();
  const deleted = new Set<string>();
  const added = new Set<string>();
  const moved = new Set<string>();
  const results: ScenarioOperationResult[] = [];
  const transportOperations: ProposalTransportOperation[] = [];
  const geometry = parseGeometry(island.geoJson);
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
      if (services.some((service) => service.id === serviceId)) {
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

    const serviceIndex = services.findIndex((service) => service.id === operation.serviceId);
    if (serviceIndex < 0) {
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

  const activeServices = services.filter((service) => !deleted.has(service.id));
  const deletedIds = new Set(
    [...snapshot.services].filter((service) => deleted.has(service.id)).map((service) => service.id)
  );
  const transportCosts: ProposalCostItem[] = [];
  const transportPlans: ProposalTransportPlan[] = [];
  const routes = transportOperations.length > 0 ? [...snapshot.routes] : snapshot.routes;
  const connections = transportOperations.length > 0 ? [...snapshot.connections] : snapshot.connections;
  const routeStops = snapshot.routeStops.filter((stop) => !deletedIds.has(stop.stopId));
  let transportStops = updateTransportStops(snapshot, activeServices, deletedIds, added);
  const transportKeys = new Set<string>();
  for (const operation of transportOperations) {
    const key =
      operation.kind === 'add_bus_service' ? `bus:${operation.routeId}` : `ferry:${ferryStopIds(operation).join('|')}`;
    if (transportKeys.has(key)) {
      throw new ScenarioDomainError(
        'OPERATION_CONFLICT',
        'This route already has a proposed service. Remove or undo the earlier service before changing its frequency.'
      );
    }
    transportKeys.add(key);
    if (
      operation.kind === 'add_ferry_service' &&
      ferryStopIds(operation).some((id) => deleted.has(id) || moved.has(id))
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
      if (operation.kind === 'add_ferry_service' && resolved.route && resolved.connection) {
        const routeId = resolved.route.id;
        const endpointIds = ferryStopIds(operation);
        const stopIslandIds = new Map(snapshot.transportStops.map((stop) => [stop.id, stop.islandId]));
        for (const [sequence, stopId] of endpointIds.entries()) {
          routeStops.push({
            routeId,
            stopId,
            islandId: stopIslandIds.get(stopId)!,
            sequence,
            terminalEvidence: 'Proposed service using an existing recorded landing place'
          });
        }
        transportStops = transportStops.map((stop) =>
          endpointIds.includes(stop.id) ? { ...stop, routeIds: [...new Set([...stop.routeIds, routeId])] } : stop
        );
      }
      results.push({
        operationId: operation.operationId,
        kind: operation.kind,
        serviceId: `draft:${operation.operationId}`,
        status: 'applied',
        message: `${resolved.plan.label}: ${resolved.plan.departuresPerDirectionPerDay} proposed departures per operating day${resolved.plan.bidirectional ? ' in each direction' : ''}.`
      });
    } catch (error) {
      if (error instanceof ProposalTransportError) {
        throw new ScenarioDomainError(error.code, error.message, error.status);
      }
      throw error;
    }
  }
  const resultsByOperationId = new Map(results.map((result) => [result.operationId, result]));
  const orderedResults = operations.flatMap((operation) => {
    const result = resultsByOperationId.get(operation.operationId);
    return result ? [result] : [];
  });
  return {
    snapshot: {
      ...snapshot,
      routes,
      connections,
      services: activeServices,
      transportStops,
      routeStops
    },
    changes,
    deleted,
    results: orderedResults,
    transportCosts,
    transportPlans
  };
}
