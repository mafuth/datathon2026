<script lang="ts">
  import type { AnalyticsData } from './national-analytics-card.svelte';
  import type { ScoreDriver } from './score-driver-list.svelte';

  import { onMount } from 'svelte';

  import { Skeleton } from '$components/ui/skeleton';

  import ScoreDriverList from './score-driver-list.svelte';
  import { isUnavailableScore, SCORE_NO_DATA_MESSAGES, scorePresentation } from './score-presentation';

  type Props = {
    title: string;
    caption: string;
    overall: number | null | undefined;
    national: AnalyticsData['national'] | null;
    onAnalyticsOpen?: () => void;
    loading?: boolean;
    error?: boolean;
  };

  let {
    title,
    caption,
    overall,
    national,
    onAnalyticsOpen = () => {},
    loading = false,
    error = false
  }: Props = $props();

  let presentation = $derived(scorePresentation(overall, `${title} score unavailable`));
  let noDataMessage = $state(SCORE_NO_DATA_MESSAGES[0]);
  const driverDefinitions = [
    { key: 'health', label: 'Health' },
    { key: 'education', label: 'Education' },
    { key: 'transport', label: 'Transport' },
    { key: 'employment', label: 'Employment' },
    { key: 'sustainability', label: 'Sustainability' }
  ] as const;
  let scoreDrivers = $derived.by((): ScoreDriver[] => {
    const categories = national?.categories;

    return driverDefinitions.map((driver) => ({
      ...driver,
      score: categories?.[driver.key]?.score
    }));
  });
  onMount(() => {
    noDataMessage =
      SCORE_NO_DATA_MESSAGES[Math.floor(Math.random() * SCORE_NO_DATA_MESSAGES.length)] ?? SCORE_NO_DATA_MESSAGES[0];
  });
</script>

<section class="national-panel" aria-label="National mobility score" aria-busy={loading} data-score-card="national">
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
      data-presentation-target="national-score-details"
      type="button"
      aria-label={`Why ${presentation.percent}?`}
      onclick={onAnalyticsOpen}
    >
      Why {presentation.percent}?
    </button>
  {/if}

  <ScoreDriverList drivers={scoreDrivers} {loading} />

  {#if error}<p class="panel-error">Details unavailable. The map score may still be shown.</p>{/if}
</section>

<style>
  .national-panel {
    position: relative;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.72rem 0.9rem;
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
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 0.75rem;
    width: min(15rem, 100%);
    margin: 0.2rem auto 0.75rem;
  }
  .score-loading {
    display: contents;
  }
  .score-value {
    grid-column: 2;
    min-width: 0;
    justify-self: end;
    text-align: right;
  }
  .score-value strong {
    display: block;
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  .score-emoji {
    display: block;
    grid-column: 1;
    grid-row: 1;
    width: 4.25rem;
    height: 4.25rem;
    object-fit: contain;
  }
  .score-emoji-placeholder {
    display: grid;
    grid-column: 1;
    grid-row: 1;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
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
    width: 4.25rem;
    height: 4.25rem;
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
    grid-column: 2;
    justify-self: end;
    width: 5.1rem;
    height: 2.9rem;
    border-radius: 0.35rem;
  }
  :global(.score-emoji-skeleton) {
    grid-column: 1;
    grid-row: 1;
    width: 4.25rem;
    height: 4.25rem;
    border-radius: 50%;
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
