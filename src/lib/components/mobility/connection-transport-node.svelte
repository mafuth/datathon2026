<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import Bus from '@lucide/svelte/icons/bus';
  import Plane from '@lucide/svelte/icons/plane';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import { Handle, Position } from '@xyflow/svelte';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />
<Handle class="connection-handle" type="source" position={Position.Right} isConnectable={false} />

<div class="connection-group-node connection-transport-node" aria-label={data.label}>
  <span class="connection-node-icon" aria-hidden="true">
    {#if data.mode === 'land'}
      <Bus size={16} strokeWidth={2.1} />
    {:else if data.mode === 'marine'}
      <Ship size={16} strokeWidth={2.1} />
    {:else if data.mode === 'air'}
      <Plane size={16} strokeWidth={2.1} />
    {:else}
      <Route size={16} strokeWidth={2.1} />
    {/if}
  </span>
  <span class="connection-node-copy">
    <strong>{data.label}</strong>
  </span>
</div>

<style>
  .connection-group-node {
    box-sizing: border-box;
    display: flex;
    width: 205px;
    min-height: 70px;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid #a1a1aa;
    border-radius: 0.7rem;
    background: #f4f4f5;
    color: #18181b;
    font-family: var(--font-primary, sans-serif);
  }

  .connection-node-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.55rem;
    background: #e4e4e7;
    color: #18181b;
  }

  .connection-node-copy {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .connection-node-copy strong {
    overflow: hidden;
    font-size: 0.68rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
