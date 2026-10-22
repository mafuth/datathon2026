import type { Island, Service, TransportConnection } from '../../db/models';
import type { ScoringSnapshot, ServiceScore } from './types';

import { scoringConfig } from './config';
import { indexedIslands } from './snapshot-index';

const LAND_CONNECTIONS = new Set(['bridge', 'bus', 'causeway', 'land_link']);
const EARTH_RADIUS_METERS = 6_371_000;

export type ServiceRouteKind = 'local' | 'connected' | 'same_atoll' | 'central';

export type ServiceRoute = {
  destinationIslandId: string;
  destinationServiceId: string;
  serviceSubtype: string;
  routeType: ServiceScore['routeType'];
  routeFactor: number;
  distanceM: number | null;
  hopCount: number;
  pathIslandIds: string[];
  pathConnectionIds: string[];
  knownConnectivity: boolean;
  kind: ServiceRouteKind;
};

export type ServiceRouting = {
  canonical: ServiceRoute | null;
  overlays: ServiceRoute[];
};

export type ServiceRoutingOptions = {
  serviceType: 'health' | 'education';
  centralIslandNames: readonly string[];
  selectService: (services: Service[]) => Service | null;
};

export type HospitalRouteKind = ServiceRouteKind;
export type HospitalRoute = ServiceRoute;
export type ElderlyHospitalRouting = ServiceRouting;
export type EducationRouteKind = ServiceRouteKind;
export type EducationRoute = ServiceRoute;
export type EducationRouting = ServiceRouting;

type PathState = {
  islandId: string;
  distanceM: number | null;
  hopCount: number;
  routeFactor: number;
  weakestRouteFactor: number;
  routeType: ServiceScore['routeType'];
  pathIslandIds: string[];
  pathConnectionIds: string[];
};

type GraphEdge = {
  islandId: string;
  connection: TransportConnection;
  routeType: Exclude<ServiceScore['routeType'], 'local' | 'unavailable'>;
  factor: number;
};

type ServiceCandidate = {
  island: Island;
  service: Service;
  path: PathState | null;
  distanceM: number | null;
};

const graphCache = new WeakMap<ScoringSnapshot['connections'], Map<string, GraphEdge[]>>();
const pathCache = new WeakMap<ScoringSnapshot['connections'], Map<string, Map<string, PathState>>>();
const serviceGroupsCache = new WeakMap<ScoringSnapshot['services'], Map<string, Map<string, Service[]>>>();
const routingCache = new WeakMap<ScoringSnapshot, Map<string, ServiceRouting>>();
const centralIslandsCache = new WeakMap<Map<string, Island>, WeakMap<readonly string[], Island[]>>();

function round(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeIslandName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function coordinatesFor(service: Service, island: Island): [number, number] | null {
  const longitude = service.longitude ?? island.longitude;
  const latitude = service.latitude ?? island.latitude;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function geographicDistanceM(from: [number, number], to: [number, number]): number {
  const [fromLongitude, fromLatitude] = from;
  const [toLongitude, toLatitude] = to;
  const latitudeDelta = ((toLatitude - fromLatitude) * Math.PI) / 180;
  const longitudeDelta = ((toLongitude - fromLongitude) * Math.PI) / 180;
  const fromLatitudeRadians = (fromLatitude * Math.PI) / 180;
  const toLatitudeRadians = (toLatitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) * Math.cos(toLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function connectionFromIsland(connection: TransportConnection, islandId: string): string | null {
  if (connection.scoreEligible === false) return null;
  if (connection.fromIslandId === islandId) return connection.toIslandId;
  if (connection.toIslandId === islandId && connection.directionality === 'bidirectional') {
    return connection.fromIslandId;
  }
  return null;
}

export function connectionRoute(connection: TransportConnection): {
  routeType: Exclude<ServiceScore['routeType'], 'local' | 'unavailable'>;
  factor: number;
} | null {
  if (connection.scoreEligible === false) return null;
  if (LAND_CONNECTIONS.has(connection.connectionType)) return { routeType: 'land', factor: 0.9 };
  if (connection.connectionType === 'ferry') {
    return { routeType: 'marine', factor: connection.modeled ? 0.6 : 0.7 };
  }
  if (connection.connectionType === 'air') {
    return { routeType: 'airport', factor: scoringConfig.airConnectionFactor };
  }
  return null;
}

function outgoingEdges(snapshot: ScoringSnapshot, islandId: string): GraphEdge[] {
  let graph = graphCache.get(snapshot.connections);
  if (!graph) {
    graph = new Map();
    for (const connection of snapshot.connections) {
      const route = connectionRoute(connection);
      if (!route) continue;
      const add = (origin: string, target: string) => {
        const edge = { islandId: target, connection, ...route };
        const edges = graph!.get(origin);
        if (edges) edges.push(edge);
        else graph!.set(origin, [edge]);
      };
      add(connection.fromIslandId, connection.toIslandId);
      if (connection.directionality === 'bidirectional' && connection.toIslandId !== connection.fromIslandId) {
        add(connection.toIslandId, connection.fromIslandId);
      }
    }
    graphCache.set(snapshot.connections, graph);
  }
  return graph.get(islandId) ?? [];
}

function comparePath(left: PathState, right: PathState): number {
  const leftHasDistance = left.distanceM !== null;
  const rightHasDistance = right.distanceM !== null;
  if (leftHasDistance !== rightHasDistance) return leftHasDistance ? -1 : 1;
  if (left.distanceM !== null && right.distanceM !== null && left.distanceM !== right.distanceM) {
    return left.distanceM - right.distanceM;
  }
  if (left.hopCount !== right.hopCount) return left.hopCount - right.hopCount;
  if (left.routeFactor !== right.routeFactor) return right.routeFactor - left.routeFactor;
  return left.pathConnectionIds.join('|').localeCompare(right.pathConnectionIds.join('|'));
}

function shortestPaths(snapshot: ScoringSnapshot, originIslandId: string): Map<string, PathState> {
  let byOrigin = pathCache.get(snapshot.connections);
  if (!byOrigin) pathCache.set(snapshot.connections, (byOrigin = new Map()));
  const cached = byOrigin.get(originIslandId);
  if (cached) return cached;
  const paths = new Map<string, PathState>();
  const pending: PathState[] = [
    {
      islandId: originIslandId,
      distanceM: 0,
      hopCount: 0,
      routeFactor: 1,
      weakestRouteFactor: 1,
      routeType: 'local',
      pathIslandIds: [originIslandId],
      pathConnectionIds: []
    }
  ];

  while (pending.length > 0) {
    pending.sort(comparePath);
    const current = pending.shift();
    if (!current) break;
    const known = paths.get(current.islandId);
    if (known && comparePath(known, current) !== 0) continue;
    paths.set(current.islandId, current);

    for (const edge of outgoingEdges(snapshot, current.islandId)) {
      if (current.pathIslandIds.includes(edge.islandId)) continue;
      const next: PathState = {
        islandId: edge.islandId,
        distanceM:
          current.distanceM === null || edge.connection.distanceM === null
            ? null
            : current.distanceM + edge.connection.distanceM,
        hopCount: current.hopCount + 1,
        routeFactor: current.routeFactor * edge.factor,
        weakestRouteFactor: Math.min(current.weakestRouteFactor, edge.factor),
        routeType:
          current.routeType === 'local' || edge.factor < current.weakestRouteFactor
            ? edge.routeType
            : current.routeType,
        pathIslandIds: [...current.pathIslandIds, edge.islandId],
        pathConnectionIds: [...current.pathConnectionIds, edge.connection.id]
      };
      const existing = paths.get(next.islandId);
      const pendingPath = pending.find((path) => path.islandId === next.islandId);
      const bestKnown = existing ?? pendingPath;
      if (!bestKnown || comparePath(next, bestKnown) < 0) {
        if (pendingPath) pending.splice(pending.indexOf(pendingPath), 1);
        pending.push(next);
      }
    }
  }

  byOrigin.set(originIslandId, paths);
  return paths;
}

function routeFromPath(candidate: ServiceCandidate, originIslandId: string, kind: ServiceRouteKind): ServiceRoute {
  const path = candidate.path;
  if (kind === 'local') {
    return {
      destinationIslandId: candidate.island.id,
      destinationServiceId: candidate.service.id,
      serviceSubtype: candidate.service.subtype,
      routeType: 'local',
      routeFactor: 1,
      distanceM: 0,
      hopCount: 0,
      pathIslandIds: [originIslandId],
      pathConnectionIds: [],
      knownConnectivity: true,
      kind
    };
  }
  return {
    destinationIslandId: candidate.island.id,
    destinationServiceId: candidate.service.id,
    serviceSubtype: candidate.service.subtype,
    routeType: path?.routeType ?? 'unavailable',
    routeFactor: path ? round(path.routeFactor) : 0,
    distanceM: path?.distanceM ?? candidate.distanceM,
    hopCount: path?.hopCount ?? 0,
    pathIslandIds: path?.pathIslandIds ?? [originIslandId, candidate.island.id],
    pathConnectionIds: path?.pathConnectionIds ?? [],
    knownConnectivity: path !== null,
    kind
  };
}

function compareConnectedCandidates(origin: Island, left: ServiceCandidate, right: ServiceCandidate): number {
  const leftSameAtoll = left.island.atollId === origin.atollId;
  const rightSameAtoll = right.island.atollId === origin.atollId;
  if (leftSameAtoll !== rightSameAtoll) return leftSameAtoll ? -1 : 1;
  if (left.path && right.path) {
    const pathComparison = comparePath(left.path, right.path);
    if (pathComparison !== 0) return pathComparison;
  }
  return left.island.id.localeCompare(right.island.id) || left.service.id.localeCompare(right.service.id);
}

function compareGeographicCandidates(left: ServiceCandidate, right: ServiceCandidate): number {
  if (left.distanceM !== null && right.distanceM !== null && left.distanceM !== right.distanceM) {
    return left.distanceM - right.distanceM;
  }
  if ((left.distanceM !== null) !== (right.distanceM !== null)) return left.distanceM !== null ? -1 : 1;
  return left.island.id.localeCompare(right.island.id) || left.service.id.localeCompare(right.service.id);
}

function nearestConnectedService(
  origin: Island,
  services: Service[],
  islandsById: Map<string, Island>,
  paths: Map<string, PathState>
): ServiceCandidate | null {
  const candidates = services.flatMap((service) => {
    if (!service.islandId || service.islandId === origin.id) return [];
    const island = islandsById.get(service.islandId);
    const path = island ? paths.get(island.id) : undefined;
    return island && path ? [{ island, service, path, distanceM: path.distanceM }] : [];
  });
  return candidates.sort((left, right) => compareConnectedCandidates(origin, left, right))[0] ?? null;
}

function nearestSameAtollService(
  origin: Island,
  services: Service[],
  islandsById: Map<string, Island>
): ServiceCandidate | null {
  const originCoordinates: [number, number] = [origin.longitude, origin.latitude];
  const candidates = services.flatMap((service) => {
    if (!service.islandId || service.islandId === origin.id) return [];
    const island = islandsById.get(service.islandId);
    if (!island || island.atollId !== origin.atollId) return [];
    const coordinates = coordinatesFor(service, island);
    return [
      {
        island,
        service,
        path: null,
        distanceM: coordinates ? geographicDistanceM(originCoordinates, coordinates) : null
      }
    ];
  });
  return candidates.sort(compareGeographicCandidates)[0] ?? null;
}

function centralServiceCandidates(
  origin: Island,
  services: Service[],
  islandsById: Map<string, Island>,
  paths: Map<string, PathState>,
  options: ServiceRoutingOptions
): ServiceCandidate[] {
  let byNames = centralIslandsCache.get(islandsById);
  if (!byNames) centralIslandsCache.set(islandsById, (byNames = new WeakMap()));
  let centralIslands = byNames.get(options.centralIslandNames);
  if (!centralIslands) {
    const names = new Set(options.centralIslandNames.map(normalizeIslandName));
    centralIslands = [...islandsById.values()].filter((island) => names.has(normalizeIslandName(island.name)));
    byNames.set(options.centralIslandNames, centralIslands);
  }
  const byIsland = new Map<string, ServiceCandidate>();
  for (const island of centralIslands) {
    const islandServices = services.filter((service) => service.islandId === island.id);
    const service = options.selectService(islandServices);
    if (!service || byIsland.has(island.id)) continue;
    const path = paths.get(island.id) ?? null;
    const coordinates = coordinatesFor(service, island);
    byIsland.set(island.id, {
      island,
      service,
      path,
      distanceM:
        path?.distanceM ?? (coordinates ? geographicDistanceM([origin.longitude, origin.latitude], coordinates) : null)
    });
  }
  return [...byIsland.values()].sort((left, right) => left.island.id.localeCompare(right.island.id));
}

function uniqueRoutes(routes: ServiceRoute[]): ServiceRoute[] {
  const byIsland = new Map<string, ServiceRoute>();
  for (const route of routes) {
    if (!byIsland.has(route.destinationIslandId)) byIsland.set(route.destinationIslandId, route);
  }
  return [...byIsland.values()].sort((left, right) =>
    left.destinationIslandId.localeCompare(right.destinationIslandId)
  );
}

export function resolveServiceRouting(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  options: ServiceRoutingOptions
): ServiceRouting {
  const islandsById = indexedIslands(snapshot);
  const origin = islandsById.get(originIslandId);
  if (!origin) return { canonical: null, overlays: [] };

  let byType = serviceGroupsCache.get(snapshot.services);
  if (!byType) serviceGroupsCache.set(snapshot.services, (byType = new Map()));
  let servicesByIsland = byType.get(options.serviceType);
  if (!servicesByIsland) {
    servicesByIsland = new Map();
    for (const service of snapshot.services) {
      if (service.serviceType !== options.serviceType || service.islandId === null) continue;
      const islandServices = servicesByIsland.get(service.islandId) ?? [];
      islandServices.push(service);
      servicesByIsland.set(service.islandId, islandServices);
    }
    byType.set(options.serviceType, servicesByIsland);
  }
  const services = [...servicesByIsland.values()].flatMap((islandServices) => {
    const service = options.selectService(islandServices);
    return service ? [service] : [];
  });
  const localService = services.find((service) => service.islandId === origin.id) ?? null;
  if (localService) {
    return {
      canonical: routeFromPath({ island: origin, service: localService, path: null, distanceM: 0 }, origin.id, 'local'),
      overlays: []
    };
  }

  const paths = shortestPaths(snapshot, origin.id);
  const connected = nearestConnectedService(origin, services, islandsById, paths);
  const central = centralServiceCandidates(origin, services, islandsById, paths, options).map((candidate) =>
    routeFromPath(candidate, origin.id, 'central')
  );

  if (connected) {
    const canonical = routeFromPath(connected, origin.id, 'connected');
    return {
      canonical,
      overlays: uniqueRoutes(central.filter((route) => route.destinationIslandId !== canonical.destinationIslandId))
    };
  }

  const sameAtoll = nearestSameAtollService(origin, services, islandsById);
  if (sameAtoll) {
    const nearest = routeFromPath(sameAtoll, origin.id, 'same_atoll');
    return { canonical: null, overlays: uniqueRoutes([nearest, ...central]) };
  }

  return { canonical: null, overlays: uniqueRoutes(central) };
}

export function resolveElderlyHospitalRouting(
  snapshot: ScoringSnapshot,
  originIslandId: string
): ElderlyHospitalRouting {
  return cachedServiceRouting(snapshot, `${originIslandId}:health:hospital`, () =>
    resolveServiceRouting(snapshot, originIslandId, {
      serviceType: 'health',
      centralIslandNames: scoringConfig.healthDemandPolicy.centralHospitalIslandNames,
      selectService: (services) =>
        [...services]
          .filter((service) => service.subtype === 'hospital')
          .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null
    })
  );
}

export function resolveEducationRouting(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  requiredSubtype: string
): EducationRouting {
  return cachedServiceRouting(snapshot, `${originIslandId}:education:${requiredSubtype}`, () =>
    resolveServiceRouting(snapshot, originIslandId, {
      serviceType: 'education',
      centralIslandNames: scoringConfig.educationDemandPolicy.centralEducationIslandNames,
      selectService: (services) =>
        [...services]
          .filter((service) => service.subtype === requiredSubtype)
          .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null
    })
  );
}

function cachedServiceRouting(snapshot: ScoringSnapshot, key: string, calculate: () => ServiceRouting): ServiceRouting {
  let routes = routingCache.get(snapshot);
  if (!routes) routingCache.set(snapshot, (routes = new Map()));
  let routing = routes.get(key);
  if (!routing) routes.set(key, (routing = calculate()));
  return routing;
}
