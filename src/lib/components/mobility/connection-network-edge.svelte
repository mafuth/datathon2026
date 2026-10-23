<script lang="ts">
  import type { ConnectionGraphEdge } from './connection-network';
  import type { EdgeProps } from '@xyflow/svelte';

  import { BaseEdge, getSmoothStepPath } from '@xyflow/svelte';

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerStart,
    markerEnd,
    style,
    label,
    labelStyle,
    interactionWidth,
    data
  }: EdgeProps<ConnectionGraphEdge> = $props();

  let route = $derived(
    getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 })
  );
  let edgeStyle = $derived(
    `${style ?? ''}${data?.routeActive ? 'stroke: #18181b; stroke-width: 2.4; stroke-dasharray: 10 8;' : ''}${
      data?.routeAnimating ? `animation-delay: -${(data.routePathIndex ?? 0) * 0.18}s;` : ''
    }`
  );
  let edgeClass = $derived(data?.routeAnimating ? 'connection-route-edge' : undefined);
</script>

<BaseEdge
  {id}
  path={route[0]}
  labelX={route[1]}
  labelY={route[2]}
  {label}
  {labelStyle}
  {markerStart}
  {markerEnd}
  style={edgeStyle}
  class={edgeClass}
  {interactionWidth}
/>

<style>
  @keyframes connection-route-flow {
    to {
      stroke-dashoffset: -36;
    }
  }

  :global(.connection-route-edge) {
    animation: connection-route-flow 1.8s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.connection-route-edge) {
      animation: none;
    }
  }
</style>
