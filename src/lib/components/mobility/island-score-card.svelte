<script lang="ts">
  import type { AnalyticsIsland } from './national-analytics-card.svelte';

  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  import { Skeleton } from '$components/ui/skeleton';

  import { chartScore, islandScoreMetrics } from './island-chart-data';
  import IslandScoreComparison from './island-score-comparison.svelte';
  import ScoreDisplay from './score-display.svelte';

  let {
    island,
    loading = false,
    error = false,
    embedded = false
  }: {
    island: AnalyticsIsland | null;
    loading?: boolean;
    error?: boolean;
    embedded?: boolean;
  } = $props();

  let overall = $derived(chartScore(island?.overall.score));
  let metrics = $derived(islandScoreMetrics(island));
</script>

<section
  class="island-panel"
  class:embedded
  aria-label="Island mobility score"
  aria-busy={loading}
  data-story-target="island-score"
>
  <div class="panel-heading">
    {#if loading}
      <Skeleton class="island-title-skeleton" />
      <Skeleton class="island-caption-skeleton" />
    {:else}
      <p class="eyebrow">{island?.atollName ? `${island.atollName} · Island mobility` : 'Island mobility'}</p>
      <h2>{island?.name ?? 'Island score'}</h2>
    {/if}
  </div>

  <div class="score-summary" aria-live="polite">
    {#if loading}
      <Skeleton class="island-score-skeleton" />
      <Skeleton class="island-copy-skeleton" />
    {:else}
      <ScoreDisplay value={overall} label={`${island?.name ?? 'Island'} overall mobility score`} prominent />
      <p class="score-note">
        {overall === null ? 'Insufficient evidence for an island score.' : 'Modeled mobility index · higher is better'}
      </p>
    {/if}
  </div>

  <details class="score-breakdown">
    <summary><span>Score breakdown</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div class="breakdown-content" aria-label="Island score breakdown">
      {#if loading}
        {#each metrics as metric (metric.key)}
          <div class="loading-row">
            <Skeleton class="island-metric-label-skeleton" /><Skeleton class="island-metric-bar-skeleton" />
          </div>
        {/each}
      {:else}
        <IslandScoreComparison {metrics} compact />
      {/if}
    </div>
  </details>
  {#if error}<p class="panel-error">Island details are unavailable.</p>{/if}
</section>

<style>
  .island-panel {
    width: min(19rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
    color: var(--mobility-ink);
    color-scheme: light;
    animation: panel-enter var(--mobility-duration-enter) var(--mobility-ease) both;
  }
  .panel-heading {
    min-width: 0;
  }
  .eyebrow {
    margin: 0 0 0.25rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  h2 {
    overflow: hidden;
    margin: 0;
    font-size: var(--mobility-text-xl);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.025em;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .score-summary {
    display: grid;
    justify-items: start;
    gap: 0.35rem;
    min-width: 0;
    margin: 0.65rem 0 0.7rem;
  }
  .score-breakdown {
    border-top: 1px solid var(--mobility-border);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0.55rem 0;
    border-radius: var(--mobility-radius-small);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    list-style: none;
    cursor: pointer;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    color: var(--mobility-accent);
  }
  summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 3px;
  }
  summary :global(svg) {
    flex: 0 0 auto;
    transition: transform var(--mobility-duration-fast) var(--mobility-ease);
  }
  details[open] summary :global(svg) {
    transform: rotate(180deg);
  }
  .breakdown-content {
    padding: 0.3rem 0 0.65rem;
  }
  .score-note {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.45;
  }
  .island-panel.embedded {
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    animation: none;
  }
  .panel-error {
    margin: 0.55rem 0 0;
    color: var(--destructive, var(--mobility-danger-ink));
    font-size: var(--mobility-text-xs);
  }
  .loading-row {
    display: grid;
    grid-template-columns: 5.1rem 1fr;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }
  :global(.island-title-skeleton) {
    width: 8.5rem;
    height: 1rem;
  }
  :global(.island-caption-skeleton) {
    width: 5rem;
    height: 0.5rem;
    margin-top: 0.25rem;
  }
  :global(.island-score-skeleton) {
    width: 11rem;
    height: 5rem;
    flex: 0 0 auto;
    border-radius: var(--mobility-radius-small);
  }
  :global(.island-copy-skeleton) {
    width: 12rem;
    height: 0.55rem;
  }
  :global(.island-metric-label-skeleton) {
    width: 4rem;
    height: 0.65rem;
  }
  :global(.island-metric-bar-skeleton) {
    width: 100%;
    height: 0.35rem;
  }
  @keyframes panel-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .island-panel {
      animation: none;
    }
    summary :global(svg) {
      transition: none;
    }
  }
</style>
