<script lang="ts">
  import type { ProposalRecommendation } from './proposal-workspace.svelte';

  import Sparkles from '@lucide/svelte/icons/sparkles';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';

  let {
    recommendation,
    pending = false,
    onReview = () => {},
    onDismiss = () => {}
  }: {
    recommendation: ProposalRecommendation | null;
    pending?: boolean;
    onReview?: () => void;
    onDismiss?: () => void;
  } = $props();

  const money = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

  function formatMoney(value: number): string {
    return `MVR ${money.format(value)}`;
  }
</script>

<aside class="presentation-recommendation" aria-labelledby="presentation-recommendation-title">
  <Card.Root class="presentation-recommendation-card">
    <Card.Header class="presentation-recommendation-header">
      <div class="presentation-recommendation-heading">
        <Badge variant="outline"><Sparkles data-icon="inline-start" aria-hidden="true" />Data wizard</Badge>
        <Card.Title id="presentation-recommendation-title">
          {pending && !recommendation ? 'Preparing your recommendation' : 'Compare a ferry connection'}
        </Card.Title>
      </div>
    </Card.Header>
    <Card.Content class="presentation-recommendation-content">
      {#if pending && !recommendation}
        <div class="data-wizard-loader" role="status" aria-live="polite">
          <img
            src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Mage.png"
            alt=""
            width="72"
            height="72"
          />
          <div>
            <strong>Our data wizards are cooking…</strong>
            <p>Comparing access, journey time, and planning allowances.</p>
          </div>
        </div>
      {:else if recommendation}
        <p>
          A scheduled ferry to Hanimaadhoo may be a lower-cost alternative to upgrading Baarah Health Centre. It does
          not provide hospital capability on Baarah.
        </p>
        <dl class="presentation-recommendation-comparison">
          <div>
            <dt>Illustrative modeled duration</dt>
            <dd>
              {recommendation.currentJourneyMinutes} min <span>→</span>
              {recommendation.recommendedJourneyMinutes} min
            </dd>
            <small>{recommendation.accessibilityImprovementPercent}% shorter under this schedule</small>
          </div>
          <div>
            <dt>Upfront planning allowance</dt>
            <dd>
              {formatMoney(recommendation.originalCapital)} <span>→</span>
              {formatMoney(recommendation.recommendedCapital)}
            </dd>
            <small>{formatMoney(recommendation.capitalSavings)} lower</small>
          </div>
          <div>
            <dt>Annual operating allowance</dt>
            <dd>
              {formatMoney(recommendation.originalAnnual)} <span>→</span>
              {formatMoney(recommendation.recommendedAnnual)}
            </dd>
            <small>{formatMoney(recommendation.annualSavings)} lower each year</small>
          </div>
        </dl>
        <p class="presentation-recommendation-note">
          Uses direct sailing distance, regular-headway waiting, and planning allowances. Not a timetable, supplier
          quote, clinical-equivalence assessment, or approved recommendation.
        </p>
      {/if}
    </Card.Content>
    {#if recommendation}
      <Card.Footer class="presentation-recommendation-actions">
        <Button variant="ghost" disabled={pending} onclick={onDismiss}>Dismiss</Button>
        <Button disabled={pending} onclick={onReview}>Review suggested ferry</Button>
      </Card.Footer>
    {/if}
  </Card.Root>
</aside>

<style>
  .presentation-recommendation {
    grid-column: 2;
    align-self: end;
    justify-self: center;
    z-index: 35;
    width: min(100%, 38rem);
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    color-scheme: light;
    pointer-events: none;
  }

  :global(.presentation-recommendation-card) {
    border: 1px solid #d4d4d8;
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 97%);
    color: #18181b;
    box-shadow: 0 0.8rem 2.2rem rgb(24 24 27 / 14%);
    backdrop-filter: blur(14px);
    pointer-events: auto;
  }

  :global(.presentation-recommendation-header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1rem 0.75rem;
  }

  .presentation-recommendation-heading {
    display: grid;
    gap: 0.45rem;
  }

  .presentation-recommendation-heading :global([data-slot='badge']) {
    width: fit-content;
    border-color: #d4d4d8;
    background: #fafafa;
    color: #52525b;
    font-size: 0.72rem;
  }

  :global(.presentation-recommendation-heading [data-slot='card-title']) {
    font-family: var(--font-secondary, 'Sora', sans-serif);
    font-size: 1.05rem;
    font-weight: 750;
    letter-spacing: -0.025em;
  }

  :global(.presentation-recommendation-content) {
    display: grid;
    gap: 0.8rem;
    padding: 0 1rem;
    color: #3f3f46;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .data-wizard-loader {
    display: flex;
    min-height: 8rem;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem 0 1.25rem;
  }

  .data-wizard-loader img {
    width: 4.5rem;
    height: 4.5rem;
    flex: none;
    object-fit: contain;
  }

  .data-wizard-loader strong {
    display: block;
    color: #18181b;
    font-family: var(--font-secondary, 'Sora', sans-serif);
    font-size: 1rem;
  }

  .data-wizard-loader p {
    margin-top: 0.25rem;
    color: #71717a;
    font-size: 0.78rem;
  }

  .presentation-recommendation-comparison {
    display: grid;
    gap: 0;
    border-block: 1px solid #e4e4e7;
  }

  .presentation-recommendation-comparison > div {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: baseline;
    gap: 0.2rem 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid #f4f4f5;
  }

  .presentation-recommendation-comparison > div:last-child {
    border-bottom: 0;
  }

  .presentation-recommendation-comparison dt {
    color: #52525b;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .presentation-recommendation-comparison dd {
    color: #18181b;
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    text-align: right;
  }

  .presentation-recommendation-comparison dd span {
    color: #a1a1aa;
    padding-inline: 0.2rem;
  }

  .presentation-recommendation-comparison small {
    grid-column: 2;
    color: #71717a;
    font-size: 0.72rem;
    text-align: right;
  }

  .presentation-recommendation-note {
    color: #71717a;
    font-size: 0.74rem;
    line-height: 1.45;
  }

  :global(.presentation-recommendation-actions) {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.85rem 1rem 1rem;
  }

  @media (max-width: 82rem) and (min-width: 64.001rem) {
    .presentation-recommendation-comparison > div {
      grid-template-columns: 1fr;
    }

    .presentation-recommendation-comparison dd,
    .presentation-recommendation-comparison small {
      grid-column: 1;
      text-align: left;
    }
  }

  @media (max-width: 64rem) {
    .presentation-recommendation {
      position: fixed;
      right: 50%;
      bottom: calc(60dvh + 1.25rem);
      width: min(38rem, calc(100vw - 2rem));
      max-height: calc(40dvh - 2rem);
      transform: translateX(50%);
    }
  }

  @media (max-width: 40rem) {
    .presentation-recommendation {
      bottom: calc(60dvh + 1.25rem + env(safe-area-inset-bottom, 0px));
      width: calc(100vw - 1.5rem);
      max-height: calc(40dvh - 2rem - env(safe-area-inset-bottom, 0px));
    }

    .presentation-recommendation-comparison > div {
      grid-template-columns: 1fr;
    }

    .presentation-recommendation-comparison dd,
    .presentation-recommendation-comparison small {
      grid-column: 1;
      text-align: left;
    }

    :global(.presentation-recommendation-actions) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .presentation-recommendation {
      transition: none;
    }
  }
</style>
