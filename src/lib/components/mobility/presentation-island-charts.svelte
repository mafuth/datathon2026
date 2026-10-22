<script lang="ts">
  import type { IslandProfile } from './island-profile';
  import type { AnalyticsIsland } from './national-analytics-card.svelte';

  import Bus from '@lucide/svelte/icons/bus';
  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';

  import { Button } from '$components/ui/button';

  import {
    chartAmount,
    chartScore,
    demandComposition,
    islandScoreMetrics,
    populationComposition
  } from './island-chart-data';

  let {
    profile,
    island = null,
    compact = false
  }: { profile: IslandProfile; island?: AnalyticsIsland | null; compact?: boolean } = $props();
  let page = $state<'people' | 'demand'>('people');
  const format = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  const levels = [25, 50, 75, 100];
  const accessDots = Array.from({ length: 10 }, (_, index) => index);
  let metrics = $derived(
    islandScoreMetrics(island?.id === profile.island.id ? island : null).map((metric) => ({
      ...metric,
      value: chartScore(metric.value)
    }))
  );
  let hasScores = $derived(metrics.some((metric) => metric.value !== null));
  let completeScores = $derived(metrics.every((metric) => metric.value !== null));
  let ageParts = $derived(populationComposition(profile.population.bands, profile.population.total));
  let populationDensity = $derived.by(() => {
    const population = chartAmount(profile.population.total);
    const area = chartAmount(profile.island.landAreaKm2);
    if (population === null || area === null || area === 0) return null;
    const density = population / area;
    return Number.isFinite(density) ? density : null;
  });
  let serviceSubtypes = $derived(
    profile.services
      .map((group) => {
        const items = group.items.filter((item) => chartAmount(item.count) !== null && item.count > 0);
        const prioritized = [...items].sort((left, right) => {
          const order = ['hospital', 'pharmacy', 'clinic', 'health_center'];
          const priority = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
          return priority(left.key) - priority(right.key) || right.count - left.count;
        });
        return prioritized.length
          ? `${group.label}: ${prioritized.map((item) => `${item.label} ${amount(item.count)}`).join(' · ')}`
          : '';
      })
      .filter(Boolean)
      .join(' / ')
  );
  let demandRows = $derived([
    {
      key: 'health',
      label: 'Health',
      mix: demandComposition(profile.demand.health.demand)
    },
    { key: 'education', label: 'Education', mix: demandComposition(profile.demand.education.demand) }
  ]);
  let accessRows = $derived([
    { key: 'land', label: 'Land', score: chartScore(profile.transportAccess.land.score) },
    { key: 'marine', label: 'Marine', score: chartScore(profile.transportAccess.marine.score) },
    { key: 'air', label: 'Air', score: chartScore(profile.transportAccess.air.score) }
  ]);
  let footprint = $derived([
    {
      key: 'health',
      label: 'Health',
      count: profile.services.find((group) => group.key === 'health')?.total,
      icon: Hospital
    },
    {
      key: 'education',
      label: 'Education',
      count: profile.services.find((group) => group.key === 'education')?.total,
      icon: School
    },
    {
      key: 'transport',
      label: 'Transport',
      count: profile.services.find((group) => group.key === 'transport')?.total,
      icon: Bus
    },
    { key: 'links', label: 'Direct links', count: profile.connections.direct.length, icon: Route }
  ]);

  function amount(value: number | null | undefined): string {
    const known = chartAmount(value);
    return known === null ? '—' : format.format(known);
  }
  function point(index: number, value: number, radius = 43): { x: number; y: number } {
    const angle = -Math.PI / 2 + (index / 5) * Math.PI * 2;
    return { x: 116 + (Math.cos(angle) * radius * value) / 100, y: 66 + (Math.sin(angle) * radius * value) / 100 };
  }
  function polygon(value: number | null): string {
    return metrics
      .map((metric, index) => {
        const p = point(index, value ?? metric.value ?? 0);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  }
  function ribbon(top: number, height: number, target: number): string {
    return `M 3 ${top} C 54 ${top}, 118 ${target}, 174 ${target} L 174 ${target + height} C 118 ${target + height}, 54 ${top + height}, 3 ${top + height} Z`;
  }
</script>

<div
  class="island-charts"
  data-page={page}
  data-compact={compact}
  aria-label={`${profile.island.name} island dashboard`}
>
  <div class="chart-pagination" aria-label="Island dashboard views">
    <Button
      variant={page === 'people' ? 'default' : 'ghost'}
      size="sm"
      aria-pressed={page === 'people'}
      onclick={() => (page = 'people')}>Access & people</Button
    >
    <Button
      variant={page === 'demand' ? 'default' : 'ghost'}
      size="sm"
      aria-pressed={page === 'demand'}
      onclick={() => (page = 'demand')}>Demand & connections</Button
    >
  </div>
  <section class="chart-card score-card" aria-label="Five-category island score profile">
    <h3>Access profile <span>out of 100</span></h3>
    {#if hasScores}
      <div class="radar-layout">
        <svg
          class="score-radar"
          viewBox="0 0 232 132"
          role="img"
          aria-label={metrics
            .map(
              (metric) =>
                `${metric.label}: ${metric.value === null ? 'unavailable' : `${Math.round(metric.value)} out of 100`}`
            )
            .join('; ')}
        >
          {#each levels as level (level)}<polygon class="radar-grid" points={polygon(level)} />{/each}
          {#each metrics as metric, index (metric.key)}
            {@const edge = point(index, 100)}
            <line class="radar-spoke" x1="116" y1="66" x2={edge.x} y2={edge.y} />
          {/each}
          {#if completeScores}<polygon class="radar-profile" points={polygon(null)} />{/if}
          {#each metrics as metric, index (metric.key)}
            {#if metric.value !== null}{@const p = point(index, metric.value)}<circle
                class="radar-point"
                cx={p.x}
                cy={p.y}
                r="2.5"
              />{/if}
          {/each}
        </svg>
        <dl class="score-labels" aria-hidden="true">
          {#each metrics as metric, index (metric.key)}<div data-index={index}>
              <dt>
                {metric.key === 'sustainability'
                  ? 'Sustain.'
                  : metric.key === 'employment'
                    ? 'Jobs'
                    : metric.key === 'education'
                      ? 'Schools'
                      : metric.label}
              </dt>
              <dd>{metric.value === null ? '—' : Math.round(metric.value)}</dd>
            </div>{/each}
        </dl>
      </div>
    {:else}
      <p class="empty-state">Category scores unavailable.</p>
    {/if}
    <p class="chart-note">Index scores, not residents served.</p>
  </section>

  <section class="chart-card population-card" aria-label="Island resident population and age composition">
    <h3>Island population</h3>
    <p class="resident-count">{amount(profile.population.total)} <span>residents</span></p>
    {#if populationDensity !== null}
      <p class="population-density">{amount(populationDensity)} <span>residents / km² of land</span></p>
    {/if}
    {#if ageParts}
      <div class="age-strip" aria-hidden="true">
        {#each ageParts as part, index (part.key)}<span class={`part-${index}`} style:flex-basis={`${part.share}%`}
          ></span>{/each}
      </div>
      <dl class="age-legend">
        {#each ageParts as part, index (part.key)}
          <div>
            <dt>
              <i class={`part-${index}`} aria-hidden="true"></i>{part.key === 'working_age_population_15_64'
                ? 'Age 15–64'
                : part.key === 'child_population_0_14'
                  ? 'Age 0–14'
                  : part.key === 'elderly_population_65_plus'
                    ? 'Age 65+'
                    : 'Unclassified'}
            </dt>
            <dd>{amount(part.amount)} <span>{Math.round(part.share)}%</span></dd>
          </div>
        {/each}
      </dl>
    {:else}
      <p class="empty-state">Age composition unavailable.</p>
    {/if}
  </section>

  <section class="chart-card demand-card" aria-label="Health and education demand on this island">
    <h3>Demand on the island</h3>
    <div class="ribbon-key">
      <span><i class="local" aria-hidden="true"></i>Local</span><span
        ><i class="inbound" aria-hidden="true"></i>Inbound</span
      >
    </div>
    <div class="demand-rows">
      {#each demandRows as row (row.key)}
        <div class="demand-row">
          <div class="demand-label">
            <strong>{row.label}</strong><span>{amount(row.mix.local)} <b>+</b> {amount(row.mix.inbound)}</span>
          </div>
          {#if row.mix.combined !== null && row.mix.combined > 0}
            {@const localHeight = ((row.mix.localShare ?? 0) / 100) * 16}
            {@const inboundHeight = ((row.mix.inboundShare ?? 0) / 100) * 16}
            <svg
              class="demand-ribbon"
              viewBox="0 0 178 25"
              role="img"
              aria-label={`${row.label}: ${amount(row.mix.local)} local and ${amount(row.mix.inbound)} inbound allocations. ${amount(row.mix.unserved)} unserved.`}
            >
              {#if localHeight > 0}<path class="local" d={ribbon(1, localHeight, 5)} />{/if}
              {#if inboundHeight > 0}<path
                  class="inbound"
                  d={ribbon(8 + localHeight, inboundHeight, 5 + localHeight)}
                />{/if}
            </svg>
          {:else}<p class="zero-demand">
              {row.mix.combined === 0 ? 'No on-island allocations' : 'Demand unavailable'}
            </p>{/if}
          {#if row.mix.unserved !== null && row.mix.unserved > 0}<span class="unserved"
              >{amount(row.mix.unserved)} unserved</span
            >{/if}
        </div>
      {/each}
    </div>
    <p class="chart-note">Modeled allocations, not daily trips.</p>
  </section>

  <section class="chart-card transport-card" aria-label="Transport access by mode">
    <h3>Transport reach <span>out of 100</span></h3>
    <dl class="access-rows">
      {#each accessRows as row (row.key)}
        <div class={`access-row mode-${row.key}`}>
          <dt>{row.label}</dt>
          <dd>
            <div class="access-dots" aria-hidden="true">
              {#each accessDots as dot (dot)}<i class:filled={row.score !== null && row.score >= (dot + 0.5) * 10}
                ></i>{/each}
            </div>
            <strong>{row.score === null ? '—' : `${Math.round(row.score)}%`}</strong>
          </dd>
        </div>
      {/each}
    </dl>
    <p class="airport-note">
      {profile.transportAccess.airport.available
        ? `Airport access${profile.transportAccess.airport.islandName ? ` via ${profile.transportAccess.airport.islandName}` : ' recorded'}.`
        : 'No airport access recorded.'}
    </p>
    <p class="chart-note">Index scores; dots rounded to 10 points. — unavailable.</p>
    <dl class="compact-services" aria-label="Recorded services and direct links">
      {#each footprint as item (item.key)}<div>
          <dt>{item.label}</dt>
          <dd>{amount(item.count)}</dd>
        </div>{/each}
    </dl>
    {#if serviceSubtypes}
      <p class="service-subtypes compact-subtypes" title={`Recorded service types — ${serviceSubtypes}`}>
        {serviceSubtypes}
      </p>
    {/if}
  </section>

  <section class="service-footprint" aria-label="Recorded services and direct connections">
    {#each footprint as item (item.key)}
      <div>
        <item.icon size={14} strokeWidth={1.7} aria-hidden="true" /><strong>{amount(item.count)}</strong><span
          >{item.label}</span
        >
      </div>
    {/each}
    {#if serviceSubtypes}
      <p class="service-subtypes" title={`Recorded service types — ${serviceSubtypes}`}>{serviceSubtypes}</p>
    {/if}
    <p>Recorded facilities and connections; counts do not indicate capacity.</p>
  </section>
</div>

<style>
  .island-charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }
  .chart-pagination {
    display: none;
    grid-column: 1 / -1;
    gap: 4px;
    padding: 3px;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  .chart-pagination :global(button) {
    flex: 1;
    font-size: var(--mobility-text-xs);
  }
  .chart-pagination :global(button[aria-pressed='true']) {
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
  }
  .chart-pagination :global(button[aria-pressed='false']) {
    color: var(--mobility-ink);
  }
  .compact-services {
    display: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px 8px;
    margin: 8px 0 0;
    padding-top: 7px;
    border-top: 1px solid var(--mobility-border);
  }
  .compact-services > div {
    display: flex;
    justify-content: space-between;
    gap: 3px;
    font-size: var(--mobility-text-xs);
  }
  .compact-services dt {
    color: var(--mobility-muted);
  }
  .compact-services dd {
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .chart-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 11px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
  }
  h3 {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 6px;
    margin: 0;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.35;
    letter-spacing: -0.015em;
  }
  h3 span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  .chart-note,
  .empty-state {
    margin: 5px 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.35;
  }
  .empty-state {
    padding: 16px 0;
  }
  .score-radar {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .radar-layout {
    position: relative;
    flex: 1 1 80px;
    min-height: 54px;
    max-height: 112px;
    margin-block: 3px;
  }
  .score-labels {
    position: absolute;
    inset: 0;
    margin: 0;
  }
  .score-labels > div {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: 3px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.2;
  }
  .score-labels dd {
    color: var(--mobility-ink);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .score-labels [data-index='0'] {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
  }
  .score-labels [data-index='1'] {
    top: 27%;
    right: 0;
  }
  .score-labels [data-index='2'] {
    bottom: 7%;
    right: 0;
  }
  .score-labels [data-index='3'] {
    bottom: 7%;
    left: 0;
  }
  .score-labels [data-index='4'] {
    top: 27%;
    left: 0;
  }
  .radar-grid {
    fill: none;
    stroke: var(--mobility-border);
    stroke-width: 0.8;
  }
  .radar-spoke {
    stroke: var(--mobility-border);
    stroke-width: 0.7;
  }
  .radar-profile {
    fill: var(--mobility-accent);
    fill-opacity: 0.15;
    stroke: var(--mobility-accent);
    stroke-width: 1.5;
  }
  .radar-point {
    fill: var(--mobility-accent);
    stroke: var(--mobility-surface);
    stroke-width: 1;
  }
  .resident-count {
    margin: 6px 0 8px;
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.045em;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }
  .resident-count span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
    letter-spacing: 0;
  }
  .population-density {
    margin: -4px 0 6px;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }
  .population-density span {
    color: var(--mobility-muted);
    font-weight: var(--mobility-font-weight-normal);
  }
  .age-strip {
    display: flex;
    gap: 2px;
    height: 14px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--mobility-surface-muted);
  }
  .age-strip span {
    min-width: 0;
  }
  .part-0 {
    background: var(--mobility-chart-children);
  }
  .part-1 {
    background: var(--mobility-chart-working-age);
  }
  .part-2 {
    background: var(--mobility-chart-older);
  }
  .part-3 {
    background: var(--mobility-border-strong);
  }
  .age-legend {
    display: grid;
    gap: 4px;
    margin: 8px 0 0;
  }
  .age-legend > div {
    display: flex;
    justify-content: space-between;
    gap: 5px;
  }
  .age-legend dt {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    white-space: nowrap;
  }
  .age-legend i,
  .ribbon-key i {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 1px;
    flex: none;
  }
  dd {
    margin: 0;
  }
  .age-legend dd {
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .age-legend dd span {
    display: inline-block;
    min-width: 25px;
    margin-left: 3px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
    text-align: right;
  }
  .ribbon-key {
    display: flex;
    gap: 9px;
    margin-top: 5px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .ribbon-key > span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .local {
    fill: var(--mobility-accent);
    background: var(--mobility-accent);
  }
  .inbound {
    fill: var(--mobility-chart-inbound);
    background: var(--mobility-chart-inbound);
  }
  .demand-rows {
    display: grid;
    gap: 6px;
    margin-top: 6px;
  }
  .demand-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
    font-size: var(--mobility-text-xs);
    line-height: 1.3;
  }
  .demand-label strong {
    font-weight: var(--mobility-font-weight-medium);
  }
  .demand-label span {
    font-variant-numeric: tabular-nums;
    font-weight: var(--mobility-font-weight-semibold);
  }
  .demand-label b {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  .demand-ribbon {
    display: block;
    width: 100%;
    height: 20px;
    margin-top: 2px;
  }
  .demand-ribbon .local {
    fill-opacity: 0.8;
  }
  .demand-ribbon .inbound {
    fill-opacity: 0.65;
  }
  .unserved {
    display: block;
    margin-top: 1px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    text-align: right;
  }
  .zero-demand {
    margin: 3px 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .access-rows {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
  }
  .access-row {
    --mode-color: var(--mobility-route-bus);
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .access-row.mode-marine {
    --mode-color: var(--mobility-route-ferry);
  }
  .access-row.mode-air {
    --mode-color: var(--mobility-route-air);
  }
  .access-row dt {
    flex: none;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .access-row dd {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .access-dots {
    display: flex;
    gap: 3px;
  }
  .access-dots i {
    width: 5px;
    height: 8px;
    border-radius: 2px;
    background: var(--mobility-border);
  }
  .access-dots i.filled {
    background: var(--mode-color);
  }
  .access-row strong {
    min-width: 29px;
    text-align: right;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .airport-note {
    margin: 9px 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.35;
  }
  .service-footprint {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    padding: 8px 9px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  .service-footprint > div {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: center;
    align-items: center;
    gap: 1px 5px;
  }
  .service-footprint :global(svg) {
    color: var(--mobility-accent);
  }
  .service-footprint strong {
    font-size: var(--mobility-text-lg);
    line-height: 1.2;
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .service-footprint span {
    grid-column: 1 / -1;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    text-align: center;
  }
  .service-footprint p {
    grid-column: 1 / -1;
    margin: 4px 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.3;
    text-align: center;
  }
  .service-subtypes,
  .service-footprint .service-subtypes {
    min-width: 0;
    margin: 5px 0 0;
    overflow: hidden;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.3;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compact-subtypes {
    display: none;
  }
  .island-charts[data-compact='true'] .chart-pagination {
    display: flex;
  }
  .island-charts[data-compact='true'] {
    grid-template-rows: 34px minmax(0, 1fr);
    gap: 6px;
  }
  .island-charts[data-compact='true'][data-page='people'] .demand-card,
  .island-charts[data-compact='true'][data-page='people'] .transport-card,
  .island-charts[data-compact='true'][data-page='demand'] .score-card,
  .island-charts[data-compact='true'][data-page='demand'] .population-card,
  .island-charts[data-compact='true'] .service-footprint {
    display: none;
  }
  .island-charts[data-compact='true'] .compact-services {
    display: grid;
  }
  .island-charts[data-compact='true'] .compact-subtypes {
    display: block;
  }
  @container presentation-details (max-height: 460px) {
    .chart-card {
      padding: 8px 9px;
    }
    .radar-layout {
      max-height: 84px;
    }
    .resident-count {
      margin: 4px 0 6px;
      font-size: var(--mobility-text-xl);
    }
    .age-strip {
      height: 10px;
    }
    .age-legend {
      margin-top: 6px;
      gap: 3px;
    }
    .demand-rows {
      gap: 3px;
      margin-top: 4px;
    }
    .demand-ribbon {
      height: 14px;
    }
    .access-rows {
      gap: 7px;
      margin-top: 9px;
    }
    .airport-note {
      margin-top: 6px;
    }
    .service-footprint {
      padding: 6px 8px;
    }
    .service-footprint p {
      margin-top: 2px;
    }
    .chart-note {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container presentation-details (max-height: 380px) {
    .island-charts {
      gap: 6px;
      grid-template-rows: 34px minmax(0, 1fr);
    }
    .chart-pagination {
      display: flex;
    }
    .island-charts[data-page='people'] .demand-card,
    .island-charts[data-page='people'] .transport-card,
    .island-charts[data-page='demand'] .score-card,
    .island-charts[data-page='demand'] .population-card,
    .service-footprint {
      display: none;
    }
    .compact-services {
      display: grid;
    }
    .compact-subtypes {
      display: block;
    }
    .chart-card {
      padding: 8px 9px;
    }
    .resident-count {
      margin: 4px 0 6px;
      font-size: var(--mobility-text-xl);
    }
    .age-strip {
      height: 10px;
    }
    .age-legend {
      margin-top: 6px;
      gap: 3px;
    }
    .demand-rows {
      gap: 3px;
      margin-top: 4px;
    }
    .demand-ribbon {
      height: 14px;
    }
    .access-rows {
      gap: 7px;
      margin-top: 9px;
    }
    .airport-note {
      margin-top: 6px;
      font-size: var(--mobility-text-xs);
    }
    .chart-note {
      font-size: var(--mobility-text-xs);
    }
    .service-footprint {
      padding: 6px 8px;
    }
    .service-footprint p {
      margin-top: 2px;
    }
  }
  @container presentation-details (max-height: 240px) {
    .chart-note,
    .airport-note,
    .compact-subtypes {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .chart-card {
      padding: 7px 8px;
    }
    .chart-pagination {
      padding: 2px;
    }
    .chart-pagination :global(button) {
      font-size: var(--mobility-text-xs);
    }
    .island-charts {
      grid-template-rows: 31px minmax(0, 1fr);
    }
    .access-rows {
      gap: 6px;
      margin-top: 7px;
    }
    .compact-services {
      gap: 4px 8px;
      margin-top: 7px;
      padding-top: 6px;
    }
    .demand-rows {
      gap: 4px;
    }
    .demand-ribbon {
      height: 11px;
    }
    .resident-count {
      margin: 3px 0 5px;
      font-size: var(--mobility-text-xl);
    }
    .age-legend {
      gap: 3px;
      margin-top: 6px;
    }
  }
  @container presentation-details (min-width: 600px) and (min-height: 340px) {
    .island-charts[data-compact='false'] {
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 6px;
    }
    .island-charts[data-compact='false'] .chart-pagination,
    .island-charts[data-compact='false'] .compact-services,
    .island-charts[data-compact='false'] .compact-subtypes {
      display: none;
    }
    .island-charts[data-compact='false'] .chart-card,
    .island-charts[data-compact='false'][data-page='people'] .demand-card,
    .island-charts[data-compact='false'][data-page='people'] .transport-card,
    .island-charts[data-compact='false'][data-page='demand'] .score-card,
    .island-charts[data-compact='false'][data-page='demand'] .population-card {
      display: flex;
    }
    .island-charts[data-compact='false'] .service-footprint {
      display: grid;
    }
    .island-charts[data-compact='false'] .age-legend {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 10px;
    }
    .island-charts[data-compact='false'] .age-legend dd span {
      min-width: 0;
      margin-left: 2px;
    }
  }
  @container presentation-details (min-width: 600px) and (min-height: 340px) and (max-height: 380px) {
    .island-charts[data-compact='false'] .service-footprint > p:not(.service-subtypes) {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container (max-width: 410px) {
    .chart-card {
      padding-inline: 8px;
    }
    .access-dots {
      gap: 2px;
    }
    .access-dots i {
      width: 4px;
    }
    .access-row {
      gap: 3px;
    }
    .access-row dd {
      gap: 4px;
    }
    .age-legend dt,
    .age-legend dd {
      font-size: var(--mobility-text-xs);
    }
  }
</style>
