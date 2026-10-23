<script lang="ts">
  import type { IslandDemandMetric } from './island-profile';

  type AllocationRow = {
    key: string;
    label: string;
    metric: IslandDemandMetric;
    inboundDemand: number;
  };

  let { rows }: { rows: AllocationRow[] } = $props();

  function amount(value: number): string {
    return Number.isFinite(value) && value >= 0 ? Math.round(value).toLocaleString() : 'N/A';
  }

  function part(value: number, total: number): number {
    return total > 0 && Number.isFinite(value) ? Math.max(0, (value / total) * 100) : 0;
  }
</script>

<div class="allocation-lanes">
  <div class="allocation-heading">
    <h4>Resident demand allocation</h4>
  </div>
  {#each rows as row (row.key)}
    {@const metric = row.metric}
    {@const servedOutbound = Math.max(0, metric.outbound - metric.unserved)}
    {@const residentTotal = metric.local + metric.outbound}
    {@const barTotal = residentTotal + row.inboundDemand}
    <section class="allocation-row" aria-label={`${row.label} demand allocation`}>
      <div class="allocation-topline">
        <strong>{row.label}</strong>
        <span><b>{amount(residentTotal)}</b> resident demand</span>
      </div>
      <div
        class="allocation-track"
        class:allocation-empty={barTotal === 0}
        role="img"
        aria-label={`${row.label}: ${amount(metric.local)} on island, ${amount(servedOutbound)} served outbound, ${amount(metric.unserved)} unserved, ${amount(row.inboundDemand)} inbound from other islands`}
      >
        {#if barTotal > 0}
          <span class="allocation-local" style:width={`${part(metric.local, barTotal)}%`}></span>
          <span class="allocation-outbound" style:width={`${part(servedOutbound, barTotal)}%`}></span>
          <span class="allocation-unserved" style:width={`${part(metric.unserved, barTotal)}%`}></span>
          <span class="allocation-inbound-segment" style:width={`${part(row.inboundDemand, barTotal)}%`}></span>
        {/if}
      </div>
      <dl class="allocation-values">
        <div>
          <dt><i class="key-local" aria-hidden="true"></i>On island</dt>
          <dd>{amount(metric.local)}</dd>
        </div>
        <div>
          <dt><i class="key-outbound" aria-hidden="true"></i>Served outbound</dt>
          <dd>{amount(servedOutbound)}</dd>
        </div>
        <div>
          <dt><i class="key-unserved" aria-hidden="true"></i>Unserved</dt>
          <dd>{amount(metric.unserved)}</dd>
        </div>
        <div>
          <dt><i class="key-inbound" aria-hidden="true"></i>Inbound</dt>
          <dd>{amount(row.inboundDemand)}</dd>
        </div>
      </dl>
    </section>
  {:else}
    <p class="allocation-empty-copy">Demand allocation is unavailable.</p>
  {/each}
</div>

<style>
  .allocation-lanes {
    display: grid;
    gap: 0.85rem;
    margin-top: 0.8rem;
  }
  .allocation-heading {
    display: grid;
    gap: 0.2rem;
  }
  h4 {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.64rem;
    font-weight: 750;
  }
  .allocation-topline > span,
  dt,
  .allocation-empty-copy {
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
    line-height: 1.4;
  }
  .allocation-row {
    min-width: 0;
  }
  .allocation-topline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 0.6rem;
    margin-bottom: 0.4rem;
  }
  .allocation-topline > strong {
    color: var(--mobility-text, #09090b);
    font-size: 0.62rem;
    font-weight: 750;
  }
  .allocation-topline b,
  dd {
    color: var(--mobility-text, #09090b);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .allocation-track {
    display: flex;
    gap: 2px;
    height: 0.7rem;
    overflow: hidden;
    border-radius: 0.25rem;
    background: var(--mobility-surface-muted, #f4f4f5);
  }
  .allocation-track span {
    display: block;
    min-width: 0;
    height: 100%;
  }
  .allocation-local,
  .key-local {
    background: var(--mobility-accent, #09090b);
  }
  .allocation-outbound,
  .key-outbound {
    background: var(--mobility-muted, #71717a);
  }
  .allocation-unserved,
  .key-unserved {
    background: repeating-linear-gradient(135deg, #a1a1aa 0 2px, var(--mobility-border, #e4e4e7) 2px 4px);
  }
  .allocation-inbound-segment,
  .key-inbound {
    background: #d4d4d8;
  }
  .allocation-values {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    margin: 0.45rem 0 0;
  }
  .allocation-values > div {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  dt i {
    width: 0.35rem;
    height: 0.35rem;
    flex: none;
    border-radius: 1px;
  }
  dd {
    margin: 0;
    font-size: 0.6rem;
  }
  .allocation-empty-copy {
    margin: 0;
  }
</style>
