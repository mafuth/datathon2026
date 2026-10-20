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
};

const LAND_STOP_TYPES = new Set(['bus_station', 'bus_stop', 'public_transport']);
const MARINE_STOP_TYPES = new Set(['port', 'jetty']);
const AIR_STOP_TYPES = new Set(['airport', 'air_terminal', 'helipad']);

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
  const children =
    populationAmount(snapshot, islandId, 'child_population_0_14') ||
    populationAmount(snapshot, islandId, 'child_population_0_17');
  const adolescents = populationAmount(snapshot, islandId, 'adolescent_population_10_19');
  const youth =
    populationAmount(snapshot, islandId, 'youth_population_18_35') ||
    populationAmount(snapshot, islandId, 'youth_population_15_24');

  return {
    working: populationAmount(snapshot, islandId, 'working_age_population_15_64'),
    students: children + adolescents + youth,
    elderly: populationAmount(snapshot, islandId, 'elderly_population_65_plus')
  };
}

function stopMode(stop: TransportStop): TransportStopMode {
  if (AIR_STOP_TYPES.has(stop.subtype)) return 'air';
  if (MARINE_STOP_TYPES.has(stop.subtype)) return 'marine';
  return 'land';
}

function stopsForSnapshot(snapshot: ScoringSnapshot): TransportStop[] {
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
  return stops;
}

function routeIslands(snapshot: ScoringSnapshot): Map<string, Set<string>> {
  const islandsByRoute = new Map<string, Set<string>>();
  for (const entry of snapshot.routeStops ?? []) {
    const islands = islandsByRoute.get(entry.routeId) ?? new Set<string>();
    islands.add(entry.islandId);
    islandsByRoute.set(entry.routeId, islands);
  }
  return islandsByRoute;
}

function directlyConnectedIslands(snapshot: ScoringSnapshot, islandId: string): Set<string> {
  const connected = new Set<string>();
  for (const connection of snapshot.connections.filter((entry) => entry.scoreEligible !== false)) {
    if (connection.fromIslandId === islandId) connected.add(connection.toIslandId);
    if (connection.toIslandId === islandId && connection.directionality === 'bidirectional') {
      connected.add(connection.fromIslandId);
    }
  }
  return connected;
}

function connectedIslandIds(
  snapshot: ScoringSnapshot,
  stop: TransportStop,
  islandsByRoute: Map<string, Set<string>>
): string[] {
  const connected = new Set<string>();
  for (const routeId of stop.routeIds) {
    for (const islandId of islandsByRoute.get(routeId) ?? []) {
      if (islandId !== stop.islandId) connected.add(islandId);
    }
  }
  for (const islandId of directlyConnectedIslands(snapshot, stop.islandId)) connected.add(islandId);
  return [...connected].sort();
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
  stops: TransportStop[],
  mode: TransportStopMode,
  originIslandId: string,
  destinationIslandId: string,
  islandsByRoute: Map<string, Set<string>>
): TransportStop[] {
  const linked = stops.filter(
    (stop) =>
      stopMode(stop) === mode &&
      (stop.islandId === originIslandId || stop.islandId === destinationIslandId) &&
      routeLinksIslands(stop, originIslandId, destinationIslandId, islandsByRoute)
  );
  if (linked.length > 0) return linked;
  return stops.filter(
    (stop) => stopMode(stop) === mode && (stop.islandId === originIslandId || stop.islandId === destinationIslandId)
  );
}

function modeHubType(mode: TransportStopMode): HubDemandImpact['hubType'] {
  if (mode === 'air') return 'airport';
  if (mode === 'marine') return 'ferry_terminal';
  return 'land_gateway';
}

function careAllocations(result: DemandAllocationResult): DemandAllocation[] {
  return [...(result.byOriginCohort?.values() ?? [])].filter(
    (allocation) =>
      allocation.category === 'health' &&
      allocation.destinationIslandId !== null &&
      allocation.destinationIslandId !== allocation.originIslandId &&
      (allocation.routeType === 'marine' || allocation.routeType === 'airport')
  );
}

export function calculateTransportDemand(
  islandId: string,
  snapshot: ScoringSnapshot,
  demandAllocations: DemandAllocationResult
): TransportDemandResult {
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
      careTransfer: 0
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

  const careByAllocation = new Map<string, number>();
  for (const allocation of careAllocations(demandAllocations)) {
    const mode: TransportStopMode = allocation.routeType === 'airport' ? 'air' : 'marine';
    const endpoints = endpointStops(
      allStops,
      mode,
      allocation.originIslandId,
      allocation.destinationIslandId as string,
      islandsByRoute
    );
    if (endpoints.length === 0) continue;
    const share = allocation.demand / endpoints.length;
    careByAllocation.set(allocationKey(allocation), allocation.demand);
    for (const stop of endpoints) {
      const accumulator = accumulators.get(stop.id);
      if (accumulator) accumulator.careTransfer += share;
    }
  }

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
    const totalDemand = accumulator.working + accumulator.students + accumulator.elderly + accumulator.careTransfer;
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
      totalDemand: round(totalDemand),
      capacity: round(capacity),
      loadRatio: round(loadRatio),
      score: round(factor * 100),
      status: 'partial',
      limitation:
        'Stop capacity and passenger counts are estimated because validated transport capacity is unavailable; each configured population cohort is allocated once.'
    };
  });

  const modeSummary = (mode: TransportStopMode): TransportDemandModeSummary => {
    const entries = demandStops.filter((stop) => stop.mode === mode);
    return {
      stopCount: entries.length,
      totalDemand: round(entries.reduce((sum, stop) => sum + stop.totalDemand, 0)),
      careTransferDemand: round(entries.reduce((sum, stop) => sum + stop.careTransferDemand, 0)),
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
  const careTransferDemand = round([...careByAllocation.values()].reduce((sum, value) => sum + value, 0));
  const score = average(demandStops.map((stop) => stop.score));
  const averageLoad = average(demandStops.map((stop) => stop.loadRatio * 100));
  const hubImpacts = demandStops.map((stop): HubDemandImpact => ({
    hubId: stop.stopId,
    hubType: modeHubType(stop.mode),
    localDemand: stop.localDemand,
    incomingDemand: stop.connectedDemand,
    outboundDemand: 0,
    transferDemand: stop.careTransferDemand,
    totalDemand: stop.totalDemand,
    capacity: stop.capacity,
    pressure: stop.loadRatio,
    factor: stop.score / 100,
    scoreImpact: round(100 - stop.score),
    status: stop.status,
    limitation: stop.limitation
  }));

  return {
    workingDemand: round(allCohorts.working),
    studentDemand: round(allCohorts.students),
    elderlyDemand: round(allCohorts.elderly),
    careTransferDemand,
    totalDemand: round(allCohorts.working + allCohorts.students + allCohorts.elderly + careTransferDemand),
    averageLoad,
    score,
    modes,
    stops: demandStops,
    hubImpacts
  };
}

function allocationKey(allocation: DemandAllocation): string {
  return `${allocation.originIslandId}:${allocation.category}:${allocation.needKey}`;
}
