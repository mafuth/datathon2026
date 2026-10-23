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

import { landReachableIslands } from '../mobility/land-topology';
import { scoringConfig } from './config';

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
  outbound: number;
};

type TransferLeg = {
  connectionId: string;
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

function round(value: number): number {
  return Number(value.toFixed(2));
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function populationAmount(snapshot: ScoringSnapshot, islandId: string, category: string): number {
  return (
    snapshot.population.find((record) => record.islandId === islandId && record.ageCategory === category)?.amount ?? 0
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

function stopMode(stop: Pick<TransportStop, 'subtype'>): TransportStopMode {
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
        name: mode === 'air' ? 'Air endpoint — terminal unresolved' : 'Ferry endpoint — terminal unresolved',
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

function accessibleLandIslands(snapshot: ScoringSnapshot, islandId: string): Set<string> {
  let byIsland = directConnectionsCache.get(snapshot);
  if (!byIsland) {
    byIsland = new Map<string, Set<string>>();
    directConnectionsCache.set(snapshot, byIsland);
  }
  const cached = byIsland.get(islandId);
  if (cached) return cached;

  const connected = landReachableIslands(snapshot.connections, islandId);
  for (const connection of snapshot.connections.filter((entry) => entry.scoreEligible !== false)) {
    if (!LAND_CONNECTION_TYPES.has(connection.connectionType)) continue;
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

function connectedIslandIds(snapshot: ScoringSnapshot, stop: TransportStop): string[] {
  let byStop = connectedIslandIdsCache.get(snapshot);
  if (!byStop) {
    byStop = new Map<string, string[]>();
    connectedIslandIdsCache.set(snapshot, byStop);
  }
  const cached = byStop.get(stop.id);
  if (cached) return cached;

  const connected = new Set<string>();
  for (const connection of snapshot.connections) {
    if (connection.scoreEligible === false || connectionMode(connection, true) !== stopMode(stop)) continue;
    if (!connection.routeId || !stop.routeIds.includes(connection.routeId) || connection.sequence === null) continue;
    const pair = resolveConnectionStopPair(connection, snapshot.routeStops, stopsForSnapshot(snapshot));
    if (!pair) continue;
    if (pair.fromStopId === stop.id) connected.add(connection.toIslandId);
    if (pair.toStopId === stop.id && connection.directionality === 'bidirectional')
      connected.add(connection.fromIslandId);
  }
  connected.delete(stop.islandId);
  const result = [...connected].sort();
  byStop.set(stop.id, result);
  return result;
}

export function resolveConnectionStopPair(
  connection: Pick<
    ScoringSnapshot['connections'][number],
    'routeId' | 'sequence' | 'fromIslandId' | 'toIslandId' | 'connectionType'
  >,
  routeStops: ScoringSnapshot['routeStops'],
  stops: Array<Pick<TransportStop, 'id' | 'islandId' | 'subtype' | 'routeIds'>>
): { fromStopId: string; toStopId: string; fromTerminalEvidence: string; toTerminalEvidence: string } | null {
  if (!connection.routeId || connection.sequence === null) return null;
  const sequence = connection.sequence;
  const calls = routeStops.filter((call) => call.routeId === connection.routeId);
  const canonicalFrom = calls.filter(
    (call) => call.sequence === sequence - 1 && call.islandId === connection.fromIslandId
  );
  const canonicalTo = calls.filter((call) => call.sequence === sequence && call.islandId === connection.toIslandId);
  const from = canonicalFrom.length === 1 && canonicalTo.length === 1 ? canonicalFrom : [];
  const to = canonicalFrom.length === 1 && canonicalTo.length === 1 ? canonicalTo : [];
  if (from.length !== 1 || to.length !== 1) {
    const adjacentFrom = calls.filter((call) => call.islandId === connection.fromIslandId);
    const adjacentTo = calls.filter((call) => call.islandId === connection.toIslandId);
    const pairs = adjacentFrom.flatMap((origin) =>
      adjacentTo
        .filter((destination) => Math.abs(destination.sequence - origin.sequence) === 1)
        .map((destination) => ({ origin, destination }))
    );
    if (pairs.length !== 1) return null;
    const pair = pairs[0];
    const mode =
      connection.connectionType === 'air' ? 'air' : connection.connectionType === 'ferry' ? 'marine' : 'land';
    if (
      ![pair.origin, pair.destination].every((call) =>
        stops.some(
          (stop) =>
            stop.id === call.stopId &&
            stop.islandId === call.islandId &&
            stopMode(stop) === mode &&
            stop.routeIds.includes(call.routeId)
        )
      )
    )
      return null;
    return {
      fromStopId: pair.origin.stopId,
      toStopId: pair.destination.stopId,
      fromTerminalEvidence: pair.origin.terminalEvidence ?? 'Ordered operator route-stop record',
      toTerminalEvidence: pair.destination.terminalEvidence ?? 'Ordered operator route-stop record'
    };
  }
  const mode = connection.connectionType === 'air' ? 'air' : connection.connectionType === 'ferry' ? 'marine' : 'land';
  if (
    ![from[0], to[0]].every((call) =>
      stops.some(
        (stop) =>
          stop.id === call.stopId &&
          stop.islandId === call.islandId &&
          stopMode(stop) === mode &&
          stop.routeIds.includes(call.routeId)
      )
    )
  )
    return null;
  return {
    fromStopId: from[0].stopId,
    toStopId: to[0].stopId,
    fromTerminalEvidence: from[0].terminalEvidence ?? 'Ordered operator route-stop record',
    toTerminalEvidence: to[0].terminalEvidence ?? 'Ordered operator route-stop record'
  };
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
    if (accessibleLandIslands(snapshot, originIslandId).has(stop.islandId)) return true;
    return stop.routeIds.some((routeId) => islandsByRoute.get(routeId)?.has(originIslandId));
  });
  if (candidates.length > 0) return candidates;

  const localStops = stops.filter((stop) => stop.islandId === originIslandId);
  if (localStops.length > 0) return localStops;
  return stops.filter((stop) => accessibleLandIslands(snapshot, originIslandId).has(stop.islandId));
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
    const result = pathConnectionIds.flatMap((connectionId, index) => {
      const connection = connectionById.get(connectionId);
      const mode = connection ? connectionMode(connection, includeLand) : null;
      const originIslandId = pathIslandIds[index];
      const destinationIslandId = pathIslandIds[index + 1];
      const eligible =
        connection &&
        connection.scoreEligible !== false &&
        ((connection.fromIslandId === originIslandId && connection.toIslandId === destinationIslandId) ||
          (connection.directionality === 'bidirectional' &&
            connection.toIslandId === originIslandId &&
            connection.fromIslandId === destinationIslandId));
      return eligible && mode && originIslandId && destinationIslandId
        ? [{ connectionId, mode, originIslandId, destinationIslandId }]
        : [];
    });
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
  // Emergency need overlaps the younger and elderly cohorts. Only add the
  // residual on the same hospital path, never a second copy of those residents.
  for (const emergency of result.byOriginNeed.values()) {
    if (
      emergency.category !== 'health' ||
      emergency.needKey !== 'hospital_emergency' ||
      !emergency.knownConnectivity ||
      !emergency.destinationIslandId ||
      emergency.destinationIslandId === emergency.originIslandId
    )
      continue;
    const alreadyAllocated = allocations
      .filter(
        (allocation) =>
          allocation.originIslandId === emergency.originIslandId &&
          allocation.destinationIslandId === emergency.destinationIslandId &&
          (allocation.pathConnectionIds ?? []).join('|') === (emergency.pathConnectionIds ?? []).join('|')
      )
      .reduce((sum, allocation) => sum + allocation.demand, 0);
    const demand = Math.max(0, emergency.demand - alreadyAllocated);
    if (demand > 0) allocations.push({ ...emergency, demand });
  }
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
  unresolvedIslands: Set<string>,
  field: 'careTransfer' | 'educationTransfer'
): number {
  const demandByAllocation = new Map<string, number>();
  for (const allocation of allocations) {
    const legs = transferLegs(snapshot, allocation, field === 'educationTransfer');
    for (const [legIndex, leg] of legs.entries()) {
      const connection = connectionsById(snapshot).get(leg.connectionId);
      if (!connection) continue;
      const pair = resolveConnectionStopPair(connection, snapshot.routeStops, allStops);
      // Island connectivity does not establish which terminal serves the route.
      if (!pair) {
        unresolvedIslands.add(leg.originIslandId);
        unresolvedIslands.add(leg.destinationIslandId);
        continue;
      }
      const departureId = connection.fromIslandId === leg.originIslandId ? pair.fromStopId : pair.toStopId;
      const endpoints = [
        { stopId: pair.fromStopId, islandId: connection.fromIslandId, evidence: pair.fromTerminalEvidence },
        { stopId: pair.toStopId, islandId: connection.toIslandId, evidence: pair.toTerminalEvidence }
      ];
      // Preserve the existing pressure units: one allocation per leg, divided
      // between departure and arrival. Outbound is a subset, not extra demand.
      const share = allocation.demand / 2;
      const key = `${allocationKey(allocation)}:${legIndex}`;
      if (demandByAllocation.has(key)) continue;
      let attributed = 0;
      for (const { stopId, islandId, evidence } of endpoints) {
        // RTL can identify an island call while explicitly leaving its physical
        // terminal unresolved. Preserve the known endpoint's half, but never
        // assign the other half to a synthetic stop or a nearby physical jetty.
        if (evidence.toLowerCase().includes('unresolved') || stopId.startsWith('virtual:')) {
          unresolvedIslands.add(islandId);
          continue;
        }
        const accumulator = accumulators.get(stopId);
        if (accumulator) {
          accumulator[field] += share;
          if (stopId === departureId) accumulator.outbound += share;
          attributed += share;
        }
      }
      demandByAllocation.set(key, attributed);
    }
  }
  return round([...demandByAllocation.values()].reduce((sum, value) => sum + value, 0));
}

export function calculateTransportDemand(
  islandId: string,
  snapshot: ScoringSnapshot,
  demandAllocations: DemandAllocationResult
): TransportDemandResult {
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
      accessibleLandIslands(snapshot, islandId).has(stop.islandId)
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
      educationTransfer: 0,
      outbound: 0
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

  const unresolvedIslands = new Set<string>();
  const careTransferDemand = addTransferDemand(
    snapshot,
    careAllocations(demandAllocations),
    accumulators,
    allStops,
    unresolvedIslands,
    'careTransfer'
  );
  const educationTransferDemand = addTransferDemand(
    snapshot,
    educationAllocations(demandAllocations),
    accumulators,
    allStops,
    unresolvedIslands,
    'educationTransfer'
  );
  const unservedOrigins = new Set(
    [...demandAllocations.byOriginNeed.values()]
      .filter((allocation) => allocation.demand > 0 && allocation.destinationIslandId === null)
      .map((allocation) => allocation.originIslandId)
  );

  const demandStops: TransportDemandStop[] = stops.map((stop) => {
    const accumulator = accumulators.get(stop.id) as StopAccumulator;
    const mode = stopMode(stop);
    const connected = connectedIslandIds(snapshot, stop);
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
      departureTransferDemand:
        (unresolvedIslands.has(stop.islandId) || unservedOrigins.has(stop.islandId)) && accumulator.outbound === 0
          ? null
          : round(accumulator.outbound),
      arrivalTransferDemand:
        unresolvedIslands.has(stop.islandId) &&
        accumulator.careTransfer + accumulator.educationTransfer - accumulator.outbound === 0
          ? null
          : round(accumulator.careTransfer + accumulator.educationTransfer - accumulator.outbound),
      outboundDemand:
        (unresolvedIslands.has(stop.islandId) || unservedOrigins.has(stop.islandId)) && accumulator.outbound === 0
          ? null
          : round(accumulator.outbound),
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
        'Stop capacity and passenger counts are estimated because validated transport capacity is unavailable; transfer pressure is split equally between recorded departure and arrival terminals. Outbound is the departure share of transfer pressure, not an additional passenger count.' +
        (unresolvedIslands.has(stop.islandId)
          ? ' Some transfer demand is unavailable at terminal level because ordered route-stop evidence is missing; it has not been distributed to other terminals.'
          : '') +
        (unservedOrigins.has(stop.islandId)
          ? ' Some outbound service need has no eligible connection to an appropriate facility and remains unserved; no terminal demand is inferred for it.'
          : '')
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
    outboundDemand: stop.outboundDemand,
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
    limitations: [
      ...(stops.some((stop) => unresolvedIslands.has(stop.islandId))
        ? [
            'Some service transfer demand is unavailable at terminal level: eligible island connections lack ordered terminal attribution. No substitute terminal or route is inferred.'
          ]
        : []),
      ...(unservedOrigins.has(islandId)
        ? [
            'Some outbound service need has no eligible connection to an appropriate facility. It remains unserved and is unavailable as terminal transfer demand.'
          ]
        : [])
    ],
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

export function buildTransportInfrastructure(snapshot: ScoringSnapshot): Array<{
  id: string;
  islandId: string;
  name: string | null;
  subtype: string;
  mode: TransportStopMode;
  routeIds: string[];
  connectedIslandIds: string[];
}> {
  const allStops = stopsForSnapshot(snapshot);
  return allStops.flatMap((stop) => {
    const mode = stopMode(stop);
    if (!mode) return [];
    return [
      {
        id: stop.id,
        islandId: stop.islandId,
        name: stop.name,
        subtype: stop.subtype,
        mode,
        routeIds: stop.routeIds,
        connectedIslandIds: connectedIslandIds(snapshot, stop)
      }
    ];
  });
}

function allocationKey(allocation: DemandAllocation): string {
  return `${allocation.originIslandId}:${allocation.category}:${allocation.needKey}:${allocation.destinationIslandId ?? 'unserved'}:${(
    allocation.pathConnectionIds ?? []
  ).join('|')}`;
}
