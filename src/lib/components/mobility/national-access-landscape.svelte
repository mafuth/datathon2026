<script lang="ts">
  import type { AnalyticsIsland } from './national-analytics-card.svelte';

  import { Button } from '$components/ui/button';

  import { accessLandscapePoints, transportScoreTone } from './national-chart-data';

  let {
    islands,
    onIslandSelect
  }: { islands: readonly AnalyticsIsland[]; onIslandSelect: (island: AnalyticsIsland) => void } = $props();
  let selectedId = $state<string | null>(null);
  const points = $derived(accessLandscapePoints(islands));
  const activeId = $derived(points.some((point) => point.island.id === selectedId) ? selectedId : null);
  const inspected = $derived(points.find((point) => point.island.id === selectedId) ?? null);
  const omitted = $derived(islands.filter((island) => (island.population ?? 0) > 0).length - points.length);
  const ticks = [0, 25, 50, 75, 100];
  const format = (value: number | null) => (value === null ? 'Unavailable' : `${Math.round(value)}/100`);

  function navigatePoint(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onIslandSelect(points[index].island);
      return;
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? points.length - 1
          : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + points.length) %
            points.length;
    selectedId = points[next].island.id;
    (event.currentTarget as SVGCircleElement).parentElement
      ?.querySelectorAll<SVGCircleElement>('[data-island-point]')
      [next]?.focus();
  }
</script>

<section class="access-landscape" aria-label="Health and education access across populated islands">
  <div class="landscape-heading">
    <h3>Access across islands</h3>
    <span>{points.length} islands</span>
  </div>
  <p class="chart-context">Health × education · colour shows transport access</p>
  {#if points.length}
    <svg
      viewBox="0 0 400 282"
      aria-label="Health access on the horizontal axis and education access on the vertical axis, both from zero to 100"
    >
      <g aria-hidden="true">
        {#each ticks as value (value)}
          <line x1="46" x2="364" y1={242 - value * 2} y2={242 - value * 2} class="gridline" />
          <line x1={46 + value * 3.18} x2={46 + value * 3.18} y1="42" y2="242" class="gridline" />
          <text x="36" y={246 - value * 2} text-anchor="end" class="tick">{value}</text>
          <text x={46 + value * 3.18} y="258" text-anchor="middle" class="tick">{value}</text>
        {/each}
        <path d="M46 42V242H364" class="axis" />
        <text x="46" y="24" class="axis-label">Education access</text>
        <text x="364" y="279" text-anchor="end" class="axis-label">Health access →</text>
      </g>
      <g>
        {#each points as point, index (point.island.id)}
          <circle
            data-island-point
            role="button"
            tabindex={activeId === point.island.id || (!activeId && index === 0) ? 0 : -1}
            aria-label={`${point.island.atollName} ${point.island.name}: health ${format(point.health)}, education ${format(point.education)}, transport ${format(point.transport)}. Open island.`}
            cx={point.x}
            cy={point.y}
            r={inspected?.island.id === point.island.id ? 5.5 : 3.8}
            fill={transportScoreTone(point.transport)}
            class:inspected={inspected?.island.id === point.island.id}
            onpointerenter={() => (selectedId = point.island.id)}
            onfocus={() => (selectedId = point.island.id)}
            onclick={() => onIslandSelect(point.island)}
            onkeydown={(event) => navigatePoint(event, index)}
          />
        {/each}
      </g>
    </svg>
    <div class="transport-key">
      <span>Transport</span><i></i><span>0</span><i></i><span>100</span><span class="missing-key">● unavailable</span>
    </div>
    <label class="island-picker"
      ><span>Inspect an island</span><select
        value={selectedId ?? ''}
        onchange={(event) => (selectedId = event.currentTarget.value || null)}
      >
        <option value="">Choose an island…</option>
        {#each points as point (point.island.id)}<option value={point.island.id}
            >{point.island.atollName} · {point.island.name}</option
          >{/each}
      </select></label
    >
    <div class="inspection" aria-live="polite">
      {#if inspected}
        <div class="inspection-heading">
          <strong>{inspected.island.atollName} · {inspected.island.name}</strong><Button
            class="landscape-open-island"
            variant="ghost"
            size="sm"
            onclick={() => onIslandSelect(inspected.island)}>Open map ↗</Button
          >
        </div>
        <dl>
          <div>
            <dt>Health</dt>
            <dd>{format(inspected.health)}</dd>
          </div>
          <div>
            <dt>Education</dt>
            <dd>{format(inspected.education)}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>{format(inspected.transport)}</dd>
          </div>
        </dl>
      {:else}<p>
          Hover a dot or choose an island to inspect its scores. Arrow keys move between dots; Enter opens the island.
        </p>{/if}
    </div>
    <p class="chart-note">
      One dot per island with a recorded population and both access scores. Index scores, not the share of residents
      served.{omitted > 0 ? ` ${omitted} populated islands lack a paired score.` : ''}
    </p>
  {:else}<p class="chart-note">No populated islands have both access scores available.</p>{/if}
</section>

<style>
  .access-landscape {
    color: var(--mobility-ink);
  }
  .landscape-heading,
  .inspection-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }
  h3 {
    margin: 0;
    font-size: var(--mobility-text-md);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.02em;
  }
  .landscape-heading > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    white-space: nowrap;
  }
  .chart-context {
    margin: 0.3rem 0 0.4rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.5;
  }
  svg {
    display: block;
    width: 100%;
    overflow: visible;
  }
  .gridline {
    stroke: var(--mobility-border);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }
  .axis {
    fill: none;
    stroke: var(--mobility-chart-reference);
    stroke-width: 1;
  }
  .tick {
    fill: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .axis-label {
    fill: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  circle {
    stroke: var(--mobility-surface);
    stroke-width: 0.8;
    cursor: pointer;
  }
  circle.inspected,
  circle:focus-visible {
    stroke: var(--mobility-ink);
    stroke-width: 2;
    outline: none;
  }
  .transport-key {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: 0.5rem 0 0.8rem;
    font-size: var(--mobility-text-xs);
    color: var(--mobility-muted);
  }
  .transport-key i {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--mobility-transport-tone-low);
    border: 1px solid var(--mobility-border-strong);
  }
  .transport-key i:nth-of-type(2) {
    background: var(--mobility-transport-tone-high);
    border-color: transparent;
  }
  .missing-key {
    margin-left: auto;
  }
  .island-picker {
    display: grid;
    gap: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  select {
    width: 100%;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font: inherit;
    font-size: var(--mobility-text-sm);
  }
  select:focus-visible,
  :global(.landscape-open-island:focus-visible) {
    outline: 2px solid var(--mobility-focus);
    outline-offset: 3px;
  }
  .inspection {
    min-height: 5.3rem;
    margin-top: 0.6rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-soft);
  }
  .inspection p {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.6;
  }
  .inspection-heading strong {
    font-size: var(--mobility-text-sm);
  }
  :global(.landscape-open-island) {
    flex-shrink: 0;
    border: 0;
    padding: 0.2rem 0;
    background: transparent;
    color: var(--mobility-accent);
    height: auto;
    transition:
      color var(--mobility-duration-fast) var(--mobility-ease),
      transform var(--mobility-duration-fast) var(--mobility-ease);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
    cursor: pointer;
  }
  :global(.landscape-open-island:hover) {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  :global(.landscape-open-island:active) {
    transform: scale(0.98);
  }
  dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin: 0.55rem 0 0;
  }
  dt {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  dd {
    margin: 0.2rem 0 0;
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-bold);
    font-variant-numeric: tabular-nums;
  }
  .chart-note {
    margin: 0.55rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.6;
  }
</style>
