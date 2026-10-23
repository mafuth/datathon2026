<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import Bus from '@lucide/svelte/icons/bus';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Plane from '@lucide/svelte/icons/plane';
  import Ship from '@lucide/svelte/icons/ship';
  import { Handle, Position } from '@xyflow/svelte';

  import { Button } from '$components/ui/button';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />
<Handle class="connection-handle" type="source" position={Position.Right} isConnectable={false} />

<Button
  variant="ghost"
  type="button"
  class="connection-stop-node nodrag nopan"
  aria-label={`${data.label}, ${data.detail}`}
  title={data.label}
>
  <span class="connection-node-icon" aria-hidden="true">
    {#if data.mode === 'land'}
      <Bus size={15} strokeWidth={2.1} />
    {:else if data.mode === 'marine'}
      <Ship size={15} strokeWidth={2.1} />
    {:else if data.mode === 'air'}
      <Plane size={15} strokeWidth={2.1} />
    {:else}
      <MapPin size={15} strokeWidth={2.1} />
    {/if}
  </span>
  <span class="connection-node-copy">
    <strong>{data.label}</strong>
  </span>
</Button>

<style>
  :global(.connection-stop-node) {
    box-sizing: border-box;
    display: flex;
    width: 205px;
    min-height: 68px;
    height: auto;
    justify-content: flex-start;
    text-align: left;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.7rem;
    background: #ffffff;
    color: #27272a;
    font-family: var(--font-primary, sans-serif);
    box-shadow: 0 0.25rem 0.65rem rgb(24 24 27 / 5%);
  }

  .connection-node-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.5rem;
    background: #fafafa;
    color: #52525b;
  }

  .connection-node-copy {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .connection-node-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connection-node-copy strong {
    font-size: 0.64rem;
    font-weight: 700;
  }
</style>
