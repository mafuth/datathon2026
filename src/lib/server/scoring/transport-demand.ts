import type {
  DemandAllocation,
  DemandAllocationResult,
  HubDemandImpact,
  ScoringSnapshot,
  TransportDemandModeSummary,
  TransportDemandResult,
  TransportDemandStop,
  TransportStop,
  TransportStopMode
} from './types';

import { scoringConfig } from './config';
import { calculationSnapshot } from './scoring-snapshot';
import { indexedIslands, indexedPopulation } from './snapshot-index';

type CohortDemand = {
  working: number;
  students: number;
  elderly: number;
};

type StopAccumulator = {
  localDemand: number;
  connectedDemand: number;
  working: number;
  students: number;
  elderly: number;
  careTransfer: number;
  educationTransfer: number;
};

type TransferLeg = {
  mode: TransportStopMode;
  originIslandId: string;
  destinationIslandId: string;
};

const LAND_STOP_TYPES = new Set(['bus_station', 'bus_stop', 'public_transport']);
const MARINE_STOP_TYPES = new Set(['port', 'jetty']);
const AIR_STOP_TYPES = new Set(['airport', 'air_terminal', 'helipad']);
const LAND_CONNECTION_TYPES = new Set(['bridge', 'bus', 'causeway', 'land_link']);
const transportDemandCache = new WeakMap<
  ScoringSnapshot,
  WeakMap<DemandAllocationResult, Map<string, TransportDemandResult>>
>();
const stopsCache = new WeakMap<ScoringSnapshot, TransportStop[]>();
const routeIslandsCache = new WeakMap<ScoringSnapshot, Map<string, Set<string>>>();
const directConnectionsCache = new WeakMap<ScoringSnapshot, Map<string, Set<string>>>();
const cohortDemandCache = new WeakMap<ScoringSnapshot, Map<string, CohortDemand>>();
const connectionsByIdCache = new WeakMap<ScoringSnapshot, Map<string, ScoringSnapshot['connections'][number]>>();
const connectedIslandIdsCache = new WeakMap<ScoringSnapshot, Map<string, string[]>>();
const careAllocationsCache = new WeakMap<DemandAllocationResult, DemandAllocation[]>();
const educationAllocationsCache = new WeakMap<DemandAllocationResult, DemandAllocation[]>();
const transferLegsCache = new WeakMap<ScoringSnapshot, WeakMap<DemandAllocation, Map<boolean, TransferLeg[]>>>();
const endpointStopsCache = new WeakMap<ScoringSnapshot, WeakMap<TransportStop[], Map<string, TransportStop[]>>>();

function round(value: number): number {
  return Number(value.toFixed(2));
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function populationAmount(snapshot: ScoringSnapshot, islandId: string, category: string): number {
  return (
    indexedPopulation(snapshot)
      .get(islandId)
      ?.find((record) => record.ageCategory === category)?.amount ?? 0
  );
}

function cohortDemand(snapshot: ScoringSnapshot, islandId: string): CohortDemand {
  let byIsland = cohortDemandCache.get(snapshot);
  if (!byIsland) {
    byIsland = new Map<string, CohortDemand>();
    cohortDemandCache.set(snapshot, byIsland);
  }
  const cached = byIsland.get(islandId);
  if (cached) return cached;

  const children =
    populationAmount(snapshot, islandId, 'child_population_0_14') ||
    populationAmount(snapshot, islandId, 'child_population_0_17');
  const adolescents = populationAmount(snapshot, islandId, 'adolescent_population_10_19') || children;
  const youth =
    populationAmount(snapshot, islandId, 'youth_population_18_35') ||
    populationAmount(snapshot, islandId, 'youth_population_15_24');

  const result = {
    working: populationAmount(snapshot, islandId, 'working_age_population_15_64'),
    students: children + adolescents + youth,
    elderly: populationAmount(snapshot, islandId, 'elderly_population_65_plus')
  };
  byIsland.set(islandId, result);
  return result;
}

function stopMode(stop: TransportStop): TransportStopMode {
  if (AIR_STOP_TYPES.has(stop.subtype)) return 'air';
  if (MARINE_STOP_TYPES.has(stop.subtype)) return 'marine';
  return 'land';
}

function stopsForSnapshot(snapshot: ScoringSnapshot): TransportStop[] {
  const cached = stopsCache.get(snapshot);
  if (cached) return cached;

  const stops = snapshot.transportStops?.length
    ? [...snapshot.transportStops]
    : snapshot.services.flatMap((service) => {
        if (service.serviceType !== 'transport' || !service.islandId) return [];
        if (
          !LAND_STOP_TYPES.has(service.subtype) &&
          !MARINE_STOP_TYPES.has(service.subtype) &&
          !AIR_STOP_TYPES.has(service.subtype)
        ) {
          return [];
        }
        return [
          {
            id: service.id,
            name: service.name,
            islandId: service.islandId,
            subtype: service.subtype,
            latitude: service.latitude,
            longitude: service.longitude,
            routeIds: []
          }
        ];
      });
  const stopKeys = new Set(stops.map((stop) => `${stop.islandId}:${stopMode(stop)}`));
  for (const connection of snapshot.connections.filter((entry) => entry.scoreEligible !== false)) {
    const mode = connection.connectionType === 'air' ? 'air' : connection.connectionType === 'ferry' ? 'marine' : null;
    if (!mode) continue;
    for (const islandId of [connection.fromIslandId, connection.toIslandId]) {
      const key = `${islandId}:${mode}`;
      if (stopKeys.has(key)) continue;
      stops.push({
        id: `virtual:${mode}:${islandId}`,
        name: mode === 'air' ? 'Air transfer point' : 'Ferry transfer point',
        islandId,
        subtype: mode === 'air' ? 'airport' : 'port',
        latitude: null,
        longitude: null,
        routeIds: connection.routeId ? [connection.routeId] : []
      });
      stopKeys.add(key);
    }
  }
  stopsCache.set(snapshot, stops);
  return stops;
}

function routeIslands(snapshot: ScoringSnapshot): Map<string, Set<string>> {
  const cached = routeIslandsCache.get(snapshot);
  if (cached) return cached;

  const islandsByRoute = new Map<string, Set<string>>();
  for (const entry of snapshot.routeStops ?? []) {
    const islands = islandsByRoute.get(entry.routeId) ?? new Set<string>();
    islands.add(entry.islandId);
    islandsByRoute.set(entry.routeId, islands);
  }
  routeIslandsCache.set(snapshot, islandsByRoute);
  return islandsByRoute;
}

function directlyConnectedIslands(snapshot: ScoringSnapshot, islandId: string): Set<string> {
  let byIsland = directConnectionsCache.get(snapshot);
  if (!byIsland) {
    byIsland = new Map<string, Set<string>>();
    directConnectionsCache.set(snapshot, byIsland);
  }
  const cached = byIsland.get(islandId);
  if (cached) return cached;

  const connected = new Set<string>();
  for (const connection of snapshot.connections.filter((entry) => entry.scoreEligible !== false)) {
    if (connection.fromIslandId === islandId) connected.add(connection.toIslandId);
    if (connection.toIslandId === islandId && connection.directionality === 'bidirectional') {
      connected.add(connection.fromIslandId);
    }
  }
  byIsland.set(islandId, connected);
  return connected;
}

function connectionsById(snapshot: ScoringSnapshot): Map<string, ScoringSnapshot['connections'][number]> {
  const cached = connectionsByIdCache.get(snapshot);
  if (cached) return cached;

  const result = new Map(snapshot.connections.map((connection) => [connection.id, connection]));
  connectionsByIdCache.set(snapshot, result);
  return result;
}

function connectedIslandIds(
  snapshot: ScoringSnapshot,
  stop: TransportStop,
  islandsByRoute: Map<string, Set<string>>
): string[] {
  let byStop = connectedIslandIdsCache.get(snapshot);
  if (!byStop) {
    byStop = new Map<string, string[]>();
    connectedIslandIdsCache.set(snapshot, byStop);
  }
  const cached = byStop.get(stop.id);
  if (cached) return cached;

  const connected = new Set<string>();
  for (const routeId of stop.routeIds) {
    for (const islandId of islandsByRoute.get(routeId) ?? []) {
      if (islandId !== stop.islandId) connected.add(islandId);
    }
  }
  for (const islandId of directlyConnectedIslands(snapshot, stop.islandId)) connected.add(islandId);
  const result = [...connected].sort();
  byStop.set(stop.id, result);
  return result;
}

function routeLinksIslands(
  stop: TransportStop,
  originIslandId: string,
  destinationIslandId: string,
  islandsByRoute: Map<string, Set<string>>
): boolean {
  return stop.routeIds.some((routeId) => {
    const islands = islandsByRoute.get(routeId);
    return Boolean(islands?.has(originIslandId) && islands.has(destinationIslandId));
  });
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function preferredDestinationStops(
  snapshot: ScoringSnapshot,
  candidates: TransportStop[],
  mode: TransportStopMode,
  destinationIslandId: string
): TransportStop[] {
  const destination = indexedIslands(snapshot).get(destinationIslandId);
  const destinationName = destination ? normalizeLabel(destination.name) : '';
  const hubRouting = scoringConfig.transportDemandPolicy.hospitalHubRouting;

  if (mode === 'air' && destinationName === 'hulhule') {
    const preferred = candidates.filter(
      (stop) =>
        hubRouting.hulhuleAirportStopIds.some((id) => id === stop.id) ||
        (stop.subtype === 'airport' &&
          hubRouting.hulhuleAirportNameTokens.some((token) =>
            normalizeLabel(stop.name ?? '').includes(normalizeLabel(token))
          ))
    );
    return preferred.length > 0 ? preferred : candidates.filter((stop) => stop.subtype === 'airport');
  }

  if (mode === 'marine' && destinationName === 'male') {
    const named = candidates.filter((stop) => stop.name !== null);
    const preferred = named.filter((stop) =>
      hubRouting.maleMarineStopNameAliases.some((alias) =>
        normalizeLabel(stop.name ?? '').includes(normalizeLabel(alias))
      )
    );
    if (preferred.length > 0) return preferred;
    const fallback = named.filter((stop) =>
      hubRouting.maleMarineStopNameTokens.some((token) =>
        normalizeLabel(stop.name ?? '').includes(normalizeLabel(token))
      )
    );
    return fallback.length > 0 ? fallback : candidates;
  }

  return candidates;
}

function eligibleStops(
  snapshot: ScoringSnapshot,
  originIslandId: string,
  stops: TransportStop[],
  islandsByRoute: Map<string, Set<string>>
): TransportStop[] {
  const candidates = stops.filter((stop) => {
    if (stopMode(stop) !== 'land') return false;
    if (stop.islandId === originIslandId) return true;
    if (stop.routeIds.length > 0) {
      return stop.routeIds.some((routeId) => islandsByRoute.get(routeId)?.has(originIslandId));
    }
    return (
      stop.routeIds.some((routeId) => islandsByRoute.get(routeId)?.has(originIslandId)) ||
      directlyConnectedIslands(snapshot, stop.islandId).has(originIslandId)
    );
  });
  if (candidates.length > 0) return candidates;

  const localStops = stops.filter((stop) => stop.islandId === originIslandId);
  if (localStops.length > 0) return localStops;
  return stops.filter((stop) => directlyConnectedIslands(snapshot, originIslandId).has(stop.islandId));
}

function endpointStops(
  snapshot: ScoringSnapshot,
  stops: TransportStop[],
  mode: TransportStopMode,
  originIslandId: string,
  destinationIslandId: string,
  islandsByRoute: Map<string, Set<string>>
): TransportStop[] {
  let byStops = endpointStopsCache.get(snapshot);
  if (!byStops) {
    byStops = new WeakMap<TransportStop[], Map<string, TransportStop[]>>();
    endpointStopsCache.set(snapshot, byStops);
  }
  let byEndpoint = byStops.get(stops);
  if (!byEndpoint) {
    byEndpoint = new Map<string, TransportStop[]>();
    byStops.set(stops, byEndpoint);
  }
  const key = JSON.stringify([mode, originIslandId, destinationIslandId]);
  const cached = byEndpoint.get(key);
  if (cached) return cached;

  const linked = stops.filter(
    (stop) =>
      stopMode(stop) === mode &&
      (stop.islandId === originIslandId || stop.islandId === destinationIslandId) &&
      routeLinksIslands(stop, originIslandId, destinationIslandId, islandsByRoute)
  );
  const candidates =
    linked.length > 0
      ? linked
      : stops.filter(
          (stop) =>
            stopMode(stop) === mode && (stop.islandId === originIslandId || stop.islandId === destinationIslandId)
        );
  const destinationCandidates = candidates.filter((stop) => stop.islandId === destinationIslandId);
  const preferredDestination = preferredDestinationStops(snapshot, destinationCandidates, mode, destinationIslandId);
  if (preferredDestination.length === 0 || preferredDestination.length === destinationCandidates.length) {
    byEndpoint.set(key, candidates);
    return candidates;
  }

  const preferredIds = new Set(preferredDestination.map((stop) => stop.id));
  const result = candidates.filter((stop) => stop.islandId === originIslandId || preferredIds.has(stop.id));
  byEndpoint.set(key, result);
  return result;
}

function connectionMode(
  connection: ScoringSnapshot['connections'][number],
  includeLand: boolean
): TransportStopMode | null {
  if (connection.connectionType === 'ferry') return 'marine';
  if (connection.connectionType === 'air') return 'air';
  if (includeLand && LAND_CONNECTION_TYPES.has(connection.connectionType)) return 'land';
  return null;
}

function transferLegs(snapshot: ScoringSnapshot, allocation: DemandAllocation, includeLand: boolean): TransferLeg[] {
  let byAllocation = transferLegsCache.get(snapshot);
  if (!byAllocation) {
    byAllocation = new WeakMap<DemandAllocation, Map<boolean, TransferLeg[]>>();
    transferLegsCache.set(snapshot, byAllocation);
  }
  let byMode = byAllocation.get(allocation);
  if (!byMode) {
    byMode = new Map<boolean, TransferLeg[]>();
    byAllocation.set(allocation, byMode);
  }
  const cached = byMode.get(includeLand);
  if (cached) return cached;

  const pathIslandIds = allocation.pathIslandIds ?? [];
  const pathConnectionIds = allocation.pathConnectionIds ?? [];
  if (pathConnectionIds.length > 0 && pathIslandIds.length === pathConnectionIds.length + 1) {
    const connectionById = connectionsById(snapshot);
    const result: TransferLeg[] = pathConnectionIds.flatMap((connectionId, index) => {
      const connection = connectionById.get(connectionId);
      const mode = connection ? connectionMode(connection, includeLand) : null;
      const originIslandId = pathIslandIds[index];
      const destinationIslandId = pathIslandIds[index + 1];
      return mode && originIslandId && destinationIslandId ? [{ mode, originIslandId, destinationIslandId }] : [];
    });
    byMode.set(includeLand, result);
    return result;
  }

  if (
    allocation.destinationIslandId &&
    allocation.destinationIslandId !== allocation.originIslandId &&
    (allocation.routeType === 'marine' || allocation.routeType === 'airport')
  ) {
    const result: TransferLeg[] = [
      {
        mode: allocation.routeType === 'airport' ? 'air' : 'marine',
        originIslandId: allocation.originIslandId,
        destinationIslandId: allocation.destinationIslandId
      }
    ];
    byMode.set(includeLand, result);
    return result;
  }

  const result: TransferLeg[] = [];
  byMode.set(includeLand, result);
  return result;
}

function modeHubType(mode: TransportStopMode): HubDemandImpact['hubType'] {
  if (mode === 'air') return 'airport';
  if (mode === 'marine') return 'ferry_terminal';
  return 'land_gateway';
}

function careAllocations(result: DemandAllocationResult): DemandAllocation[] {
  const cached = careAllocationsCache.get(result);
  if (cached) return cached;

  const allocations = [
    ...(result.byOriginCohort?.values() ?? []),
    ...(result.hospitalOverlays ?? []).filter((allocation) => allocation.knownConnectivity)
  ].filter(
    (allocation) =>
      allocation.category === 'health' &&
      allocation.destinationIslandId !== null &&
      allocation.destinationIslandId !== allocation.originIslandId &&
      ((allocation.pathConnectionIds?.length ?? 0) > 0 ||
        allocation.routeType === 'marine' ||
        allocation.routeType === 'airport')
  );
  careAllocationsCache.set(result, allocations);
  return allocations;
}

function educationAllocations(result: DemandAllocationResult): DemandAllocation[] {
  const cached = educationAllocationsCache.get(result);
  if (cached) return cached;

  const allocations = [
    ...(result.byOriginCohort?.values() ?? []),
    ...(result.educationOverlays ?? []).filter((allocation) => allocation.knownConnectivity)
  ].filter(
    (allocation) =>
      allocation.category === 'education' &&
      allocation.destinationIslandId !== null &&
      allocation.destinationIslandId !== allocation.originIslandId &&
      ((allocation.pathConnectionIds?.length ?? 0) > 0 ||
        allocation.routeType === 'marine' ||
        allocation.routeType === 'airport')
  );
  educationAllocationsCache.set(result, allocations);
  return allocations;
}

function addTransferDemand(
  snapshot: ScoringSnapshot,
  allocations: DemandAllocation[],
  accumulators: Map<string, StopAccumulator>,
  allStops: TransportStop[],
  islandsByRoute: Map<string, Set<string>>,
  field: 'careTransfer' | 'educationTransfer'
): number {
  const demandByAllocation = new Map<string, number>();
  for (const allocation of allocations) {
    const legs = transferLegs(snapshot, allocation, field === 'educationTransfer');
    for (const [legIndex, leg] of legs.entries()) {
      const endpoints = endpointStops(
        snapshot,
        allStops,
        leg.mode,
        leg.originIslandId,
        leg.destinationIslandId,
        islandsByRoute
      );
      if (endpoints.length === 0) continue;
      const share = allocation.demand / endpoints.length;
      demandByAllocation.set(`${allocationKey(allocation)}:${legIndex}`, allocation.demand);
      for (const stop of endpoints) {
        const accumulator = accumulators.get(stop.id);
        if (accumulator) accumulator[field] += share;
      }
    }
  }
  return round([...demandByAllocation.values()].reduce((sum, value) => sum + value, 0));
}

export function calculateTransportDemand(
  islandId: string,
  snapshot: ScoringSnapshot,
  demandAllocations: DemandAllocationResult
): TransportDemandResult {
  snapshot = calculationSnapshot(snapshot);
  let byAllocation = transportDemandCache.get(snapshot);
  if (!byAllocation) {
    byAllocation = new WeakMap<DemandAllocationResult, Map<string, TransportDemandResult>>();
    transportDemandCache.set(snapshot, byAllocation);
  }
  let byIsland = byAllocation.get(demandAllocations);
  if (!byIsland) {
    byIsland = new Map<string, TransportDemandResult>();
    byAllocation.set(demandAllocations, byIsland);
  }
  const cached = byIsland.get(islandId);
  if (cached) return cached;

  const allStops = stopsForSnapshot(snapshot);
  const islandsByRoute = routeIslands(snapshot);
  const stops = allStops.filter(
    (stop) =>
      stop.islandId === islandId ||
      stop.routeIds.some((routeId) => islandsByRoute.get(routeId)?.has(islandId)) ||
      directlyConnectedIslands(snapshot, stop.islandId).has(islandId)
  );
  const accumulators = new Map<string, StopAccumulator>();
  for (const stop of stops) {
    accumulators.set(stop.id, {
      localDemand: 0,
      connectedDemand: 0,
      working: 0,
      students: 0,
      elderly: 0,
      careTransfer: 0,
      educationTransfer: 0
    });
  }

  const contributingIslands = new Set<string>();
  for (const island of snapshot.islands.filter((entry) => entry.islandType === 'inhabited')) {
    const candidates = eligibleStops(snapshot, island.id, stops, islandsByRoute);
    if (candidates.length === 0) continue;
    contributingIslands.add(island.id);
    const cohorts = cohortDemand(snapshot, island.id);
    const share = 1 / candidates.length;
    for (const stop of candidates) {
      const accumulator = accumulators.get(stop.id);
      if (!accumulator) continue;
      const demand = cohorts.working + cohorts.students + cohorts.elderly;
      if (stop.islandId === island.id) accumulator.localDemand += demand * share;
      else accumulator.connectedDemand += demand * share;
      accumulator.working += cohorts.working * share;
      accumulator.students += cohorts.students * share;
      accumulator.elderly += cohorts.elderly * share;
    }
  }

  const careTransferDemand = addTransferDemand(
    snapshot,
    careAllocations(demandAllocations),
    accumulators,
    allStops,
    islandsByRoute,
    'careTransfer'
  );
  const educationTransferDemand = addTransferDemand(
    snapshot,
    educationAllocations(demandAllocations),
    accumulators,
    allStops,
    islandsByRoute,
    'educationTransfer'
  );

  const demandStops: TransportDemandStop[] = stops.map((stop) => {
    const accumulator = accumulators.get(stop.id) as StopAccumulator;
    const mode = stopMode(stop);
    const connected = connectedIslandIds(snapshot, stop, islandsByRoute);
    const servedPopulation = [stop.islandId, ...connected].reduce((sum, sourceIslandId) => {
      const cohorts = cohortDemand(snapshot, sourceIslandId);
      return sum + cohorts.working + cohorts.students + cohorts.elderly;
    }, 0);
    const capacity = Math.max(
      1,
      (servedPopulation / Math.max(1, stops.length)) * scoringConfig.transportStopCapacityProxyByMode[mode]
    );
    const totalDemand =
      accumulator.working +
      accumulator.students +
      accumulator.elderly +
      accumulator.careTransfer +
      accumulator.educationTransfer;
    const loadRatio = totalDemand / capacity;
    const factor = Math.max(
      scoringConfig.minimumTransportStopFactor,
      1 - scoringConfig.transportDemandImpact * loadRatio
    );
    return {
      stopId: stop.id,
      stopName: stop.name,
      islandId: stop.islandId,
      subtype: stop.subtype,
      mode,
      routeIds: stop.routeIds,
      connectedIslandIds: connected,
      localDemand: round(accumulator.localDemand),
      connectedDemand: round(accumulator.connectedDemand),
      workingDemand: round(accumulator.working),
      studentDemand: round(accumulator.students),
      elderlyDemand: round(accumulator.elderly),
      careTransferDemand: round(accumulator.careTransfer),
      educationTransferDemand: round(accumulator.educationTransfer),
      totalDemand: round(totalDemand),
      capacity: round(capacity),
      loadRatio: round(loadRatio),
      score: round(factor * 100),
      status: 'partial',
      limitation:
        'Stop capacity and passenger counts are estimated because validated transport capacity is unavailable; resident cohorts are allocated once and only known hospital or education routes add transfer demand.'
    };
  });

  const modeSummary = (mode: TransportStopMode): TransportDemandModeSummary => {
    const entries = demandStops.filter((stop) => stop.mode === mode);
    return {
      stopCount: entries.length,
      totalDemand: round(entries.reduce((sum, stop) => sum + stop.totalDemand, 0)),
      careTransferDemand: round(entries.reduce((sum, stop) => sum + stop.careTransferDemand, 0)),
      educationTransferDemand: round(entries.reduce((sum, stop) => sum + stop.educationTransferDemand, 0)),
      averageLoad: average(entries.map((stop) => stop.loadRatio * 100)),
      score: average(entries.map((stop) => stop.score))
    };
  };
  const modes = { land: modeSummary('land'), marine: modeSummary('marine'), air: modeSummary('air') };
  const allCohorts = [...contributingIslands].reduce(
    (total, sourceIslandId) => {
      const cohorts = cohortDemand(snapshot, sourceIslandId);
      return {
        working: total.working + cohorts.working,
        students: total.students + cohorts.students,
        elderly: total.elderly + cohorts.elderly
      };
    },
    { working: 0, students: 0, elderly: 0 }
  );
  const score = average(demandStops.map((stop) => stop.score));
  const averageLoad = average(demandStops.map((stop) => stop.loadRatio * 100));
  const hubImpacts = demandStops.map((stop): HubDemandImpact => ({
    hubId: stop.stopId,
    hubType: modeHubType(stop.mode),
    localDemand: stop.localDemand,
    incomingDemand: stop.connectedDemand,
    outboundDemand: 0,
    transferDemand: round(stop.careTransferDemand + stop.educationTransferDemand),
    careTransferDemand: stop.careTransferDemand,
    educationTransferDemand: stop.educationTransferDemand,
    totalDemand: stop.totalDemand,
    capacity: stop.capacity,
    pressure: stop.loadRatio,
    factor: stop.score / 100,
    scoreImpact: round(100 - stop.score),
    status: stop.status,
    limitation: stop.limitation
  }));

  const result = {
    workingDemand: round(allCohorts.working),
    studentDemand: round(allCohorts.students),
    elderlyDemand: round(allCohorts.elderly),
    careTransferDemand,
    educationTransferDemand,
    totalDemand: round(
      allCohorts.working + allCohorts.students + allCohorts.elderly + careTransferDemand + educationTransferDemand
    ),
    averageLoad,
    score,
    modes,
    stops: demandStops,
    hubImpacts
  };
  byIsland.set(islandId, result);
  return result;
}

function allocationKey(allocation: DemandAllocation): string {
  return `${allocation.originIslandId}:${allocation.category}:${allocation.needKey}:${allocation.destinationIslandId ?? 'unserved'}:${(
    allocation.pathConnectionIds ?? []
  ).join('|')}`;
}
