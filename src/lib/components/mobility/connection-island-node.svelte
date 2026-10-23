<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import Map from '@lucide/svelte/icons/map';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Plus from '@lucide/svelte/icons/plus';
  import { Handle, Position } from '@xyflow/svelte';

  import { Button } from '$components/ui/button';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />
<Handle class="connection-handle" type="source" position={Position.Right} isConnectable={false} />

<div class="connection-island-shell nodrag nopan">
  <Button
    class={['connection-island-button', { 'connection-island-selected': data.selected }]}
    variant="ghost"
    size="sm"
    type="button"
    disabled={!data.onActivate}
    aria-label={data.onActivate ? `Open ${data.label} island analytics` : `${data.label} connected island`}
    title={data.label}
    onclick={() => data.onActivate?.()}
  >
    <span class="connection-node-icon" aria-hidden="true"><MapPin size={16} strokeWidth={2.1} /></span>
    <span class="connection-node-copy">
      <strong>{data.label}</strong>
    </span>
  </Button>
  {#if data.onSimulate}
    <Button
      class="connection-simulate-button"
      data-presentation-target="simulate-journey"
      variant="default"
      size="sm"
      type="button"
      disabled={data.simulateReady === false}
      aria-label="Simulate on map"
      onclick={(event) => {
        event.stopPropagation();
        data.onSimulate?.();
      }}
    >
      <Map size={14} strokeWidth={2.2} aria-hidden="true" />
      <span>Simulate on map</span>
    </Button>
  {/if}
  {#if data.expandable}
    <Button
      class="connection-expand-button"
      variant="outline"
      size="icon"
      type="button"
      aria-label={`Expand ${data.label} infrastructure`}
      aria-expanded={data.expanded}
      onclick={(event) => {
        event.stopPropagation();
        data.onExpand?.();
      }}
    >
      <Plus size={14} strokeWidth={2.2} />
    </Button>
  {/if}
</div>

<style>
  :global(.connection-island-button) {
    display: flex;
    width: 190px;
    min-height: 68px;
    align-items: center;
    justify-content: flex-start;
    gap: 0.6rem;
    padding: 0.62rem 0.7rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.7rem;
    background: #ffffff;
    color: #18181b;
    text-align: left;
    box-shadow: 0 0.3rem 0.8rem rgb(24 24 27 / 6%);
  }

  .connection-island-shell {
    position: relative;
    display: flex;
    width: 190px;
    min-height: 68px;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }

  :global(.connection-island-shell .connection-island-button) {
    width: 190px;
  }

  :global(.connection-simulate-button) {
    align-self: center;
    margin: 0.35rem 0 0;
    min-width: 7.75rem;
    border-color: #18181b;
    background: #18181b;
    color: #ffffff;
    font-size: 0.62rem;
  }

  :global(.connection-simulate-button:hover),
  :global(.connection-simulate-button:focus-visible) {
    border-color: #000000;
    background: #000000;
    color: #ffffff;
  }

  :global(.connection-expand-button) {
    width: 1.65rem;
    height: 1.65rem;
    flex: 0 0 auto;
    margin-left: auto;
    padding: 0;
    border-color: #d4d4d8;
    background: #ffffff;
    color: #18181b;
  }

  :global(.connection-expand-button:hover),
  :global(.connection-expand-button:focus-visible) {
    border-color: #a1a1aa;
    background: #f4f4f5;
    color: #18181b;
  }

  :global(.connection-island-button:hover),
  :global(.connection-island-button:focus-visible) {
    border-color: #71717a;
    background: #fafafa;
    color: #18181b;
  }

  :global(.connection-island-button.connection-island-selected) {
    border-color: #18181b;
    box-shadow:
      0 0 0 2px rgb(24 24 27 / 10%),
      0 0.3rem 0.8rem rgb(24 24 27 / 8%);
  }

  :global(.connection-island-button.connection-island-compact) {
    width: 2.25rem;
    min-height: 2.25rem;
    justify-content: center;
    gap: 0;
    padding: 0.3rem;
    border-radius: 999px;
  }

  :global(.connection-island-button.connection-island-compact .connection-node-icon) {
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
  }

  :global(.connection-island-button.connection-island-compact.connection-island-selected) {
    width: 10.5rem;
    justify-content: flex-start;
    gap: 0.6rem;
    border-radius: 0.7rem;
  }

  .connection-node-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.55rem;
    background: #f4f4f5;
    color: #18181b;
  }

  .connection-node-copy {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .connection-node-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connection-node-copy strong {
    font-size: 0.7rem;
    font-weight: 750;
  }
</style>
