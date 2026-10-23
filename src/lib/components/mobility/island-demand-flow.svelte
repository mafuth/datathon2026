<script lang="ts">
  import type { IslandDemandMetric } from './island-profile';

  import { demandComposition } from './island-chart-data';

  let { metric, label }: { metric: IslandDemandMetric | null; label: string } = $props();
  let mix = $derived(demandComposition(metric));
  let localHeight = $derived(((mix.localShare ?? 0) / 100) * 68);
  let inboundHeight = $derived(((mix.inboundShare ?? 0) / 100) * 68);
  let outboundHeight = $derived(((mix.outboundShare ?? 0) / 100) * 68);

  function format(value: number | null): string {
    return value === null ? 'N/A' : Math.round(value).toLocaleString();
  }

  function ribbon(sourceTop: number, targetTop: number, height: number): string {
    return `M 12 ${sourceTop} C 108 ${sourceTop}, 146 ${targetTop}, 244 ${targetTop} L 244 ${targetTop + height} C 146 ${targetTop + height}, 108 ${sourceTop + height}, 12 ${sourceTop + height} Z`;
  }
</script>

<div class="demand-flow">
  <div class="mix-total">
    <strong>{format(mix.combined)}</strong>
    <span>On-island {label.toLowerCase()} demand</span>
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
    <div>
      <dt><i class="outbound-dot" aria-hidden="true"></i>Outbound</dt>
      <dd>{format(mix.outbound)}</dd>
    </div>
  </dl>
  {#if mix.chartTotal !== null && mix.chartTotal > 0}
    <div class="ribbon-labels" aria-hidden="true"><span>Demand</span><span>Allocation</span></div>
    <svg viewBox="0 0 256 116" class="ribbon-chart" aria-hidden="true">
      {#if localHeight > 0}
        <path class="local-ribbon" d={ribbon(12, 24, localHeight)} />
        <rect class="local-node" x="6" y="12" width="6" height={localHeight} rx="1" />
        <rect class="local-node" x="244" y="24" width="6" height={localHeight} />
      {/if}
      {#if inboundHeight > 0}
        <path class="inbound-ribbon" d={ribbon(24 + localHeight, 24 + localHeight, inboundHeight)} />
        <rect class="inbound-node" x="6" y={24 + localHeight} width="6" height={inboundHeight} rx="1" />
        <rect class="inbound-node" x="244" y={24 + localHeight} width="6" height={inboundHeight} />
      {/if}
      {#if outboundHeight > 0}
        <path
          class="outbound-ribbon"
          d={ribbon(24 + localHeight + inboundHeight, 24 + localHeight + inboundHeight, outboundHeight)}
        />
        <rect
          class="outbound-node"
          x="6"
          y={24 + localHeight + inboundHeight}
          width="6"
          height={outboundHeight}
          rx="1"
        />
        <rect class="outbound-node" x="244" y={24 + localHeight + inboundHeight} width="6" height={outboundHeight} />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .demand-flow {
    min-width: 0;
    --flow-local: var(--mobility-accent, #09090b);
    --flow-inbound: var(--mobility-muted, #71717a);
    --flow-outbound: #a1a1aa;
  }
  .mix-total {
    display: grid;
    gap: 0.2rem;
    margin-top: 0.65rem;
  }
  .mix-total strong {
    color: var(--mobility-text, #09090b);
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .mix-total span,
  dt,
  .ribbon-labels {
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
    line-height: 1.4;
  }
  .mix-legend {
    display: grid;
    gap: 0.4rem;
    margin: 0.7rem 0 0;
  }
  .mix-legend > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.35rem;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  dd {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.64rem;
    font-weight: 700;
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
  .outbound-dot,
  .outbound-node {
    fill: var(--flow-outbound);
    background: var(--flow-outbound);
  }
  .ribbon-labels {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .ribbon-chart {
    display: block;
    width: 100%;
    height: auto;
    max-height: 7rem;
    margin-top: 0.25rem;
  }
  .local-ribbon {
    fill: var(--flow-local);
    opacity: 0.16;
  }
  .inbound-ribbon {
    fill: var(--flow-inbound);
    opacity: 0.42;
  }
  .outbound-ribbon {
    fill: var(--flow-outbound);
    opacity: 0.3;
  }
</style>
