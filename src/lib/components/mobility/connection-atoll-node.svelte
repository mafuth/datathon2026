<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import Route from '@lucide/svelte/icons/route';
  import { Handle, Position } from '@xyflow/svelte';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />
<Handle class="connection-handle" type="source" position={Position.Right} isConnectable={false} />

<div class="connection-group-node connection-atoll-node" aria-label={`${data.label}, ${data.detail}`}>
  <span class="connection-node-icon" aria-hidden="true"><Route size={16} strokeWidth={2.1} /></span>
  <span class="connection-node-copy">
    <strong>{data.label}</strong>
    <small>{data.detail}</small>
  </span>
</div>

<style>
  .connection-group-node {
    box-sizing: border-box;
    display: flex;
    width: 180px;
    min-height: 62px;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.7rem;
    background: #fafafa;
    color: #27272a;
    font-family: var(--font-primary, sans-serif);
  }

  .connection-node-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.5rem;
    background: #e4e4e7;
    color: #27272a;
  }

  .connection-node-copy {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }

  .connection-node-copy strong,
  .connection-node-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connection-node-copy strong {
    font-size: 0.65rem;
    font-weight: 750;
  }

  .connection-node-copy small {
    color: #71717a;
    font-size: 0.54rem;
  }
</style>
