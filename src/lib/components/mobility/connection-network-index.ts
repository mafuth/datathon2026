import type { ConnectionNetworkLink, ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';

import { untrack } from 'svelte';

const LAND = new Set(['bridge', 'causeway', 'land_link']);
export type ConnectionGroup = { id: string; links: ConnectionNetworkLink[] };
type Group = ConnectionGroup;
export type CorridorStep = { from: string; to: string; group: Group; reversed: boolean };
export type CorridorPath = {
  islands: string[];
  groups: Group[];
  steps: CorridorStep[];
  available: boolean;
};
function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
function createIndex(network: ConnectionNetworkResponse) {
  const islands = new Map([...network.islands, ...network.islandDirectory].map((island) => [island.id, island]));
  const stops = new Map(network.stops.map((stop) => [stop.id, stop]));
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isHub = (islandId: string) => {
    const island = islands.get(islandId);
    const values = [islandId, island?.name ?? '', island?.atollName ?? ''].map(normalized);
    return values.some((value) => value === 'male' || value === 'hulhumale');
  };
  const hubIslandIds = new Set([...islands.keys()].filter(isHub));
  const stopsByIsland = new Map<string, ConnectionNetworkResponse['stops']>();
  for (const stop of stops.values()) append(stopsByIsland, stop.islandId, stop);
  const grouped = new Map<string, Group>();
  for (const link of network.connections) {
    if (!islands.has(link.fromIslandId) || !islands.has(link.toIslandId)) continue;
    const endpoints = [
      [link.fromIslandId, link.fromStopId],
      [link.toIslandId, link.toStopId]
    ];
    if (link.directionality === 'bidirectional')
      endpoints.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const key = JSON.stringify([
      endpoints,
      link.routeId,
      link.mode,
      link.connectionType,
      link.directionality,
      link.modeled
    ]);
    const group = grouped.get(key);
    if (group) group.links.push(link);
    else grouped.set(key, { id: link.id, links: [link] });
  }
  const rawGroups = [...grouped.values()];
  const directlyConnectedToHub = new Set(
    rawGroups.flatMap((group) => {
      const link = group.links[0];
      if (hubIslandIds.has(link.fromIslandId) && !hubIslandIds.has(link.toIslandId)) return [link.toIslandId];
      if (hubIslandIds.has(link.toIslandId) && !hubIslandIds.has(link.fromIslandId)) return [link.fromIslandId];
      return [];
    })
  );
  const groups = rawGroups
    .filter((group) => {
      const link = group.links[0];
      if (link.mode !== 'air' || link.connectionType !== 'air') return true;
      const airportIslandId = hubIslandIds.has(link.fromIslandId) ? link.toIslandId : link.fromIslandId;
      return !directlyConnectedToHub.has(airportIslandId);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const groupByLink = new Map<string, Group>();
  const linksByStop = new Map<string, ConnectionNetworkLink[]>();
  const adjacent = new Map<string, Group[]>();
  const outgoing = new Map<string, { to: string; group: Group }[]>();
  const addOutgoing = (from: string, to: string, group: Group) => {
    if (from === to) return;
    append(outgoing, from, { to, group });
  };
  for (const group of groups) {
    for (const record of group.links) {
      groupByLink.set(record.id, group);
      if (record.fromStopId) append(linksByStop, record.fromStopId, record);
      if (record.toStopId && record.toStopId !== record.fromStopId) append(linksByStop, record.toStopId, record);
    }
    const link = group.links[0];
    append(adjacent, link.fromIslandId, group);
    if (link.toIslandId !== link.fromIslandId) append(adjacent, link.toIslandId, group);
    const validStop = (id: string | null, islandId: string) => {
      const stop = id ? stops.get(id) : undefined;
      if (id) return stop?.islandId === islandId && stop.mode === link.mode;
      // Catalogue air links are already airport-evidence-filtered by the server.
      // Their absent route calls must not be replaced with invented terminals.
      return (
        link.mode === 'air' &&
        link.connectionType === 'air' &&
        (stopsByIsland.get(islandId) ?? []).some(
          (entry) => entry.mode === 'air' && entry.subtype === 'airport' && !entry.id.startsWith('virtual:')
        )
      );
    };
    const valid = LAND.has(link.connectionType)
      ? link.mode === 'land'
      : validStop(link.fromStopId, link.fromIslandId) && validStop(link.toStopId, link.toIslandId);
    if (!valid || !['forward', 'bidirectional'].includes(link.directionality)) continue;
    addOutgoing(link.fromIslandId, link.toIslandId, group);
    if (link.directionality === 'bidirectional') addOutgoing(link.toIslandId, link.fromIslandId, group);
  }
  // Retain mode/route alternatives. BFS minimizes hops, then prefers physical
  // land access, air, marine; source-backed evidence and stable IDs break ties.
  for (const steps of outgoing.values())
    steps.sort((a, b) => {
      const priority = (group: Group) => ({ land: 0, air: 1, marine: 2 })[group.links[0].mode];
      return (
        priority(a.group) - priority(b.group) ||
        Number(a.group.links[0].modeled) - Number(b.group.links[0].modeled) ||
        a.to.localeCompare(b.to) ||
        a.group.id.localeCompare(b.group.id)
      );
    });
  const airportCandidates = new Map<string, number>();
  for (const link of network.connections) {
    if (link.mode !== 'air' || link.connectionType !== 'air') continue;
    for (const islandId of [link.fromIslandId, link.toIslandId]) {
      if (
        (stopsByIsland.get(islandId) ?? []).some(
          (stop) => stop.mode === 'air' && stop.subtype === 'airport' && !stop.id.startsWith('virtual:')
        )
      ) {
        airportCandidates.set(islandId, (airportCandidates.get(islandId) ?? 0) + 1);
      }
    }
  }
  const airportId =
    [...airportCandidates.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )[0]?.[0] ?? null;
  return { islands, stops, stopsByIsland, adjacent, outgoing, airportId, groupByLink, linksByStop };
}
type NetworkIndex = ReturnType<typeof createIndex>;
const indexes = new WeakMap<ConnectionNetworkResponse, NetworkIndex>();
const corridors = new WeakMap<NetworkIndex, Map<string, CorridorPath>>();
export function getConnectionIndex(network: ConnectionNetworkResponse): NetworkIndex {
  let index = indexes.get(network);
  if (!index) {
    // The API snapshot is immutable. Track its identity in the consumer, not
    // every national trip/stop property while building this one-time index.
    index = untrack(() => createIndex(network));
    indexes.set(network, index);
  }
  return index;
}
export function airportCorridor(index: NetworkIndex, start: string): CorridorPath {
  let cache = corridors.get(index);
  if (!cache) {
    cache = new Map();
    corridors.set(index, cache);
  }
  let result = cache.get(start);
  if (!result) {
    result = findPath(index, start, index.airportId);
    // Bound retained path arrays when users browse many national selections.
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(start, result);
  }
  return result;
}
export function islandCorridor(index: NetworkIndex, start: string, target: string): CorridorPath {
  return findPath(index, start, target);
}

function findPath(index: NetworkIndex, start: string, target: string | null): CorridorPath {
  if (!target) return { islands: [start], groups: [] as Group[], steps: [] as CorridorStep[], available: false };
  if (start === target)
    return { islands: [start], groups: [] as Group[], steps: [] as CorridorStep[], available: true };
  const previous = new Map<string, { from: string; group: Group }>();
  const visited = new Set([start]);
  const queue = [start];
  // Canonical bounded BFS: at most one visit per directory island, no shift().
  for (let head = 0; head < queue.length && !visited.has(target); head++) {
    for (const step of index.outgoing.get(queue[head]) ?? []) {
      if (visited.has(step.to)) continue;
      visited.add(step.to);
      previous.set(step.to, { from: queue[head], group: step.group });
      queue.push(step.to);
    }
  }
  if (!visited.has(target))
    return { islands: [start], groups: [] as Group[], steps: [] as CorridorStep[], available: false };
  const islands = [target];
  const groups: Group[] = [];
  const steps: CorridorStep[] = [];
  let current = target;
  while (current !== start) {
    const step = previous.get(current)!;
    groups.push(step.group);
    steps.push({
      from: step.from,
      to: current,
      group: step.group,
      reversed: step.group.links[0].fromIslandId !== step.from
    });
    islands.push(step.from);
    current = step.from;
  }
  return { islands: islands.reverse(), groups: groups.reverse(), steps: steps.reverse(), available: true };
}
