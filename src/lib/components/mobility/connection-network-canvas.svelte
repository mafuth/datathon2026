<script lang="ts">
  import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    SvelteFlow,
    SvelteFlowProvider
  } from '@xyflow/svelte';

  import * as Alert from '$components/ui/alert';
  import { Button } from '$components/ui/button';

  import '@xyflow/svelte/dist/style.css';

  import type { ConnectionNetworkView } from './connection-network';
  import type { IslandProfile } from './island-profile';
  import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';

  import ConnectionIslandNode from './connection-island-node.svelte';
  import { buildConnectionGraph, islandNodeLabel } from './connection-network';
  import ConnectionNetworkEdge from './connection-network-edge.svelte';
  import ConnectionNetworkFitView from './connection-network-fit-view.svelte';
  import { getConnectionIndex } from './connection-network-index';
  import ConnectionRootNode from './connection-root-node.svelte';
  import ConnectionStopNode from './connection-stop-node.svelte';
  import ConnectionTransportNode from './connection-transport-node.svelte';

  type Props = {
    profile: IslandProfile | null;
    network: ConnectionNetworkResponse | null;
    selectedIslandId: string | null;
    targetIslandId?: string | null;
    view: ConnectionNetworkView;
    onIslandSelect?: (islandId: string) => void;
    onSimulate?: (destinationIslandId: string) => void;
  };

  let {
    profile,
    network,
    selectedIslandId,
    targetIslandId = null,
    view,
    onIslandSelect = () => {},
    onSimulate
  }: Props = $props();

  let expansion = $state.raw<{ selection: string | null; islandId: string | null }>({
    selection: null,
    islandId: null
  });
  let detailIslandId = $derived(expansion.selection === selectedIslandId ? expansion.islandId : null);
  let index = $derived(network ? getConnectionIndex(network) : null);
  function expandIsland(islandId: string) {
    if (islandId === index?.airportId) return;
    expansion = {
      selection: selectedIslandId,
      islandId
    };
    inspectedEdgeId = null;
    inspectedStopId = null;
    inspectedConnectionId = null;
  }
  let inspectedEdgeId = $state<string | null>(null);
  let inspectedConnectionId = $state<string | null>(null);
  let inspectedStopId = $state<string | null>(null);
  let evidencePage = $state(0);
  let graph = $derived.by(() =>
    buildConnectionGraph({
      profile,
      network,
      selectedIslandId,
      targetIslandId,
      view,
      detailIslandId,
      onIslandSelect,
      onIslandExpand: expandIsland,
      onSimulate
    })
  );
  let inspectedStop = $derived.by(() => {
    const stop = inspectedStopId ? index?.stops.get(inspectedStopId) : undefined;
    if (stop) return stop;
    const node = graph.nodes.find((entry) => entry.data.stopId === inspectedStopId);
    if (!node?.data.stopId || !node.data.islandId) return undefined;
    return {
      id: node.data.stopId,
      name: node.data.label,
      islandId: node.data.islandId,
      subtype: 'Terminal unresolved',
      routeIds: []
    };
  });
  let stopLinks = $derived(inspectedStopId ? (index?.linksByStop.get(inspectedStopId) ?? []) : []);
  let inspectedLinks = $derived(
    (inspectedConnectionId ? index?.groupByLink.get(inspectedConnectionId)?.links : undefined) ??
      graph.edges.find((edge) => edge.id === inspectedEdgeId)?.data?.connections ??
      []
  );
  let inspectedLink = $derived(inspectedLinks.find((link) => link.id === inspectedConnectionId) ?? inspectedLinks[0]);
  let fitKey = $derived(
    `${view}:${selectedIslandId ?? ''}:${targetIslandId ?? ''}:${network?.baselineVersion ?? ''}:${detailIslandId ?? ''}`
  );
  let flowInitialized = $state(false);

  const nodeTypes = {
    root: ConnectionRootNode,
    island: ConnectionIslandNode,
    mode: ConnectionTransportNode,
    stop: ConnectionStopNode,
    leg: ConnectionStopNode
  };
  const edgeTypes = { smoothstep: ConnectionNetworkEdge };
</script>

<SvelteFlowProvider>
  <div class={['connection-network-layout', { 'connection-network-fullscreen-layout': view === 'fullscreen' }]}>
    <div class={['connection-network-canvas', { 'connection-network-fullscreen-canvas': view === 'fullscreen' }]}>
      <SvelteFlow
        colorMode="light"
        id={`island-connection-network-${view}`}
        nodes={graph.nodes}
        edges={graph.edges}
        {nodeTypes}
        {edgeTypes}
        onlyRenderVisibleElements
        nodesDraggable={false}
        nodesConnectable={false}
        selectionKey={null}
        deleteKey={null}
        minZoom={0.0001}
        maxZoom={1.5}
        oninit={() => (flowInitialized = true)}
        onedgeclick={({ edge }) => {
          evidencePage = 0;
          inspectedEdgeId = edge.id;
          inspectedStopId = null;
          inspectedConnectionId = null;
        }}
        onnodeclick={({ node }) => {
          evidencePage = 0;
          inspectedStopId = node.data.stopId ?? null;
          inspectedConnectionId = null;
          inspectedEdgeId = node.data.connection
            ? (graph.edges.find((edge) => edge.data?.connection?.id === node.data.connection?.id)?.id ?? null)
            : null;
        }}
        preventScrolling
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} patternColor="#e4e4e7" />
        <Controls showLock={false} fitViewOptions={{ minZoom: 0.0001, maxZoom: 1, padding: 0.12 }} />
        {#if view === 'fullscreen'}
          <MiniMap
            position="bottom-right"
            ariaLabel="Connection network overview"
            pannable
            zoomable
            bgColor="#ffffff"
            nodeColor={(node) => (node.type === 'root' ? '#18181b' : '#a1a1aa')}
            nodeStrokeColor="#52525b"
            maskColor="rgb(24 24 27 / 12%)"
            maskStrokeColor="#18181b"
            maskStrokeWidth={2}
          />
        {/if}
        <ConnectionNetworkFitView {fitKey} nodes={graph.nodes} {view} initialized={flowInitialized} />
        {#if inspectedLink}
          <Panel position="bottom-left">
            <div class="connection-evidence nodrag nopan">
              <Alert.Root>
                <Alert.Title
                  >{inspectedLink.mode} · {inspectedLink.routeName ?? inspectedLink.connectionType}</Alert.Title
                >
                <Alert.Description>
                  {#if inspectedLinks.length > 1}
                    <p>{inspectedLinks.length} source records on this connection</p>
                    {#each inspectedLinks.slice(evidencePage * 12, evidencePage * 12 + 12) as link (link.id)}
                      <Button variant="outline" size="sm" onclick={() => (inspectedConnectionId = link.id)}
                        >{link.routeName ?? link.connectionType} · {link.tripId ?? link.sourceObjectId}</Button
                      >
                    {/each}
                    <Button variant="outline" size="sm" disabled={evidencePage === 0} onclick={() => evidencePage--}
                      >Previous records</Button
                    >
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(evidencePage + 1) * 12 >= inspectedLinks.length}
                      onclick={() => evidencePage++}>Next records</Button
                    >
                  {/if}
                  <p>
                    {islandNodeLabel(index?.islands.get(inspectedLink.fromIslandId), inspectedLink.fromIslandId)}
                    {inspectedLink.directionality === 'bidirectional' ? '↔' : '→'}
                    {islandNodeLabel(index?.islands.get(inspectedLink.toIslandId), inspectedLink.toIslandId)}
                  </p>
                  <p>
                    {inspectedLink.source} · {inspectedLink.modeled
                      ? 'Modeled connectivity'
                      : 'Source-backed connectivity'} ·
                    {inspectedLink.scoreEligible ? 'Score eligible' : 'Not score eligible'}
                  </p>
                  <p>
                    Route: {inspectedLink.routeId ?? 'Not recorded'} · Segment: {inspectedLink.sequence ??
                      'Not recorded'}
                  </p>
                  <p>Trip: {inspectedLink.tripId ?? 'Catalogue connectivity; no trip record'}</p>
                  <p>Source object: {inspectedLink.sourceObjectId}</p>
                  <p>
                    From: {index?.stops.get(inspectedLink.fromStopId ?? '')?.name ??
                      (['bridge', 'causeway', 'land_link'].includes(inspectedLink.connectionType)
                        ? 'Island-level infrastructure'
                        : 'Terminal unresolved')}<br />
                    To: {index?.stops.get(inspectedLink.toStopId ?? '')?.name ??
                      (['bridge', 'causeway', 'land_link'].includes(inspectedLink.connectionType)
                        ? 'Island-level infrastructure'
                        : 'Terminal unresolved')}
                  </p>
                  <p>{inspectedLink.fromTerminalEvidence}<br />{inspectedLink.toTerminalEvidence}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => {
                      inspectedEdgeId = null;
                      inspectedConnectionId = null;
                    }}>Close link details</Button
                  >
                </Alert.Description>
              </Alert.Root>
            </div>
          </Panel>
        {/if}
        {#if inspectedStop}
          <Panel position="bottom-left">
            <div class="connection-evidence nodrag nopan">
              <Alert.Root>
                <Alert.Title>{inspectedStop.name ?? inspectedStop.subtype}</Alert.Title>
                <Alert.Description>
                  <p>
                    {islandNodeLabel(index?.islands.get(inspectedStop.islandId), inspectedStop.islandId)} · {inspectedStop.subtype}
                  </p>
                  <p>{inspectedStop.routeIds.length} recorded routes · {stopLinks.length} adjacent legs</p>
                  {#each stopLinks.slice(evidencePage * 12, evidencePage * 12 + 12) as link (link.id)}
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => {
                        evidencePage = 0;
                        inspectedEdgeId = null;
                        inspectedConnectionId = link.id;
                        inspectedStopId = null;
                      }}>{link.routeName ?? link.connectionType} · segment {link.sequence ?? 'unrecorded'}</Button
                    >
                  {/each}
                  <Button variant="outline" size="sm" disabled={evidencePage === 0} onclick={() => evidencePage--}
                    >Previous legs</Button
                  >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(evidencePage + 1) * 12 >= stopLinks.length}
                    onclick={() => evidencePage++}>Next legs</Button
                  >
                  <Button variant="outline" size="sm" onclick={() => (inspectedStopId = null)}
                    >Close terminal details</Button
                  >
                </Alert.Description>
              </Alert.Root>
            </div>
          </Panel>
        {/if}
      </SvelteFlow>
    </div>
  </div>
</SvelteFlowProvider>

<style>
  .connection-network-layout {
    display: flex;
    min-width: 0;
    flex-direction: column;
    color-scheme: light;
  }

  .connection-network-fullscreen-layout {
    flex: 1 1 0;
    min-height: 0;
  }

  .connection-evidence {
    max-width: min(28rem, calc(100vw - 4rem));
    max-height: 40vh;
    overflow: auto;
    overflow-wrap: anywhere;
  }
  .connection-network-canvas {
    position: relative;
    width: 100%;
    height: 14rem;
    flex-shrink: 0;
    min-height: 12rem;
    overflow: hidden;
    border: 1px solid #e4e4e7;
    border-radius: 0.7rem;
    background: #fafafa;
  }

  .connection-network-fullscreen-canvas {
    flex: 1 1 0;
    height: auto;
    min-height: 0;
    border: 0;
    border-radius: 0;
  }

  :global(.connection-network-canvas .svelte-flow) {
    background: #fafafa;
  }

  :global(.connection-network-canvas .svelte-flow__edge-path) {
    stroke: #a1a1aa;
    stroke-width: 1.2;
  }

  :global(.connection-network-canvas .svelte-flow__edge-text) {
    fill: #71717a;
    font-family: var(--font-primary, sans-serif);
    font-size: 9px;
    font-weight: 700;
  }

  :global(.connection-network-canvas .svelte-flow__attribution) {
    display: none;
  }

  :global(.connection-network-canvas .connection-handle) {
    width: 6px;
    height: 6px;
    border: 0;
    background: #a1a1aa;
    opacity: 0;
    pointer-events: none;
  }

  :global(.connection-network-canvas .connection-root-node .connection-node-copy strong),
  :global(.connection-network-canvas .connection-island-shell .connection-node-copy strong) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }

  :global(.connection-network-canvas .svelte-flow__controls) {
    overflow: hidden;
    border: 1px solid #d4d4d8;
    border-radius: 0.55rem;
    box-shadow: 0 0.25rem 0.7rem rgb(24 24 27 / 8%);
  }

  :global(.connection-network-canvas .svelte-flow__controls-button) {
    width: 1.9rem;
    height: 1.9rem;
    border-bottom-color: #e4e4e7;
    background: #ffffff;
    color: #27272a;
  }

  :global(.connection-network-canvas .svelte-flow__controls-button:hover) {
    background: #f4f4f5;
  }

  :global(.connection-network-canvas .svelte-flow__minimap) {
    overflow: hidden;
    border: 1px solid #d4d4d8;
    border-radius: 0.55rem;
    background: #ffffff;
    box-shadow: 0 0.25rem 0.7rem rgb(24 24 27 / 10%);
  }

  @media (max-width: 640px) {
    .connection-network-canvas {
      height: 13rem;
      min-height: 11rem;
    }

    .connection-network-fullscreen-canvas {
      height: auto;
      min-height: 0;
    }
  }
</style>
