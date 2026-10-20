<script lang="ts">
  import type { AnalyticsIsland } from './national-analytics-card.svelte';
  import type { ScoreCardMetric } from './score-presentation';

  import { Skeleton } from '$components/ui/skeleton';

  import { isUnavailableScore, scorePercentage, scorePresentation } from './score-presentation';

  type Props = {
    island: AnalyticsIsland | null;
    loading?: boolean;
    error?: boolean;
  };

  let { island, loading = false, error = false }: Props = $props();

  let overall = $derived(island?.overall.score);
  let presentation = $derived(scorePresentation(overall, 'Island score unavailable'));
  let metrics = $derived<readonly ScoreCardMetric[]>([
    { key: 'health', label: 'Health', value: island?.health.score },
    { key: 'education', label: 'Schools', value: island?.education.score },
    { key: 'transport', label: 'Getting around', value: island?.transport.score }
  ]);

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

  <div class="metric-grid" aria-label="Island score breakdown">
    {#each metrics as metric (metric.key)}
      <div class="metric">
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

  {#if error}<p class="panel-error">Island details are unavailable.</p>{/if}
</section>

<style>
  .island-panel {
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.9rem 1rem;
    border: 1px solid rgb(16 24 32 / 14%);
    border-radius: 0.55rem;
    background: rgb(255 255 255 / 94%);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 14%);
    color: #101820;
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
    color: #53606a;
    font-size: 0.62rem;
    font-weight: 650;
  }
  .score-mood {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    width: min(15rem, 100%);
    margin: 1rem auto 1.05rem;
  }
  .score-value {
    font-size: 2.9rem;
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  .score-mood img,
  .emoji-placeholder {
    display: grid;
    place-items: center;
    width: 5.1rem;
    height: 5.1rem;
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
    color: #53606a;
    font-size: 0.61rem;
    line-height: 1.35;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid rgb(16 24 32 / 12%);
  }
  .metric {
    display: grid;
    gap: 0.14rem;
    padding: 0.28rem 0.45rem 0.08rem;
  }
  .metric + .metric {
    border-left: 1px solid rgb(16 24 32 / 10%);
  }
  .metric span {
    color: #53606a;
    font-size: 0.55rem;
    font-weight: 700;
    line-height: 1.1;
  }
  .metric strong {
    color: #101820;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
  }
  .panel-error {
    margin: 0.55rem 0 0;
    color: #b42318;
    font-size: 0.72rem;
  }
  :global([data-slot='skeleton']) {
    background-color: #edf2ef;
    background-image: linear-gradient(90deg, #edf2ef 0%, #f9fbfa 50%, #edf2ef 100%);
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
    width: 5rem;
    height: 2.9rem;
  }
  :global(.emoji-skeleton) {
    width: 5.1rem;
    height: 5.1rem;
    border-radius: 50%;
  }
  :global(.metric-label-skeleton) {
    width: 72%;
    height: 0.5rem;
  }
  :global(.metric-value-skeleton) {
    width: 3rem;
    height: 0.76rem;
    margin-top: 0.14rem;
  }
</style>
