import type { IslandProfile, IslandTransportDemandStop } from './island-profile';
import type { Edge, Node } from '@xyflow/svelte';
import type { ConnectionNetworkLink, ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';

import { MarkerType } from '@xyflow/svelte';

import { airportCorridor, getConnectionIndex, islandCorridor } from './connection-network-index';

export type ConnectionNodeKind = 'root' | 'island' | 'atoll' | 'mode' | 'stop' | 'leg' | 'overflow';
export type ConnectionNetworkView = 'sidebar' | 'fullscreen';
export type TransportMode = IslandTransportDemandStop['mode'];
export type ConnectionNodeData = {
  kind: ConnectionNodeKind;
  label: string;
  detail: string;
  islandId?: string;
  stopId?: string;
  mode?: TransportMode;
  count?: number;
  connectionCount?: number;
  connectionTypes?: string[];
  selected?: boolean;
  expanded?: boolean;
  expandable?: boolean;
  onActivate?: () => void;
  onExpand?: () => void;
  onSimulate?: () => void;
  detailIslandId?: string;
  connection?: ConnectionNetworkLink;
  referenceTo?: string;
  simulateReady?: boolean;
  routePathIndex?: number;
};
export type ConnectionEdgeData = {
  kind: 'network' | 'group';
  connection?: ConnectionNetworkLink;
  connectionCount?: number;
  connections?: ConnectionNetworkLink[];
  connectionTypes?: string[];
  routeActive?: boolean;
  routeAnimating?: boolean;
  routePathIndex?: number;
};
export type ConnectionGraphNode = Node<ConnectionNodeData, ConnectionNodeKind>;
export type ConnectionGraphEdge = Edge<ConnectionEdgeData, 'smoothstep'>;
type GraphOptions = {
  profile: IslandProfile | null;
  network: ConnectionNetworkResponse | null;
  selectedIslandId: string | null;
  targetIslandId?: string | null;
  routeAnimationComplete: boolean;
  view: ConnectionNetworkView;
  detailIslandId: string | null;
  explorationPath?: string[];
  onIslandSelect: (id: string) => void;
  onIslandExpand: (id: string) => void;
  onSimulate?: (destinationIslandId: string) => void;
};
export function modeLabel(mode: TransportMode): string {
  return mode === 'marine' ? 'Marine' : mode === 'air' ? 'Air' : 'Land';
}
export function islandNodeLabel(island: { name: string; atollName: string } | undefined, fallback: string): string {
  const name = island?.name.trim() || fallback;
  const atoll = island?.atollName.trim();
  if (!atoll || name === atoll) return name;
  const separator = [' · ', ' - ', ', ', '. ', ' '].find((value) =>
    name.toLowerCase().startsWith(atoll.toLowerCase() + value)
  );
  return `${atoll} · ${separator ? name.slice(atoll.length + separator.length).trim() : name}`;
}

// These sizes are also applied to the consuming canvas, including unmounted nodes.
const SIZES: Record<ConnectionNodeKind, { width: number; height: number }> = {
  root: { width: 190, height: 72 },
  island: { width: 228, height: 68 },
  mode: { width: 205, height: 70 },
  stop: { width: 205, height: 68 },
  leg: { width: 205, height: 68 },
  atoll: { width: 205, height: 70 },
  overflow: { width: 205, height: 68 }
};
type Branch = { node: ConnectionGraphNode; children: Branch[]; height: number };
const GAP = 48;
const COLUMN = 390;

export function buildConnectionGraph(options: GraphOptions): {
  nodes: ConnectionGraphNode[];
  edges: ConnectionGraphEdge[];
  status: string;
} {
  const { network } = options;
  const start = options.selectedIslandId ?? options.profile?.island.id ?? network?.islands[0]?.id;
  if (!network || !start) return { nodes: [], edges: [], status: 'Connection data unavailable.' };
  const index = getConnectionIndex(network);
  const corridor =
    options.targetIslandId && options.targetIslandId !== start
      ? islandCorridor(index, start, options.targetIslandId)
      : airportCorridor(index, start);
  const focus = options.detailIslandId ?? start;
  const expanded = new Set([start, focus]);
  const corridorNext = new Map(corridor.steps.map((step) => [step.from, step]));
  const corridorOrder = new Map(corridor.steps.map((step, index) => [step.group.id, index]));
  const corridorIslandOrder = new Map(corridor.islands.map((id, index) => [id, index]));
  const targetPathOnly = Boolean(options.targetIslandId);
  const pathNext = new Map<string, string>();
  const path = [start, ...(options.explorationPath ?? []).filter((id) => id !== start)];
  for (let i = 1; i < path.length; i++) pathNext.set(path[i - 1], path[i]);
  const nodes: ConnectionGraphNode[] = [];
  const edges: ConnectionGraphEdge[] = [];
  const owners = new Map<string, string>();
  const usedGroups = new Set<string>();
  const branches = new Map<string, Branch>();
  const make = (id: string, kind: ConnectionNodeKind, data: Omit<ConnectionNodeData, 'kind'>): Branch => {
    const size = SIZES[kind];
    const node: ConnectionGraphNode = {
      id,
      type: kind,
      position: { x: 0, y: 0 },
      initialWidth: size.width,
      initialHeight: size.height,
      width: size.width,
      height: size.height,
      data: { ...data, kind }
    };
    const branch = { node, children: [], height: size.height };
    nodes.push(node);
    branches.set(id, branch);
    return branch;
  };
  const attach = (parent: Branch, child: Branch) => {
    parent.children.push(child);
    edges.push({
      id: `owns:${child.node.id}`,
      source: parent.node.id,
      target: child.node.id,
      type: 'smoothstep',
      data: { kind: 'group' }
    });
  };
  const island = (id: string, displayId: string, root = false): Branch =>
    make(displayId, root ? 'root' : 'island', {
      label: islandNodeLabel(index.islands.get(id), id),
      detail: '',
      islandId: id,
      selected: root || id === options.targetIslandId,
      expanded: expanded.has(id),
      expandable: root && (id !== index.airportId || Boolean(options.targetIslandId)) && !expanded.has(id),
      onActivate: root ? () => options.onIslandSelect(id) : undefined,
      onExpand: root ? () => options.onIslandExpand(id) : undefined,
      onSimulate:
        !root && start === 'island:640' && id === 'island:1442' && id === options.targetIslandId && options.onSimulate
          ? () => options.onSimulate!(id)
          : undefined,
      simulateReady: options.routeAnimationComplete,
      routePathIndex: options.targetIslandId ? corridorIslandOrder.get(id) : undefined
    });
  const validStop = (stopId: string | null, owner: string, mode: TransportMode) => {
    const stop = stopId ? index.stops.get(stopId) : undefined;
    return stop?.islandId === owner && stop.mode === mode ? stop : undefined;
  };
  const populate = (branch: Branch, islandId: string, incoming?: string) => {
    if (islandId === index.airportId && !options.targetIslandId) return;
    const existing = owners.get(islandId);
    if (existing) {
      branch.node.data.referenceTo = existing;
      return;
    }
    owners.set(islandId, branch.node.id);
    const next = corridorNext.get(islandId);
    const exploreTo = pathNext.get(islandId);
    const groups = (index.adjacent.get(islandId) ?? []).filter((group) => {
      if (group.id === incoming) return false;
      if (targetPathOnly && !expanded.has(islandId)) return group.id === next?.group.id;
      return (
        expanded.has(islandId) ||
        group.id === next?.group.id ||
        (exploreTo && group.links.some((link) => link.fromIslandId === exploreTo || link.toIslandId === exploreTo))
      );
    });
    // Populate the actual corridor first so other neighborhood branches can only
    // reference it, never steal its airport-owning island. Display order is separate.
    groups.sort(
      (a, b) => Number(b.id === next?.group.id) - Number(a.id === next?.group.id) || a.id.localeCompare(b.id)
    );
    const modes = new Map<TransportMode, Branch>();
    const terminals = new Map<string, Branch>();
    const modeBranch = (mode: TransportMode) => {
      let result = modes.get(mode);
      if (!result) {
        result = make(`${branch.node.id}/mode:${mode}`, 'mode', {
          label: modeLabel(mode).toUpperCase(),
          detail: '',
          mode
        });
        modes.set(mode, result);
        attach(branch, result);
      }
      return result;
    };
    const terminal = (stop: NonNullable<ReturnType<typeof validStop>>) => {
      let result = terminals.get(stop.id);
      if (!result) {
        result = make(`${branch.node.id}/stop:${stop.id}`, 'stop', {
          label: stop.name ?? stop.subtype,
          detail: '',
          islandId,
          stopId: stop.id,
          mode: stop.mode
        });
        terminals.set(stop.id, result);
        attach(modeBranch(stop.mode), result);
      }
      return result;
    };
    if (options.targetIslandId && islandId === index.airportId) {
      for (const stop of index.stopsByIsland.get(islandId) ?? []) {
        if (stop.mode === 'air' && stop.subtype === 'airport' && !stop.id.startsWith('virtual:')) terminal(stop);
      }
    }
    for (const group of groups) {
      if (usedGroups.has(group.id)) continue;
      usedGroups.add(group.id);
      const link = group.links[0];
      const reversed = link.fromIslandId !== islandId;
      const destination = reversed ? link.fromIslandId : link.toIslandId;
      const localStop = validStop(reversed ? link.toStopId : link.fromStopId, islandId, link.mode);
      const remoteStop = validStop(reversed ? link.fromStopId : link.toStopId, destination, link.mode);
      const parent = localStop ? terminal(localStop) : modeBranch(link.mode);
      const route = make(`${parent.node.id}/route:${group.id}`, 'leg', {
        label: link.routeName ?? link.connectionType.replaceAll('_', ' '),
        detail: '',
        mode: link.mode,
        connection: link
      });
      attach(parent, route);
      const target = island(destination, `${route.node.id}/island:${destination}`);
      let endpoint = target;
      if (remoteStop) {
        endpoint = make(`${route.node.id}/terminal:${remoteStop.id}`, 'stop', {
          label: remoteStop.name ?? remoteStop.subtype,
          detail: '',
          islandId: destination,
          stopId: remoteStop.id,
          mode: link.mode
        });
        attach(endpoint, target);
      }
      route.children.push(endpoint);
      const arrow = { type: MarkerType.ArrowClosed };
      edges.push({
        id: `network:${route.node.id}`,
        source: route.node.id,
        target: endpoint.node.id,
        type: 'smoothstep',
        data: {
          kind: 'network',
          connection: link,
          connections: group.links,
          connectionCount: group.links.length,
          routeActive: Boolean(options.targetIslandId) && corridorOrder.has(group.id),
          routeAnimating:
            Boolean(options.targetIslandId) && corridorOrder.has(group.id) && !options.routeAnimationComplete,
          routePathIndex: corridorOrder.get(group.id)
        },
        markerEnd:
          link.directionality === 'bidirectional' || (link.directionality === 'forward' && !reversed)
            ? arrow
            : undefined,
        markerStart:
          link.directionality === 'bidirectional' || (link.directionality === 'forward' && reversed)
            ? arrow
            : undefined,
        style: `stroke: #52525b; stroke-width: 1.5;${link.modeled ? 'stroke-dasharray: 5 4;' : ''}`,
        focusable: true,
        ariaLabel: `${link.fromIslandId} to ${link.toIslandId}; ${link.directionality}`
      });
      populate(target, destination, group.id);
    }
    if (expanded.has(islandId)) for (const stop of index.stopsByIsland.get(islandId) ?? []) terminal(stop);
    const order: TransportMode[] = ['air', 'marine', 'land'];
    branch.children.sort((a, b) => order.indexOf(a.node.data.mode!) - order.indexOf(b.node.data.mode!));
  };
  const root = island(start, `root:${start}`, true);
  populate(root, start);
  const measure = (branch: Branch): number => {
    const childrenHeight =
      branch.children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, branch.children.length - 1) * GAP;
    branch.height = Math.max(SIZES[branch.node.data.kind].height, childrenHeight);
    return branch.height;
  };
  const place = (branch: Branch, depth: number, top: number) => {
    branch.node.position = { x: depth * COLUMN, y: top + (branch.height - SIZES[branch.node.data.kind].height) / 2 };
    const total =
      branch.children.reduce((sum, child) => sum + child.height, 0) + Math.max(0, branch.children.length - 1) * GAP;
    let cursor = top + (branch.height - total) / 2;
    for (const child of branch.children) {
      place(child, depth + 1, cursor);
      cursor += child.height + GAP;
    }
  };
  measure(root);
  place(root, 0, 0);
  return { nodes, edges, status: corridor.available ? '' : 'No recorded path to Velana Airport.' };
}
