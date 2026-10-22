<script lang="ts">
  import type { ScoreCardMetric } from './score-presentation';

  import { onMount } from 'svelte';

  import { Button } from '$components/ui/button';
  import { Input } from '$components/ui/input';
  import { Skeleton } from '$components/ui/skeleton';

  import { chartScore } from './island-chart-data';
  import ScoreDisplay from './score-display.svelte';
  import { isUnavailableScore, SCORE_NO_DATA_MESSAGES, scorePercentage, scorePresentation } from './score-presentation';

  export type IslandSearchOption = {
    id: string;
    name: string;
    atollName: string;
    centroid?: [number, number];
    score: number | null;
  };

  type Props = {
    title: string;
    caption: string;
    overall: number | null | undefined;
    metrics: readonly ScoreCardMetric[];
    islands?: readonly IslandSearchOption[];
    onIslandSelect?: (island: IslandSearchOption) => void;
    onAnalyticsOpen?: () => void;
    loading?: boolean;
    error?: boolean;
  };

  let {
    title,
    caption,
    overall,
    metrics,
    islands = [],
    onIslandSelect,
    onAnalyticsOpen = () => {},
    loading = false,
    error = false
  }: Props = $props();

  let presentation = $derived(scorePresentation(overall, `${title} score unavailable`));
  let noDataMessage = $state(SCORE_NO_DATA_MESSAGES[0]);
  let islandSearch = $state('');
  let islandSearchOpen = $state(false);
  let filteredIslands = $derived(
    islands
      .filter((island) =>
        `${island.atollName} ${island.name}`.toLowerCase().includes(islandSearch.trim().toLowerCase())
      )
      .slice(0, 8)
  );

  function selectIsland(island: IslandSearchOption) {
    islandSearch = `${island.atollName} ${island.name}`;
    islandSearchOpen = false;
    onIslandSelect?.(island);
  }

  function selectFirstIsland(): void {
    const island = filteredIslands[0];
    if (island) selectIsland(island);
  }

  onMount(() => {
    noDataMessage =
      SCORE_NO_DATA_MESSAGES[Math.floor(Math.random() * SCORE_NO_DATA_MESSAGES.length)] ?? SCORE_NO_DATA_MESSAGES[0];
  });
</script>

<section
  class="national-panel"
  aria-label="National mobility score"
  aria-busy={loading}
  data-score-card="national"
  data-story-target="national-score"
>
  <div class="score-card-upper">
    <div class="national-panel-header">
      <div class="score-card-heading">
        <div class="score-card-title-row">
          {#if loading}
            <Skeleton class="score-title-skeleton" />
          {:else}
            <h2>{title}</h2>
          {/if}
        </div>
        {#if loading}
          <Skeleton class="score-caption-skeleton" />
        {:else}
          <p class="panel-caption">{caption}</p>
        {/if}
      </div>
    </div>

    <div class="score-mood" aria-live="polite">
      {#if loading}
        <div class="score-loading" role="status" aria-label="Loading mobility score">
          <div class="score-value">
            <Skeleton class="score-value-skeleton" />
            <Skeleton class="score-label-skeleton" />
          </div>
          <Skeleton class="score-emoji-skeleton" />
        </div>
      {:else if isUnavailableScore(overall)}
        <div class="score-no-data">
          <img
            src={noDataMessage.emojiSrc}
            alt={noDataMessage.emojiAlt}
            width="82"
            height="82"
            loading="eager"
            decoding="async"
          />
          <strong>{noDataMessage.title}</strong>
          <span>{noDataMessage.description}</span>
        </div>
      {:else}
        <ScoreDisplay value={overall} label="National mobility score" />
        <div class="score-explanation">
          <strong>Access at a glance</strong>
          <p>A modeled index across service access and transport conditions.</p>
          <small>Not the share of residents served.</small>
        </div>
      {/if}
    </div>
  </div>

  {#if loading}
    <Skeleton class="why-score-button-skeleton" aria-hidden="true" />
  {:else}
    <Button
      class="why-score-button"
      type="button"
      aria-label={`Why ${presentation.percent}?`}
      aria-controls="national-analytics-dialog"
      aria-haspopup="dialog"
      onclick={onAnalyticsOpen}
    >
      Why {presentation.percent}?
    </Button>
  {/if}

  <div class="overall-score-grid" aria-label="Score breakdown">
    {#each metrics as metric (metric.key)}
      <div class="overall-score-card">
        {#if loading}
          <Skeleton class="metric-label-skeleton" />
          <Skeleton class="metric-value-skeleton" />
        {:else}
          <span>{metric.label}</span>
          <strong>{scorePercentage(metric.value)}</strong>
          {@const score = chartScore(metric.value)}
          <div class="metric-track" aria-hidden="true" data-unavailable={score === null}>
            {#if score !== null}<i style:width={`${score}%`}></i>{/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="island-search">
    {#if loading}
      <Skeleton class="island-search-skeleton" aria-hidden="true" />
    {:else}
      <Input
        class="island-search-input"
        bind:value={islandSearch}
        placeholder="Search island..."
        aria-label="Search for an island"
        autocomplete="off"
        onfocus={() => (islandSearchOpen = true)}
        oninput={() => (islandSearchOpen = true)}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            selectFirstIsland();
          }
        }}
        onblur={() => setTimeout(() => (islandSearchOpen = false), 120)}
      />
      {#if islandSearchOpen && islandSearch.trim()}
        <div class="island-search-suggestions" role="listbox" aria-label="Island suggestions">
          {#if filteredIslands.length === 0}
            <p class="island-search-empty">No islands found</p>
          {:else}
            {#each filteredIslands as island (island.id)}
              <Button
                class="island-search-suggestion"
                variant="ghost"
                type="button"
                role="option"
                aria-selected="false"
                onpointerdown={(event) => {
                  event.preventDefault();
                  selectIsland(island);
                }}
              >
                <span>{island.atollName} {island.name}</span>
                <strong>{scorePercentage(island.score)}</strong>
              </Button>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  {#if error}<p class="panel-error">Details unavailable. The map score may still be shown.</p>{/if}
</section>

<style>
  .national-panel {
    position: relative;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.9rem 1rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
    color: var(--mobility-ink);
    color-scheme: light;
    animation: panel-enter var(--mobility-duration-enter) var(--mobility-ease) both;
  }
  .national-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .national-panel-header > div {
    min-width: 0;
    max-width: 100%;
  }
  .score-card-upper {
    display: contents;
  }
  .score-card-title-row {
    width: 100%;
  }
  .national-panel h2 {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    margin: 0;
    font-size: var(--mobility-text-xl);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.02em;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel-caption {
    margin: 0.16rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.03em;
    line-height: 1.35;
  }
  :global(.score-title-skeleton) {
    width: 8.8rem;
    height: 1.1rem;
    border-radius: var(--mobility-radius-small);
  }
  :global(.score-caption-skeleton) {
    width: 6.2rem;
    height: 0.5rem;
    margin-top: 0.18rem;
    border-radius: 999px;
  }
  .island-search {
    position: relative;
    width: 100%;
    margin-top: 0.8rem;
  }
  :global(.island-search-skeleton) {
    width: 100%;
    height: 2rem;
    border-radius: var(--mobility-radius-small);
  }
  :global(.island-search-input) {
    width: 100%;
    height: 2rem;
    border-radius: var(--mobility-radius-control);
    border-color: var(--mobility-border);
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
  }
  :global(.island-search-input::placeholder) {
    color: var(--mobility-muted);
  }
  :global(.island-search-input:focus-visible) {
    border-color: var(--mobility-accent-hover);
    background: var(--mobility-surface);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobility-accent) 16%, transparent);
  }
  .island-search-suggestions {
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    left: 0;
    z-index: 10;
    display: grid;
    max-height: 14rem;
    overflow-y: auto;
    padding: 0.3rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
  }
  :global(.island-search-suggestion) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.48rem 0.5rem;
    border: 0;
    border-radius: var(--mobility-radius-small);
    background: transparent;
    color: var(--mobility-ink);
    cursor: pointer;
    font-size: var(--mobility-text-xs);
    text-align: left;
  }
  :global(.island-search-suggestion:hover),
  :global(.island-search-suggestion:focus-visible) {
    background: var(--mobility-accent-soft);
    outline: none;
  }
  :global(.island-search-suggestion span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.island-search-suggestion strong) {
    flex: 0 0 auto;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  .island-search-empty {
    margin: 0;
    padding: 0.5rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  :global(.why-score-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 2.35rem;
    margin-top: 0.7rem;
    padding: 0 0.8rem;
    border: 1px solid var(--mobility-accent);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.01em;
  }
  :global(.why-score-button:hover),
  :global(.why-score-button:focus-visible) {
    border-color: var(--mobility-accent-hover);
    background: var(--mobility-accent-hover);
    color: var(--mobility-on-accent);
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobility-accent) 16%, transparent);
  }
  :global(.why-score-button-skeleton) {
    display: block;
    width: 100%;
    height: 2.35rem;
    margin-top: 0.7rem;
    border-radius: var(--mobility-radius-small);
  }
  .score-mood {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.85rem;
    width: 100%;
    margin: 0.65rem auto 0.85rem;
  }
  .score-loading {
    display: contents;
  }
  .score-value {
    min-width: 0;
    text-align: left;
  }
  .score-explanation strong {
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.015em;
  }
  .score-explanation p {
    margin: 0.3rem 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.5;
  }
  .score-explanation small {
    display: block;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .score-no-data {
    display: grid;
    grid-column: 1 / -1;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.3rem 0.1rem;
    text-align: center;
  }
  .score-no-data img {
    width: 5.1rem;
    height: 5.1rem;
    object-fit: contain;
  }
  .score-no-data strong {
    max-width: 15rem;
    font-size: var(--mobility-text-sm);
    line-height: 1.25;
  }
  .score-no-data span {
    max-width: 15rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.35;
  }
  .overall-score-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--mobility-border);
  }
  .overall-score-card {
    display: grid;
    gap: 0.14rem;
    min-width: 0;
    min-height: 2.65rem;
    padding: 0.48rem 0.55rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  .overall-score-card span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
    line-height: 1.1;
  }
  .overall-score-card strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-bold);
    font-variant-numeric: tabular-nums;
  }
  .metric-track {
    height: 3px;
    margin-top: 0.25rem;
    overflow: hidden;
    border-radius: 9px;
    background: var(--mobility-border);
  }
  .metric-track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--mobility-accent);
  }
  .metric-track[data-unavailable='true'] {
    background: repeating-linear-gradient(90deg, var(--mobility-border) 0 4px, transparent 4px 7px);
  }
  .panel-error {
    margin: 0.55rem 0 0;
    color: var(--mobility-danger-ink);
    font-size: var(--mobility-text-sm);
  }
  :global(.national-panel [data-slot='skeleton']) {
    background-color: var(--mobility-surface-muted);
    background-image: linear-gradient(
      90deg,
      var(--mobility-surface-muted) 0%,
      var(--mobility-surface-soft) 50%,
      var(--mobility-surface-muted) 100%
    );
    background-size: 200% 100%;
  }
  :global(.score-value-skeleton) {
    width: 5.1rem;
    height: 2.9rem;
    border-radius: var(--mobility-radius-small);
  }
  :global(.score-label-skeleton) {
    width: 3.8rem;
    height: 0.62rem;
    margin-top: 0.2rem;
    border-radius: 999px;
  }
  :global(.score-emoji-skeleton) {
    width: 5.25rem;
    height: 5.25rem;
    border-radius: 50%;
  }
  :global(.metric-label-skeleton) {
    width: 72%;
    height: 0.5rem;
    border-radius: 999px;
  }
  :global(.metric-value-skeleton) {
    width: 3rem;
    height: 0.76rem;
    margin-top: 0.14rem;
    border-radius: 999px;
  }
  @media (max-width: 480px) {
    .national-panel {
      width: min(19rem, calc(100vw - 1.3rem));
    }
  }
  @keyframes panel-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .national-panel {
      animation: none;
    }
    :global(.national-panel [data-slot='skeleton']) {
      animation: none;
    }
  }
</style>
