<script lang="ts">
  import type { IslandDemandCategory } from './island-services';
  import type { IslandConnectionsResponse } from '$lib/mobility/island-connections';

  import Bus from '@lucide/svelte/icons/bus';
  import Plane from '@lucide/svelte/icons/plane';
  import Ship from '@lucide/svelte/icons/ship';

  import { Button } from '$components/ui/button';

  import { islandInboundDemandValue, visibleIslandInboundFeatures } from './island-connection-layers';

  let {
    data,
    loading = false,
    error = null,
    routes = true,
    inbound = true,
    category = 'all',
    focusedOriginId = null,
    onRoutesChange,
    onInboundChange,
    onOriginChange,
    onFitRoutes,
    onFitInbound,
    onIslandView,
    onRetry
  }: {
    data: IslandConnectionsResponse | null;
    loading?: boolean;
    error?: string | null;
    routes?: boolean;
    inbound?: boolean;
    category?: IslandDemandCategory;
    focusedOriginId?: string | null;
    onRoutesChange: (value: boolean) => void;
    onInboundChange: (value: boolean) => void;
    onOriginChange: (id: string | null) => void;
    onFitRoutes: () => void;
    onFitInbound: () => void;
    onIslandView: () => void;
    onRetry: () => void;
  } = $props();

  let visibleFlows = $derived(data ? visibleIslandInboundFeatures(data, category) : []);
  let focused = $derived(data?.inbound.features.find((flow) => flow.properties.originIslandId === focusedOriginId));
  let positiveSourceCount = $derived(
    data?.inbound.features.filter((flow) => islandInboundDemandValue(flow.properties, category) > 0).length ?? 0
  );
  const number = (value: number) => Math.round(value).toLocaleString();
</script>

<section class="connection-controls" aria-label="Island connections on the map" aria-busy={loading}>
  <div class="connection-summary">
    <p>
      {#if data}
        <strong>{number(data.summary.routeCount)}</strong> routes
        <span aria-hidden="true">·</span>
        <strong>{number(positiveSourceCount)}</strong> demand origins
      {:else}
        Connections
      {/if}
    </p>
    <Button type="button" variant="ghost" size="xs" class="text-action" onclick={onIslandView}>Island view</Button>
  </div>
  <div class="layer-switches" aria-label="Connection layers">
    <Button type="button" variant="ghost" size="xs" aria-pressed={routes} onclick={() => onRoutesChange(!routes)}
      >Transport routes</Button
    >
    <Button type="button" variant="ghost" size="xs" aria-pressed={inbound} onclick={() => onInboundChange(!inbound)}
      >Inbound demand</Button
    >
  </div>

  {#if loading}
    <p class="map-note" role="status">Finding routes and demand links…</p>
  {:else if error}
    <p class="map-note error" role="alert">{error}</p>
    <Button type="button" variant="ghost" size="xs" class="text-action" onclick={onRetry}>Try again</Button>
  {:else if data}
    {#if routes}
      <div class="layer-row">
        <div class="route-key" aria-label="Transport route colours">
          <span><i class="bus" aria-hidden="true"></i><Bus size={13} aria-hidden="true" />Bus</span>
          <span><i class="ferry" aria-hidden="true"></i><Ship size={13} aria-hidden="true" />Ferry</span>
          <span><i class="air" aria-hidden="true"></i><Plane size={13} aria-hidden="true" />Air</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="text-action"
          disabled={!data.routes.features.length}
          onclick={onFitRoutes}>Fit routes ↗</Button
        >
      </div>
      {#if !data.routes.features.length}
        <p class="map-note">No mapped routes available.</p>
      {/if}
    {/if}
    {#if inbound}
      <div class="demand-key" aria-label="Higher inbound demand is darker red and thicker">
        <span class="low-flow" aria-hidden="true"></span><span class="high-flow" aria-hidden="true"></span><span
          >Higher demand</span
        >
      </div>
      <div class="map-stat">
        <span
          >{visibleFlows.length
            ? `Top ${visibleFlows.length} of ${positiveSourceCount} origins`
            : 'No inbound demand in this category'}</span
        >
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="text-action"
          disabled={!visibleFlows.length}
          onclick={onFitInbound}>Fit demand ↗</Button
        >
      </div>
      {#if visibleFlows.length}
        <label class="origin-field">
          <span>Inspect an origin</span>
          <select value={focusedOriginId ?? ''} onchange={(event) => onOriginChange(event.currentTarget.value || null)}>
            <option value="">All leading origins</option>
            {#each visibleFlows as flow (flow.id)}
              <option value={flow.properties.originIslandId}>
                {flow.properties.originName} · {number(islandInboundDemandValue(flow.properties, category))}
              </option>
            {/each}
          </select>
        </label>
      {/if}
      {#if focused}
        <p class="focus-stat" role="status">
          <strong>{focused.properties.originName} → {data.islandName}</strong>
          Health {number(focused.properties.health)} · Education {number(focused.properties.education)}
        </p>
      {/if}
    {/if}
    <details class="line-notes">
      <summary>About these lines</summary>
      <p class="map-note">
        Click a line for its terminals. Ferries follow water paths; flights join airports. Dashed paths are modeled. Red
        arcs show demand relationships, not travel routes.
      </p>
      {#if data.summary.sharedAirportName}
        <p class="map-note">Flights via {data.summary.sharedAirportName}, reached by land.</p>
      {/if}
      {#if data.summary.unmappedRouteCount}
        <p class="map-note">
          {data.summary.unmappedRouteCount} connections need terminal data or a verified mapped path.
        </p>
      {/if}
      {#if data.summary.mappedInboundSourceCount < data.summary.inboundSourceCount}
        <p class="map-note">
          {data.summary.inboundSourceCount - data.summary.mappedInboundSourceCount} origins have no mapped location.
        </p>
      {/if}
    </details>
  {/if}
</section>

<style>
  .connection-controls {
    color: var(--mobility-ink);
  }
  .connection-summary,
  .layer-row,
  .map-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .connection-summary p {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: 1.5;
  }
  .connection-summary strong {
    color: var(--mobility-ink);
    font-variant-numeric: tabular-nums;
  }
  .connection-summary p > span {
    margin-inline: 0.15rem;
  }
  :global(.connection-controls button) {
    cursor: pointer;
    font: inherit;
  }
  :global(.connection-controls button:disabled) {
    cursor: default;
    opacity: 0.45;
  }
  :global(.connection-controls button:focus-visible),
  select:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 3px;
  }
  :global(.connection-controls .text-action) {
    height: auto;
    min-height: 1.875rem;
    padding: 0.25rem 0.125rem;
    border: 0;
    background: transparent;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    white-space: nowrap;
  }
  :global(.connection-controls .text-action:hover:not(:disabled)) {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .layer-switches {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
    margin-top: 0.45rem;
    padding: 0.2rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  .layer-switches :global(button) {
    height: auto;
    min-height: 2.125rem;
    padding: 0.45rem 0.25rem;
    border: 0;
    border-radius: var(--mobility-radius-small);
    background: transparent;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .layer-switches :global(button[aria-pressed='true']) {
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-card);
  }
  .route-key {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }
  .route-key span {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    font-size: var(--mobility-text-sm);
  }
  .route-key i {
    width: 0.65rem;
    border-top: 2px solid;
  }
  .bus {
    color: var(--mobility-route-bus);
  }
  .ferry {
    color: var(--mobility-route-ferry);
  }
  .air {
    color: var(--mobility-route-air);
  }
  .layer-row {
    flex-wrap: wrap;
    gap: 0.1rem 0.5rem;
    margin-top: 0.5rem;
  }
  .map-stat {
    margin-top: 0.125rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
  }
  .demand-key {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.5rem;
    font-size: var(--mobility-text-sm);
  }
  .low-flow {
    width: 1rem;
    border-top: 1.5px solid var(--mobility-danger-soft);
  }
  .high-flow {
    width: 1.3rem;
    border-top: 4px solid var(--mobility-route-demand);
    border-radius: 3px;
  }
  .origin-field {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.4rem;
    font-size: var(--mobility-text-sm);
    color: var(--mobility-muted);
  }
  select {
    width: 100%;
    min-height: 2.125rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font: inherit;
    font-size: var(--mobility-text-sm);
  }
  .map-note {
    margin: 0.4rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: 1.5;
  }
  .error {
    color: var(--mobility-danger-ink);
  }
  .focus-stat {
    display: grid;
    gap: 0.25rem;
    margin: 0.5rem 0 0;
    padding: 0.55rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    line-height: 1.4;
  }
  .line-notes {
    margin-top: 0.6rem;
    padding-top: 0.35rem;
    border-top: 1px solid var(--mobility-border);
  }
  .line-notes summary {
    padding-block: 0.35rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    cursor: pointer;
  }
</style>
