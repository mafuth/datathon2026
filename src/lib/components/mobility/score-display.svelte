<script lang="ts">
  import { chartScore } from './island-chart-data';
  import { scorePresentation } from './score-presentation';

  let {
    value,
    label = 'Overall mobility score',
    prominent = false
  }: {
    value: number | null | undefined;
    label?: string;
    prominent?: boolean;
  } = $props();
  let score = $derived(chartScore(value));
  let presentation = $derived(scorePresentation(score, 'Score unavailable'));
</script>

<div
  class="score-display"
  class:prominent
  role="img"
  aria-label={`${label}: ${score === null ? 'unavailable' : `${Math.round(score)} out of 100. ${presentation.emojiLabel}`}`}
>
  {#if score !== null}
    <picture aria-hidden="true">
      <source media="(prefers-reduced-motion: reduce)" srcset={presentation.emojiStillSrc} type="image/png" />
      <img
        src={presentation.emojiSrc}
        alt=""
        width={prominent ? 80 : 48}
        height={prominent ? 80 : 48}
        decoding="async"
        fetchpriority="low"
      />
    </picture>
  {/if}
  <span class="score-value" aria-hidden="true">
    <strong>{score === null ? '—' : presentation.percent}</strong><small>out of 100</small>
  </span>
</div>

<style>
  .score-display {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex: 0 0 auto;
    max-width: 100%;
    min-height: 4rem;
  }
  .score-value {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
  }
  picture,
  img {
    display: block;
    width: var(--score-emoji-size, 3rem);
    height: var(--score-emoji-size, 3rem);
    flex: 0 0 auto;
  }
  img {
    object-fit: contain;
  }
  strong {
    color: var(--mobility-text);
    font-size: var(--score-value-size, var(--mobility-text-3xl));
    line-height: 1.1;
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.055em;
    font-variant-numeric: tabular-nums;
  }
  small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .score-display.prominent {
    gap: 0.8rem;
    min-height: var(--score-emoji-size, 5rem);
  }
  .prominent picture,
  .prominent img {
    width: var(--score-emoji-size, 5rem);
    height: var(--score-emoji-size, 5rem);
  }
  .prominent strong {
    font-size: var(--score-value-size, var(--mobility-text-display));
  }
  @media (max-width: 640px) {
    .score-display.prominent {
      gap: 0.65rem;
      min-height: var(--score-emoji-size, 4rem);
    }
    .prominent picture,
    .prominent img {
      width: var(--score-emoji-size, 4rem);
      height: var(--score-emoji-size, 4rem);
    }
    .prominent strong {
      font-size: var(--score-value-size, var(--mobility-text-3xl));
    }
  }
</style>
