<script lang="ts">
  import type { IslandDemandMetric } from './island-profile';

  import { demandComposition } from './island-chart-data';

  let { metric, label }: { metric: IslandDemandMetric | null; label: string } = $props();
  let mix = $derived(demandComposition(metric));
  let localHeight = $derived(((mix.localShare ?? 0) / 100) * 68);
  let inboundHeight = $derived(((mix.inboundShare ?? 0) / 100) * 68);
  const format = (value: number | null) => (value === null ? 'N/A' : Math.round(value).toLocaleString());

  function ribbon(sourceTop: number, targetTop: number, height: number): string {
    return `M 12 ${sourceTop} C 108 ${sourceTop}, 146 ${targetTop}, 244 ${targetTop} L 244 ${targetTop + height} C 146 ${targetTop + height}, 108 ${sourceTop + height}, 12 ${sourceTop + height} Z`;
  }
</script>

<div class="demand-flow" data-testid="island-demand-flow">
  <div class="mix-total">
    <strong>{format(mix.combined)}</strong>
    <span>On-island demand</span>
  </div>
  <dl class="mix-legend" aria-label={`${label} demand on this island`}>
    <div>
      <dt><i class="local-dot" aria-hidden="true"></i>Local</dt>
      <dd>{format(mix.local)}</dd>
    </div>
    <div>
      <dt><i class="inbound-dot" aria-hidden="true"></i>Inbound</dt>
      <dd>{format(mix.inbound)}</dd>
    </div>
  </dl>
  {#if mix.combined !== null && mix.combined > 0}
    <div class="ribbon-labels" aria-hidden="true"><span>Origin of demand</span><span>On this island</span></div>
    <svg viewBox="0 0 256 116" class="ribbon-chart" aria-hidden="true">
      {#if localHeight > 0}
        <path class="local-ribbon" d={ribbon(12, 24, localHeight)} />
        <rect class="local-node" x="6" y="12" width="6" height={localHeight} rx="1" />
        <rect class="local-node" x="244" y="24" width="6" height={localHeight} />
      {/if}
      {#if inboundHeight > 0}
        <path class="inbound-ribbon" d={ribbon(34 + localHeight, 24 + localHeight, inboundHeight)} />
        <rect class="inbound-node" x="6" y={34 + localHeight} width="6" height={inboundHeight} rx="1" />
        <rect class="inbound-node" x="244" y={24 + localHeight} width="6" height={inboundHeight} />
      {/if}
    </svg>
  {/if}
  <dl class="flow-highlights">
    <div>
      <dt><span aria-hidden="true">↗</span> Outbound</dt>
      <dd>{format(mix.outbound)}</dd>
      <small>Allocated elsewhere</small>
    </div>
    <div>
      <dt>Unserved</dt>
      <dd>{format(mix.unserved)}</dd>
      <small>No allocated service</small>
    </div>
  </dl>
  <p class="flow-note">
    {#if mix.combined === null}Demand mix unavailable.
    {:else if mix.combined === 0}No local or inbound demand modeled.
    {:else}Ribbon widths show local + inbound demand. Outbound is shown separately.{/if}
  </p>
</div>

<style>
  .demand-flow {
    min-width: 0;
    --flow-local: var(--mobility-accent);
    --flow-inbound: var(--mobility-chart-inbound);
  }
  .mix-total {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
    margin-top: 0.85rem;
  }
  .mix-total strong {
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-bold);
    line-height: 1.1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .mix-total span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .mix-legend {
    display: grid;
    gap: 0.55rem;
    margin: 0.85rem 0 0;
  }
  .mix-legend > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.2rem 0.45rem;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  dd {
    margin: 0;
    color: var(--mobility-text);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  dt i {
    width: 0.4rem;
    height: 0.4rem;
    flex: 0 0 auto;
    border-radius: 1px;
  }
  .local-dot,
  .local-node {
    fill: var(--flow-local);
    background: var(--flow-local);
  }
  .inbound-dot,
  .inbound-node {
    fill: var(--flow-inbound);
    background: var(--flow-inbound);
  }
  .ribbon-labels {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.9rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .ribbon-chart {
    display: block;
    width: 100%;
    height: auto;
    max-height: 8rem;
    margin-top: 0.3rem;
  }
  .local-ribbon {
    fill: var(--flow-local);
    opacity: 0.2;
  }
  .inbound-ribbon {
    fill: var(--flow-inbound);
    opacity: 0.55;
  }
  .flow-highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    margin: 0.65rem 0 0;
    padding-top: 0.7rem;
    border-top: 1px solid var(--mobility-border);
  }
  .flow-highlights > div {
    display: grid;
    align-content: start;
    gap: 0.18rem;
  }
  .flow-highlights dd {
    font-size: var(--mobility-text-xl);
    letter-spacing: -0.03em;
  }
  .flow-highlights small,
  .flow-note {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.45;
  }
  .flow-note {
    margin: 0.7rem 0 0;
  }
</style>
