<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import Route from '@lucide/svelte/icons/route';
  import { Handle, Position } from '@xyflow/svelte';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="source" position={Position.Right} isConnectable={false} />
<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />

<div class="connection-node connection-root-node" aria-label={data.label}>
  <span class="connection-node-icon" aria-hidden="true"><Route size={17} strokeWidth={2.1} /></span>
  <span class="connection-node-copy">
    <strong>{data.label}</strong>
  </span>
</div>

<style>
  .connection-node {
    box-sizing: border-box;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.6rem;
    border-radius: 0.7rem;
    font-family: var(--font-primary, sans-serif);
  }

  .connection-root-node {
    width: 190px;
    min-height: 72px;
    padding: 0.65rem 0.75rem;
    border: 1px solid #18181b;
    background: #18181b;
    color: #ffffff;
    box-shadow: 0 0.45rem 1.2rem rgb(24 24 27 / 16%);
  }

  .connection-node-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.55rem;
    background: rgb(255 255 255 / 12%);
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
    font-size: 0.72rem;
    font-weight: 750;
    letter-spacing: -0.01em;
  }
</style>
