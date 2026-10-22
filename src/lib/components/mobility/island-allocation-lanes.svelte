<script lang="ts">
  import type { IslandDemandMetric } from './island-profile';

  type AllocationRow = {
    key: string;
    label: string;
    metric: IslandDemandMetric;
  };

  let { rows }: { rows: AllocationRow[] } = $props();

  function amount(value: number): string {
    return Number.isFinite(value) && value >= 0 ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : 'N/A';
  }

  function part(value: number, total: number): number {
    return total > 0 && Number.isFinite(value) ? Math.max(0, (value / total) * 100) : 0;
  }
</script>

<div class="allocation-lanes">
  <div class="allocation-heading">
    <h4>Where resident demand is allocated</h4>
    <span>Share of each service’s resident demand</span>
  </div>

  {#each rows as row (row.key)}
    {@const metric = row.metric}
    {@const total = metric.local + metric.outbound + metric.unserved}
    <section class="allocation-row" aria-label={`${row.label} demand allocation`}>
      <div class="allocation-topline">
        <strong>{row.label}</strong>
        <span><b>{amount(total)}</b> resident demand</span>
      </div>
      <div
        class="allocation-track"
        class:allocation-empty={total === 0}
        role="img"
        aria-label={total > 0
          ? `${row.label}: ${amount(metric.local)} allocated on island, ${amount(metric.outbound)} allocated off island, ${amount(metric.unserved)} with no allocated service. Total resident demand ${amount(total)}.`
          : `${row.label}: no resident demand is recorded.`}
      >
        {#if total > 0}
          <span class="allocation-local" style:width={`${part(metric.local, total)}%`}></span>
          <span class="allocation-outbound" style:width={`${part(metric.outbound, total)}%`}></span>
          <span class="allocation-unserved" style:width={`${part(metric.unserved, total)}%`}></span>
        {/if}
      </div>
      <dl class="allocation-values">
        <div>
          <dt><i class="key-local" aria-hidden="true"></i>On island</dt>
          <dd>{amount(metric.local)}</dd>
        </div>
        <div>
          <dt><i class="key-outbound" aria-hidden="true"></i>Outbound</dt>
          <dd>{amount(metric.outbound)}</dd>
        </div>
        <div>
          <dt><i class="key-unserved" aria-hidden="true"></i>Unserved</dt>
          <dd>{amount(metric.unserved)}</dd>
        </div>
      </dl>
      <div class="allocation-inbound">
        <span>Inbound from other islands</span><strong>{amount(metric.inbound)}</strong>
      </div>
    </section>
  {/each}
</div>

<style>
  .allocation-lanes {
    display: grid;
    gap: 1rem;
  }
  .allocation-heading {
    display: grid;
    gap: 0.25rem;
  }
  h4 {
    margin: 0;
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.015em;
  }
  .allocation-heading > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.45;
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
    margin-bottom: 0.5rem;
  }
  .allocation-topline > strong {
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .allocation-topline > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .allocation-topline b {
    color: var(--mobility-ink);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .allocation-track {
    display: flex;
    gap: 2px;
    height: 0.9rem;
    overflow: hidden;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  .allocation-track span {
    display: block;
    min-width: 0;
    height: 100%;
  }
  .allocation-local,
  .key-local {
    background: var(--mobility-accent);
  }
  .allocation-outbound,
  .key-outbound {
    background: var(--mobility-chart-outbound);
  }
  .allocation-unserved,
  .key-unserved {
    background: repeating-linear-gradient(135deg, var(--mobility-chart-unserved) 0 2px, var(--mobility-border) 2px 4px);
  }
  .allocation-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0.5rem 0 0;
  }
  .allocation-values > div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  dt {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  dt i {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 2px;
    flex: none;
  }
  dd {
    margin: 0;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .allocation-inbound {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.55rem;
    padding-top: 0.45rem;
    border-top: 1px dashed var(--mobility-border);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .allocation-inbound strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
</style>
