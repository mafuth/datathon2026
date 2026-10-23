<script lang="ts">
  import type { ConnectionGraphEdge, ConnectionGraphNode, ConnectionNetworkView } from './connection-network';

  import { useSvelteFlow } from '@xyflow/svelte';
  import { tick, untrack } from 'svelte';

  let {
    fitKey,
    nodes,
    view,
    initialized
  }: { fitKey: string; nodes: ConnectionGraphNode[]; view: ConnectionNetworkView; initialized: boolean } = $props();
  const { fitView, setCenter } = useSvelteFlow<ConnectionGraphNode, ConnectionGraphEdge>();
  const SIDEBAR_FOCUS_ATTEMPTS = 12;
  let lastFitKey = '';
  let pendingFitKey = '';
  let focusToken = 0;

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function isCurrentFocus(key: string, token: number): boolean {
    return token === focusToken && `${fitKey}:${nodes.length}` === key && view === 'sidebar';
  }

  async function focusSidebar(key: string, currentNodes: ConnectionGraphNode[], token: number): Promise<boolean> {
    const root = currentNodes.find((node) => node.type === 'root');
    if (!root) return false;

    const width = root.width ?? root.initialWidth ?? 0;
    const height = root.height ?? root.initialHeight ?? 0;
    await tick();

    for (let attempt = 0; attempt < SIDEBAR_FOCUS_ATTEMPTS; attempt += 1) {
      await nextFrame();
      if (!isCurrentFocus(key, token)) return false;
      if (await setCenter(root.position.x + width / 2, root.position.y + height / 2, { zoom: 0.85 })) return true;
    }

    return false;
  }

  async function focusViewport(key: string, currentNodes: ConnectionGraphNode[], currentView: ConnectionNetworkView) {
    if (pendingFitKey === key) return;
    pendingFitKey = key;
    const token = ++focusToken;

    const succeeded =
      currentView === 'sidebar'
        ? await focusSidebar(key, currentNodes, token)
        : await fitView({ nodes: currentNodes, padding: 0.2, minZoom: 0.02, maxZoom: 1 });

    if (succeeded && `${fitKey}:${nodes.length}` === key) lastFitKey = key;
    if (pendingFitKey === key) pendingFitKey = '';
  }

  $effect(() => {
    const key = `${fitKey}:${nodes.length}`;
    if (!initialized || !nodes.length || key === lastFitKey) return;
    untrack(() => void focusViewport(key, nodes, view));
    return () => {
      focusToken += 1;
      if (pendingFitKey === key) pendingFitKey = '';
    };
  });
</script>
