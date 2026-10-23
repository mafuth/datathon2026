<script lang="ts">
  import type { ConnectionGraphNode } from './connection-network';
  import type { NodeProps } from '@xyflow/svelte';

  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import { Handle, Position } from '@xyflow/svelte';

  import { Button } from '$components/ui/button';

  let { data }: NodeProps<ConnectionGraphNode> = $props();
</script>

<Handle class="connection-handle" type="target" position={Position.Left} isConnectable={false} />

<Button
  class="connection-overflow-node nodrag nopan"
  variant="outline"
  size="sm"
  type="button"
  aria-label={`Show ${data.count ?? 0} more connections`}
  onclick={() => data.onActivate?.()}
>
  <span class="connection-overflow-count">{data.label}</span>
  <span class="connection-overflow-copy">{data.detail}</span>
  <MoreHorizontal size={15} strokeWidth={2.1} aria-hidden="true" />
</Button>

<style>
  :global(.connection-overflow-node) {
    display: flex;
    width: 150px;
    min-height: 58px;
    align-items: center;
    justify-content: flex-start;
    gap: 0.4rem;
    padding: 0.55rem 0.6rem;
    border: 1px dashed #a1a1aa;
    border-radius: 0.7rem;
    background: #fafafa;
    color: #27272a;
  }

  :global(.connection-overflow-node:hover),
  :global(.connection-overflow-node:focus-visible) {
    border-color: #18181b;
    background: #f4f4f5;
    color: #18181b;
  }

  .connection-overflow-count {
    font-size: 0.9rem;
    font-weight: 800;
    letter-spacing: -0.04em;
  }

  .connection-overflow-copy {
    flex: 1 1 auto;
    font-size: 0.54rem;
    text-align: left;
  }
</style>
