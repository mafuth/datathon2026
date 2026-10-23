<script lang="ts">
  import type { ProposalImpact } from '$lib/mobility/proposal-planning';

  import { proposalUnitFill } from '$lib/mobility/proposal-chart-data';

  let { impact }: { impact: ProposalImpact } = $props();
  const uid = $props.id();
  const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const actualMaximum = $derived(
    Math.max(0, ...impact.categories.flatMap((row) => [row.beforeDemand ?? 0, row.afterDemand ?? 0]))
  );
  const maximum = $derived(actualMaximum || 1);
  const unitsPerCell = $derived(
    Math.max(
      1,
      Math.ceil(
        Math.max(0, ...impact.categories.flatMap((row) => [row.beforeServiceCount, row.afterServiceCount])) / 50
      )
    )
  );
  const cells = Array.from({ length: 50 }, (_, index) => index);
  function display(value: number | null): string {
    return value === null ? 'Unavailable' : number.format(value);
  }
  function change(before: number | null, after: number | null): string {
    if (before === null || after === null) return 'Comparison unavailable';
    const delta = Math.round((after - before) * 100) / 100;
    return delta === 0 ? 'No change' : `${delta > 0 ? '+' : '−'}${number.format(Math.abs(delta))}`;
  }
  function facilityChange(before: number, after: number): string {
    const delta = after - before;
    return delta === 0 ? 'No change' : `${change(before, after)} ${Math.abs(delta) === 1 ? 'facility' : 'facilities'}`;
  }
  const position = (value: number, max: number) => 7 + (Math.max(0, value) / max) * 286;
</script>

<div class="impact-charts">
  <figure class="impact-chart demand-chart" aria-labelledby={`${uid}-demand-title`} data-proposal-chart="demand">
    <figcaption>
      <p class="chart-kicker">A direct comparison</p>
      <h4 id={`${uid}-demand-title`}>Modeled demand by service</h4>
      <p>Follow the two endpoints to see the change in allocations.</p>
    </figcaption>
    <div class="chart-legend" aria-hidden="true">
      <span><i class="before-dot"></i>Without proposal</span><span><i class="after-dot"></i>With proposal</span>
    </div>
    <div class="demand-rows">
      {#each impact.categories as row (row.category)}
        <div class="demand-row">
          <div class="row-heading">
            <strong>{row.label}</strong><span
              >{row.status === 'partial' ? 'Partial evidence' : change(row.beforeDemand, row.afterDemand)}</span
            >
          </div>
          <svg viewBox="0 0 300 32" aria-hidden="true">
            <line x1="7" x2="293" y1="16" y2="16" class="plot-track" />
            {#each [0, 0.5, 1] as fraction (fraction)}
              <line x1={7 + fraction * 286} x2={7 + fraction * 286} y1="11" y2="21" class="plot-tick" />
            {/each}
            {#if row.beforeDemand !== null && row.afterDemand !== null}
              <line
                x1={position(row.beforeDemand, maximum)}
                x2={position(row.afterDemand, maximum)}
                y1="16"
                y2="16"
                class="change-connector"
              />
            {/if}
            {#if row.beforeDemand !== null}<circle
                cx={position(row.beforeDemand, maximum)}
                cy="16"
                r="6"
                class="baseline-point"
              />{/if}
            {#if row.afterDemand !== null}<circle
                cx={position(row.afterDemand, maximum)}
                cy="16"
                r="3.6"
                class="proposal-point"
              />{/if}
          </svg>
          <dl class="comparison-values">
            <div>
              <dt>Without</dt>
              <dd>{display(row.beforeDemand)}</dd>
            </div>
            <div>
              <dt>With proposal</dt>
              <dd>{display(row.afterDemand)}</dd>
            </div>
          </dl>
        </div>
      {/each}
    </div>
    <div class="chart-scale" aria-hidden="true">
      <span>0</span><span>{number.format(maximum)} allocations · common scale</span>
    </div>
    <p class="chart-footnote">
      Allocations can overlap across needs and stops. A change is not a count of residents gaining access. Missing
      values are left unplotted.
    </p>
  </figure>

  <figure
    class="impact-chart facility-chart"
    aria-labelledby={`${uid}-facilities-title`}
    data-proposal-chart="facilities"
  >
    <figcaption>
      <p class="chart-kicker">The service footprint</p>
      <h4 id={`${uid}-facilities-title`}>Facilities, tile by tile</h4>
      <p>
        One tile = {number.format(unitsPerCell)}
        {unitsPerCell === 1 ? 'recorded facility' : 'recorded facilities'}. Part tiles show the remainder.
      </p>
    </figcaption>
    <div class="chart-legend" aria-hidden="true">
      <span><i class="before-tile"></i>Without proposal</span><span><i class="after-tile"></i>With proposal</span>
    </div>
    <div class="facility-rows">
      {#each impact.categories as row (row.category)}
        <div class="facility-row">
          <div class="row-heading">
            <strong>{row.label}</strong><span>{facilityChange(row.beforeServiceCount, row.afterServiceCount)}</span>
          </div>
          <div class="unit-comparison">
            {#each [{ key: 'before', label: 'Without', value: row.beforeServiceCount }, { key: 'after', label: 'With proposal', value: row.afterServiceCount }] as series (series.key)}
              <div class="unit-series" data-series={series.key}>
                <div class="unit-heading">
                  <span>{series.label}</span><strong>{number.format(series.value)}</strong>
                </div>
                <svg viewBox="0 0 100 50" aria-hidden="true">
                  {#each cells as index (index)}
                    {@const x = (index % 10) * 10 + 1}
                    {@const y = Math.floor(index / 10) * 10 + 1}
                    {@const filled = proposalUnitFill(series.value, unitsPerCell, index)}
                    <rect {x} {y} width="8" height="8" rx="1.5" class="unit-track" />
                    {#if filled > 0}<rect
                        {x}
                        {y}
                        width={8 * filled}
                        height="8"
                        rx={filled === 1 ? 1.5 : 0}
                        class="unit-fill"
                      />{/if}
                  {/each}
                </svg>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <p class="chart-footnote">
      Each category uses the same tile unit and 50-tile frame. Counts include entries without usable coordinates;
      boarding points do not establish scheduled services.
    </p>
  </figure>
</div>

<style>
  .impact-charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
  }
  .impact-chart {
    min-width: 0;
    margin: 0;
    padding: 1.15rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-card);
  }
  .chart-kicker {
    margin: 0 0 0.4rem;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.075em;
    text-transform: uppercase;
  }
  h4 {
    margin: 0;
    font-family: var(--mobility-font-heading);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.025em;
  }
  figcaption > p:last-child {
    margin: 0.3rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.8rem;
    margin: 1rem 0 1.1rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .chart-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .chart-legend i {
    width: 0.55rem;
    height: 0.55rem;
  }
  .before-dot {
    border: 1.5px solid var(--mobility-chart-before);
    border-radius: 50%;
    background: var(--mobility-surface);
  }
  .after-dot {
    border-radius: 50%;
    background: var(--mobility-chart-after);
  }
  .before-tile {
    border-radius: 2px;
    background: var(--mobility-chart-before);
  }
  .after-tile {
    border-radius: 2px;
    background: var(--mobility-chart-after);
  }
  .demand-rows {
    display: grid;
    gap: 1.125rem;
  }
  .row-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    font-size: var(--mobility-text-sm);
  }
  .row-heading strong {
    font-weight: var(--mobility-font-weight-semibold);
  }
  .row-heading > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  .demand-row svg {
    display: block;
    width: 100%;
    height: 32px;
    margin: 0.2rem 0;
  }
  .plot-track {
    stroke: var(--mobility-border);
    stroke-width: 2;
  }
  .plot-tick {
    stroke: var(--mobility-chart-grid);
    stroke-width: 1;
  }
  .change-connector {
    stroke: var(--mobility-chart-connector);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .baseline-point {
    fill: var(--mobility-surface);
    stroke: var(--mobility-chart-before);
    stroke-width: 1.6;
  }
  .proposal-point {
    fill: var(--mobility-chart-after);
  }
  .comparison-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .comparison-values > div {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.3rem;
  }
  .comparison-values dt {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .comparison-values dd {
    margin: 0;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .chart-scale {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 1rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  .facility-rows {
    display: grid;
    gap: 1rem;
  }
  .unit-comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 0.55rem;
  }
  .unit-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .unit-heading strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .unit-series svg {
    display: block;
    width: 100%;
    max-height: 68px;
    margin-top: 0.35rem;
  }
  .unit-track {
    fill: var(--mobility-border);
  }
  .unit-fill {
    fill: var(--mobility-chart-after);
  }
  .unit-series[data-series='before'] .unit-fill {
    fill: var(--mobility-chart-before);
  }
  .chart-footnote {
    margin: 1rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--mobility-border);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-relaxed);
  }
  @media (max-width: 700px) {
    .impact-charts {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    .impact-chart {
      padding: 1rem;
    }
  }
  @media (max-width: 360px) {
    .unit-comparison {
      gap: 0.6rem;
    }
  }
</style>
