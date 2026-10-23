<script lang="ts">
  import type { AnalyticsIsland } from './national-analytics-card.svelte';
  import type { ScoreDriver } from './score-driver-list.svelte';

  import { Skeleton } from '$components/ui/skeleton';

  import ScoreDriverList from './score-driver-list.svelte';
  import { isUnavailableScore, scorePresentation } from './score-presentation';

  type Props = {
    island: AnalyticsIsland | null;
    loading?: boolean;
    error?: boolean;
  };

  let { island, loading = false, error = false }: Props = $props();

  let overall = $derived(island?.overall.score);
  let presentation = $derived(scorePresentation(overall, 'Island score unavailable'));
  const driverDefinitions = [
    { key: 'health', label: 'Health' },
    { key: 'education', label: 'Education' },
    { key: 'transport', label: 'Transport' },
    { key: 'employment', label: 'Employment' },
    { key: 'sustainability', label: 'Sustainability' }
  ] as const;

  let scoreDrivers = $derived.by((): ScoreDriver[] =>
    driverDefinitions.map((driver) => ({
      ...driver,
      score: island?.[driver.key].score
    }))
  );

  function islandLabel(): string {
    return island ? `${island.atollName} ${island.name}` : 'Island score';
  }
</script>

<section class="island-panel" aria-label="Island mobility score" aria-busy={loading}>
  <div class="panel-heading">
    <div class="heading-copy">
      {#if loading}
        <Skeleton class="title-skeleton" />
        <Skeleton class="caption-skeleton" />
      {:else}
        <h2>{islandLabel()}</h2>
        <p>Island score</p>
      {/if}
    </div>
  </div>

  <div class="score-mood" aria-live="polite">
    {#if loading}
      <Skeleton class="value-skeleton" />
      <Skeleton class="emoji-skeleton" />
    {:else if isUnavailableScore(overall)}
      <div class="score-unavailable">
        <strong>Score unavailable</strong>
        <span>There is not enough island data to calculate a score.</span>
      </div>
    {:else}
      <strong class="score-value" style={`color: ${presentation.color}`}>{presentation.percent}</strong>
      {#if presentation.emojiSrc}
        <img src={presentation.emojiSrc} alt={presentation.emojiLabel} width="82" height="82" />
      {:else}
        <span class="emoji-placeholder" aria-hidden="true">?</span>
      {/if}
    {/if}
  </div>

  <ScoreDriverList drivers={scoreDrivers} {loading} />

  {#if error}<p class="panel-error">Island details are unavailable.</p>{/if}
</section>

<style>
  .island-panel {
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.72rem 0.9rem;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.55rem;
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
  }
  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.55rem;
  }
  .heading-copy {
    min-width: 0;
  }
  h2 {
    overflow: hidden;
    margin: 0;
    font-size: 1.08rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .heading-copy p {
    margin: 0.16rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    font-weight: 650;
  }
  .score-mood {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 0.75rem;
    width: min(15rem, 100%);
    margin: 0.55rem auto 0.7rem;
  }
  .score-value {
    grid-column: 2;
    justify-self: end;
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    text-align: right;
    line-height: 1;
  }
  .score-mood img,
  .emoji-placeholder {
    display: grid;
    grid-column: 1;
    grid-row: 1;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
    object-fit: contain;
  }
  .emoji-placeholder {
    color: #8b949b;
    font-size: 1.7rem;
    font-weight: 800;
  }
  .score-unavailable {
    display: grid;
    grid-column: 1 / -1;
    justify-items: center;
    gap: 0.25rem;
    text-align: center;
  }
  .score-unavailable strong {
    font-size: 0.76rem;
  }
  .score-unavailable span {
    color: #52525b;
    font-size: 0.61rem;
    line-height: 1.35;
  }
  .panel-error {
    margin: 0.55rem 0 0;
    color: #b42318;
    font-size: 0.72rem;
  }
  :global([data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  :global(.title-skeleton) {
    width: 8.5rem;
    height: 1rem;
  }
  :global(.caption-skeleton) {
    width: 5rem;
    height: 0.5rem;
    margin-top: 0.18rem;
  }
  :global(.value-skeleton) {
    grid-column: 2;
    justify-self: end;
    width: 5rem;
    height: 2.9rem;
  }
  :global(.emoji-skeleton) {
    grid-column: 1;
    grid-row: 1;
    width: 4.25rem;
    height: 4.25rem;
    border-radius: 50%;
  }
</style>
