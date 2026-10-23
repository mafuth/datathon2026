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
    interactionWidth
  }: EdgeProps<ConnectionGraphEdge> = $props();

  let route = $derived(
    getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 })
  );
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
  {style}
  {interactionWidth}
/>
