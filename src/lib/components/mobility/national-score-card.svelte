<script lang="ts">
  import type { ScoreCardMetric } from './score-presentation';

  import { onMount } from 'svelte';

  import { Input } from '$components/ui/input';
  import { Skeleton } from '$components/ui/skeleton';

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
        <div class="score-value">
          <strong style={`color: ${presentation.color}`}>{presentation.percent}</strong>
        </div>
        {#if presentation.emojiSrc}
          <img
            class="score-emoji"
            src={presentation.emojiSrc}
            alt={presentation.emojiLabel}
            width="88"
            height="88"
            loading="eager"
            decoding="async"
          />
        {:else}
          <span class="score-emoji-placeholder" aria-hidden="true">?</span>
        {/if}
      {/if}
    </div>
  </div>

  {#if loading}
    <Skeleton class="why-score-button-skeleton" aria-hidden="true" />
  {:else}
    <button
      class="why-score-button"
      type="button"
      aria-label={`Why ${presentation.percent}?`}
      onclick={onAnalyticsOpen}
    >
      Why {presentation.percent}?
    </button>
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
              <button
                class="island-search-suggestion"
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
              </button>
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
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.55rem;
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
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
    font-size: 1.22rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel-caption {
    margin: 0.16rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    font-weight: 650;
    letter-spacing: 0.03em;
    line-height: 1.35;
  }
  :global(.score-title-skeleton) {
    width: 8.8rem;
    height: 1.1rem;
    border-radius: 0.28rem;
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
    border-radius: 0.38rem;
  }
  :global(.island-search-input) {
    width: 100%;
    height: 2rem;
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
    font-size: 0.68rem;
    font-weight: 650;
  }
  :global(.island-search-input::placeholder) {
    color: #7a858a;
  }
  :global(.island-search-input:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0 0 3px rgb(9 9 11 / 16%);
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
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.42rem;
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.45rem 1.1rem rgb(16 24 32 / 12%);
  }
  .island-search-suggestion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.48rem 0.5rem;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: var(--mobility-text, #09090b);
    cursor: pointer;
    font-size: 0.68rem;
    text-align: left;
  }
  .island-search-suggestion:hover,
  .island-search-suggestion:focus-visible {
    background: var(--mobility-accent-soft, #f4f4f5);
    outline: none;
  }
  .island-search-suggestion span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .island-search-suggestion strong {
    flex: 0 0 auto;
    color: var(--mobility-accent, #09090b);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }
  .island-search-empty {
    margin: 0;
    padding: 0.5rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.68rem;
  }
  :global(.why-score-button) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 2.35rem;
    margin-top: 0.7rem;
    padding: 0 0.8rem;
    border: 1px solid var(--mobility-accent, #09090b);
    border-radius: 0.48rem;
    background: var(--mobility-accent, #09090b);
    color: #fff;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.01em;
  }
  :global(.why-score-button:hover),
  :global(.why-score-button:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-focus, #3f3f46);
    color: #fff;
    outline: none;
    box-shadow: 0 0 0 3px rgb(16 24 32 / 14%);
  }
  :global(.why-score-button-skeleton) {
    display: block;
    width: 100%;
    height: 2.35rem;
    margin-top: 0.7rem;
    border-radius: 0.48rem;
  }
  .score-mood {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    width: min(15rem, 100%);
    margin: 0.28rem auto 1.25rem;
  }
  .score-loading {
    display: contents;
  }
  .score-value {
    min-width: 0;
    text-align: left;
  }
  .score-value strong {
    display: block;
    font-size: 2.9rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  .score-emoji {
    display: block;
    width: 5.25rem;
    height: 5.25rem;
    object-fit: contain;
  }
  .score-emoji-placeholder {
    display: grid;
    place-items: center;
    width: 5.25rem;
    height: 5.25rem;
    color: #8b949b;
    font-size: 1.7rem;
    font-weight: 800;
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
    font-size: 0.75rem;
    line-height: 1.25;
  }
  .score-no-data span {
    max-width: 15rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    line-height: 1.35;
  }
  .overall-score-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--mobility-border, #e4e4e7);
  }
  .overall-score-card {
    display: grid;
    gap: 0.14rem;
    min-width: 0;
    min-height: 2.65rem;
    padding: 0.48rem 0.55rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    border-radius: 0.4rem;
    background: #fafafa;
  }
  .overall-score-card span {
    color: var(--mobility-muted, #71717a);
    font-size: 0.55rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .overall-score-card strong {
    color: var(--mobility-text, #09090b);
    font-size: 0.76rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .panel-error {
    margin: 0.55rem 0 0;
    color: #b42318;
    font-size: 0.72rem;
  }
  :global(.national-panel [data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  :global(.score-value-skeleton) {
    width: 5.1rem;
    height: 2.9rem;
    border-radius: 0.35rem;
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
  @media (prefers-reduced-motion: reduce) {
    :global(.national-panel [data-slot='skeleton']) {
      animation: none;
    }
  }
</style>
