<script lang="ts">
  import type { ConnectionGraphEdge, ConnectionGraphNode, ConnectionNetworkView } from './connection-network';

  import { useSvelteFlow } from '@xyflow/svelte';
  import { tick, untrack } from 'svelte';

  let {
    fitKey,
    nodes,
    view,
    initialized,
    focusNodeId = null,
    onReady = () => {},
    onRouteAnimationComplete = () => {}
  }: {
    fitKey: string;
    nodes: ConnectionGraphNode[];
    view: ConnectionNetworkView;
    initialized: boolean;
    focusNodeId?: string | null;
    onReady?: () => void;
    onRouteAnimationComplete?: () => void;
  } = $props();
  const { fitView, setCenter } = useSvelteFlow<ConnectionGraphNode, ConnectionGraphEdge>();
  const SIDEBAR_FOCUS_ATTEMPTS = 12;
  const FULLSCREEN_FOCUS_ZOOM = 0.7;
  const FULLSCREEN_FOCUS_SCREEN_OFFSET = 500;
  let lastFitKey = '';
  let pendingFitKey = '';
  let focusToken = 0;
  let currentFocusKey = $derived(`${fitKey}:${nodes.length}:${focusNodeId ?? ''}`);

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function isCurrentFocus(key: string, token: number): boolean {
    return token === focusToken && currentFocusKey === key && view === 'sidebar';
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

  async function focusFullscreenTarget(currentNodes: ConnectionGraphNode[]): Promise<boolean> {
    if (!focusNodeId) return false;
    const target = currentNodes.find((node) => node.data.islandId === focusNodeId);
    if (!target) return false;

    await tick();
    await nextFrame();
    const width = target.width ?? target.initialWidth ?? 0;
    const height = target.height ?? target.initialHeight ?? 0;
    const graphOffset = FULLSCREEN_FOCUS_SCREEN_OFFSET / FULLSCREEN_FOCUS_ZOOM;
    return setCenter(target.position.x + width / 2 + graphOffset, target.position.y + height / 2, {
      zoom: FULLSCREEN_FOCUS_ZOOM
    });
  }

  async function animateFullscreenRoute(
    currentNodes: ConnectionGraphNode[],
    onViewportReady: () => void
  ): Promise<boolean> {
    const routeNodes = currentNodes
      .filter((node) => node.data.routePathIndex !== undefined)
      .sort((left, right) => (left.data.routePathIndex ?? 0) - (right.data.routePathIndex ?? 0));
    if (routeNodes.length < 2) {
      const focused = await focusFullscreenTarget(currentNodes);
      if (focused) onViewportReady();
      return focused;
    }

    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600;
    const first = routeNodes[0];
    const center = (node: ConnectionGraphNode, offset = true): [number, number] => [
      node.position.x +
        (node.width ?? node.initialWidth ?? 0) / 2 +
        (offset ? FULLSCREEN_FOCUS_SCREEN_OFFSET / FULLSCREEN_FOCUS_ZOOM : 0),
      node.position.y + (node.height ?? node.initialHeight ?? 0) / 2
    ];
    const [startX, startY] = center(first);
    if (!(await setCenter(startX, startY, { zoom: FULLSCREEN_FOCUS_ZOOM, duration: 0 }))) return false;
    onViewportReady();

    const lastRouteIndex = routeNodes.length - 1;
    for (const [index, node] of routeNodes.slice(1).entries()) {
      const [x, y] = center(node, index !== lastRouteIndex - 1);
      if (!(await setCenter(x, y, { zoom: FULLSCREEN_FOCUS_ZOOM, duration }))) return false;
    }

    return true;
  }

  async function focusViewport(key: string, currentNodes: ConnectionGraphNode[], currentView: ConnectionNetworkView) {
    if (pendingFitKey === key) return;
    pendingFitKey = key;
    const token = ++focusToken;

    let succeeded: boolean;
    if (currentView === 'sidebar') {
      succeeded = await focusSidebar(key, currentNodes, token);
    } else {
      succeeded = await animateFullscreenRoute(currentNodes, () => {
        if (currentFocusKey === key) onReady();
      });
    }
    if (!succeeded && currentView === 'fullscreen') {
      succeeded = await fitView({ nodes: currentNodes, padding: 0.2, minZoom: 0.02, maxZoom: 1 });
    }

    if (succeeded && currentFocusKey === key) lastFitKey = key;
    if (succeeded && currentView === 'sidebar' && currentFocusKey === key) onReady();
    if (succeeded && currentView === 'fullscreen') onRouteAnimationComplete();
    if (pendingFitKey === key) pendingFitKey = '';
  }

  $effect(() => {
    const key = currentFocusKey;
    if (!initialized || !nodes.length || key === lastFitKey) return;
    untrack(() => void focusViewport(key, nodes, view));
    return () => {
      focusToken += 1;
      if (pendingFitKey === key) pendingFitKey = '';
    };
  });
</script>
