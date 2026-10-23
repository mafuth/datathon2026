<script lang="ts">
  import type { ProposalCosts, ProposalSettings } from '$lib/mobility/proposal-planning';

  import { proposalCostTreemap, proposalCostWaterfall, proposalUnitFill } from '$lib/mobility/proposal-chart-data';

  let { costs, settings }: { costs: ProposalCosts; settings: ProposalSettings } = $props();
  const uid = $props.id();
  const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  const projections = $derived([
    { years: 1, total: costs.oneYear },
    { years: 5, total: costs.fiveYear },
    { years: 10, total: costs.tenYear }
  ]);
  const waterfall = $derived(proposalCostWaterfall(costs));
  const maximum = $derived(Math.max(1, costs.tenYear));
  const tiles = $derived(proposalCostTreemap(costs));
  const budgets = $derived([
    { key: 'capital', label: 'Upfront investment', spend: costs.capital, limit: settings.capitalLimit },
    { key: 'annual', label: 'Annual running cost', spend: costs.annual, limit: settings.annualLimit }
  ]);
  const cells = Array.from({ length: 100 }, (_, index) => index);
  const palette = Array.from({ length: 6 }, (_, index) => `var(--mobility-chart-cost-${index + 1})`);
  function money(value: number): string {
    return `MVR ${number.format(value)}`;
  }
  function budgetLabel(spend: number, limit: number): string {
    if (limit === 0) return spend === 0 ? 'No spend · zero limit' : 'Above zero limit';
    return `${number.format((spend / limit) * 100)}% of limit`;
  }
</script>

<div class="cost-charts" data-proposal-chart="costs">
  <figure class="cost-timeline" aria-labelledby={`${uid}-cost-title`}>
    <figcaption>
      <p class="chart-kicker">The funding horizon</p>
      <h4 id={`${uid}-cost-title`}>How the 10-year cost builds</h4>
      <p>An additive waterfall: upfront investment, then running allowances.</p>
    </figcaption>
    {#if costs.complete}
      <svg
        class="timeline-svg"
        viewBox="0 0 360 230"
        role="img"
        aria-labelledby={`${uid}-plot-title ${uid}-plot-description`}
      >
        <title id={`${uid}-plot-title`}>Ten-year planning cost waterfall</title>
        <desc id={`${uid}-plot-description`}
          >Upfront {money(costs.capital)}, year one running {money(costs.annual)}, years two to five {money(
            costs.annual * 4
          )}, years six to ten {money(costs.annual * 5)}. Total {money(costs.tenYear)}.</desc
        >
        {#each [0, 0.5, 1] as fraction (fraction)}
          {@const y = 176 - fraction * 125}
          <line x1="43" x2="347" y1={y} y2={y} class="plot-grid" />
          <text x="37" y={y + 4} text-anchor="end" class="axis-label">{compact.format(maximum * fraction)}</text>
        {/each}
        <text x="8" y="24" class="axis-unit">MVR</text>
        {#each waterfall as step, index (step.id)}
          {@const x = 50 + index * 59}
          {@const top = 176 - (step.end / maximum) * 125}
          {@const bottom = 176 - (step.start / maximum) * 125}
          {#if index < waterfall.length - 1}<line
              x1={x + 34}
              x2={x + 59}
              y1={top}
              y2={top}
              class="waterfall-connector"
            />{/if}
          {#if step.value > 0}<rect
              {x}
              y={top}
              width="34"
              height={bottom - top}
              rx="1.5"
              class:total-block={step.total}
              class:upfront-block={index === 0}
              class:running-block={!step.total && index > 0}
            />{:else}<line x1={x} x2={x + 34} y1={top} y2={top} class="zero-mark" />{/if}
          <text x={x + 17} y={Math.max(36, top - 8)} text-anchor="middle" class="total-label"
            >{step.total || index === 0 ? '' : '+'}{compact.format(step.value)}</text
          >
          <text x={x + 17} y="199" text-anchor="middle" class="horizon-label"
            >{index === 4 ? '10-year' : step.label}</text
          >
          {#if index === 4}<text x={x + 17} y="215" text-anchor="middle" class="horizon-label">total</text>{/if}
        {/each}
      </svg>
      <dl class="horizon-values">
        {#each projections as row (row.years)}<div>
            <dt>{row.years === 1 ? '1 year' : `${row.years} years`}</dt>
            <dd>{money(row.total)}</dd>
          </div>{/each}
      </dl>
      <p class="chart-footnote">
        Capital + annual cost × years. Undiscounted; no inflation, finance, revenues or unpriced scope. This is a cost
        illustration, not a demand forecast.
      </p>
    {:else}
      <div class="missing-costs">
        <span>Incomplete estimate</span><strong>The full funding horizon is unavailable.</strong>
        <p>
          Some accepted changes have no scoped cost. Known allowances below exclude these items and do not represent the
          full proposal cost.
        </p>
      </div>
    {/if}
  </figure>

  <figure class="budget-chart" aria-labelledby={`${uid}-budget-title`}>
    <figcaption>
      <p class="chart-kicker">Two independent limits</p>
      <h4 id={`${uid}-budget-title`}>Room in the budget</h4>
      <p>
        {costs.complete
          ? 'Each 100-tile grid represents one budget limit.'
          : 'Known allowances only. Each grid represents one budget limit.'}
      </p>
    </figcaption>
    <div class="budget-rows">
      {#each budgets as budget (budget.key)}
        {@const over = budget.spend > budget.limit}
        {@const percent = budget.limit > 0 ? Math.min(100, (budget.spend / budget.limit) * 100) : 0}
        <div class="budget-row" data-over={over}>
          <div class="budget-heading">
            <strong>{budget.label}</strong><span>{budgetLabel(budget.spend, budget.limit)}</span>
          </div>
          <div class="budget-waffle-row">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              {#each cells as index (index)}
                {@const x = (index % 10) * 10 + 1}
                {@const y = Math.floor(index / 10) * 10 + 1}
                {@const filled = proposalUnitFill(percent, 1, index)}
                <rect {x} {y} width="8" height="8" rx="1.5" class="waffle-track" />
                {#if filled > 0}<rect
                    {x}
                    {y}
                    width={filled * 8}
                    height="8"
                    rx={filled === 1 ? 1.5 : 0}
                    class="waffle-spend"
                  />{/if}
              {/each}
            </svg>
            <div class="budget-numbers">
              <p class="budget-amount">{money(budget.spend)}<span>of {money(budget.limit)}</span></p>
              <div class="budget-remainder">
                <span>{over ? 'Above limit' : costs.complete ? 'Remaining' : 'Uncommitted by known scope'}</span><strong
                  >{money(Math.abs(budget.limit - budget.spend))}</strong
                >
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
    <p class="chart-footnote">
      One tile = 1% of its limit; a part tile shows the remainder. Grids fill at 100%; any excess is stated above. A
      zero limit has no percentage ratio and its grid stays empty.
    </p>
    {#if !costs.complete}<p class="incomplete-note">
        Unpriced items are excluded and still require a scoped estimate.
      </p>{/if}
  </figure>

  <figure class="cost-composition" aria-labelledby={`${uid}-composition-title`} data-proposal-chart="cost-composition">
    <figcaption>
      <p class="chart-kicker">The shape of the investment</p>
      <h4 id={`${uid}-composition-title`}>Where the 10-year allowance goes</h4>
      <p>Tile area represents upfront capital plus ten years of running costs for each improvement.</p>
    </figcaption>
    {#if tiles.length}
      <div class="composition-layout">
        <svg viewBox="0 0 360 180" role="img" aria-labelledby={`${uid}-treemap-title ${uid}-treemap-description`}>
          <title id={`${uid}-treemap-title`}>Proportional cost treemap</title><desc id={`${uid}-treemap-description`}
            >The five largest priced improvements and the remaining items grouped as Other. Exact values and shares
            follow in the legend.</desc
          >
          {#each tiles as tile, index (tile.id)}
            <rect
              x={tile.x}
              y={tile.y}
              width={tile.width}
              height={tile.height}
              fill={palette[index]}
              stroke="var(--mobility-surface)"
              stroke-width="2"
            />
            {#if tile.width > 29 && tile.height > 24}<text
                x={tile.x + 11}
                y={tile.y + 21}
                class="tile-number"
                class:dark-number={index > 0}>{String(index + 1).padStart(2, '0')}</text
              >{/if}
            {#if tile.width > 100 && tile.height > 62}<text
                x={tile.x + 11}
                y={tile.y + 47}
                class="tile-share"
                class:dark-number={index > 0}>{number.format(tile.share * 100)}%</text
              >{/if}
          {/each}
        </svg>
        <ol class="composition-key">
          {#each tiles as tile, index (tile.id)}<li>
              <span class="tile-key" class:dark-key={index > 0} style:background={palette[index]}
                >{String(index + 1).padStart(2, '0')}</span
              >
              <div>
                <strong>{tile.label}{tile.itemCount > 1 ? ` (${tile.itemCount})` : ''}</strong><span
                  >{money(tile.value)} · {number.format(tile.share * 100)}%</span
                >
              </div>
            </li>{/each}
        </ol>
      </div>
      <p class="chart-footnote">
        {costs.complete ? 'Priced improvements only.' : 'Incomplete proposal: this shows known priced scope only.'} Zero-cost
        changes and unpriced items have no area. Costs use the same assumptions as the funding horizon.
      </p>
    {:else}<p class="chart-footnote">
        There are no positive priced allowances to compare yet. Zero-cost changes and unpriced items have no tile area.
      </p>{/if}
  </figure>
</div>

<style>
  .cost-charts {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
    gap: 1rem;
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
  }
  figure {
    min-width: 0;
    margin: 0;
    padding: 1.15rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-card);
  }
  .cost-timeline {
    background: var(--mobility-accent-soft);
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
  .timeline-svg {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 0.65rem;
  }
  .plot-grid {
    stroke: var(--mobility-border);
    stroke-dasharray: 3 4;
  }
  .axis-label,
  .axis-unit {
    fill: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    font-variant-numeric: tabular-nums;
  }
  .axis-unit {
    font-size: var(--mobility-text-xs);
    letter-spacing: 0.06em;
  }
  .total-label {
    fill: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .horizon-label {
    fill: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .upfront-block {
    fill: var(--mobility-accent);
  }
  .running-block {
    fill: var(--mobility-chart-cost-2);
  }
  .total-block {
    fill: var(--mobility-accent);
  }
  .waterfall-connector {
    stroke: var(--mobility-chart-connector);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .zero-mark {
    stroke: var(--mobility-accent);
    stroke-width: 2;
  }
  .horizon-values {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin: 0.7rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--mobility-border);
  }
  .horizon-values dt {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .horizon-values dd {
    margin: 0.3rem 0 0;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .chart-footnote {
    margin: 0.85rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-relaxed);
  }
  .budget-rows {
    display: grid;
    gap: 1.1rem;
    margin-top: 1.2rem;
  }
  .budget-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.2rem 0.5rem;
  }
  .budget-heading strong {
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .budget-heading > span {
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  .budget-waffle-row {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr);
    align-items: center;
    gap: 0.8rem;
    margin-top: 0.55rem;
  }
  .budget-row svg {
    display: block;
    width: 84px;
    height: 84px;
  }
  .waffle-track {
    fill: var(--mobility-border);
  }
  .waffle-spend {
    fill: var(--mobility-accent);
  }
  .budget-amount {
    margin: 0;
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    line-height: var(--mobility-leading-normal);
    overflow-wrap: anywhere;
  }
  .budget-amount > span {
    display: block;
    margin-top: 0.2rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  .budget-remainder {
    display: grid;
    gap: 0.15rem;
    margin-top: 0.65rem;
    font-size: var(--mobility-text-xs);
    color: var(--mobility-muted);
    font-variant-numeric: tabular-nums;
  }
  .budget-remainder strong {
    color: var(--mobility-ink);
    font-weight: var(--mobility-font-weight-medium);
    overflow-wrap: anywhere;
  }
  .budget-row[data-over='true'] .budget-heading > span,
  .budget-row[data-over='true'] .budget-remainder,
  .budget-row[data-over='true'] .budget-remainder strong {
    color: var(--mobility-warning-ink);
  }
  .budget-row[data-over='true'] .waffle-spend {
    fill: var(--mobility-warning);
  }
  .incomplete-note {
    margin: 0.8rem 0 0;
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-relaxed);
  }
  .missing-costs {
    display: grid;
    gap: 0.7rem;
    margin-top: 1.3rem;
    padding: 1.1rem;
    border: 1px dashed var(--mobility-warning-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-warning-soft);
  }
  .missing-costs > span {
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .missing-costs > strong {
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-md);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .missing-costs p {
    margin: 0;
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-relaxed);
  }
  .cost-composition {
    grid-column: 1 / -1;
  }
  .composition-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: center;
    gap: 1.2rem;
    margin-top: 1rem;
  }
  .composition-layout svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .tile-number {
    fill: var(--mobility-on-accent);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .tile-share {
    fill: var(--mobility-on-accent);
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .dark-number {
    fill: var(--mobility-ink);
  }
  .composition-key {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .composition-key li {
    display: flex;
    align-items: flex-start;
    gap: 0.55rem;
  }
  .tile-key {
    display: grid;
    flex: 0 0 1.45rem;
    width: 1.45rem;
    height: 1.45rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--mobility-radius-small);
    color: var(--mobility-on-accent);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    text-shadow: var(--mobility-shadow-text);
  }
  .tile-key.dark-key {
    color: var(--mobility-ink);
    text-shadow: none;
  }
  .composition-key li > div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }
  .composition-key strong {
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: var(--mobility-leading-normal);
    overflow-wrap: anywhere;
  }
  .composition-key li > div > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 700px) {
    .cost-charts,
    .composition-layout {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    figure {
      padding: 1rem;
    }
    .budget-waffle-row {
      grid-template-columns: 100px minmax(0, 1fr);
    }
    .budget-row svg {
      width: 100px;
      height: 100px;
    }
    .composition-key {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.8rem;
    }
  }
  @media (max-width: 390px) {
    .composition-key {
      grid-template-columns: 1fr;
    }
    .horizon-values {
      grid-template-columns: 1fr;
    }
    .horizon-values > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .horizon-values dd {
      margin: 0;
      text-align: right;
    }
  }
</style>
