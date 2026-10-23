<script lang="ts">
  import type { PresentationScript } from '$lib/mobility/presentation-script-contracts';

  import * as Card from '$components/ui/card';

  type Props = {
    script: PresentationScript;
    stepIndex: number;
    remainingSeconds: number;
    error?: string | null;
  };

  let { script, stepIndex, remainingSeconds, error = null }: Props = $props();

  let step = $derived(script.steps[stepIndex] ?? script.steps[0]);
  let timerState = $derived(remainingSeconds <= 30 ? 'critical' : remainingSeconds <= 120 ? 'warning' : 'normal');

  function clock(seconds: number): string {
    const minutes = Math.floor(Math.max(0, seconds) / 60);
    const remainder = Math.max(0, seconds) % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
</script>

<aside class="presentation-reader" aria-label="Presentation reader" aria-live="polite">
  <Card.Root class="presentation-reader-card">
    <Card.Header class="reader-header">
      <div class="reader-slide-count" aria-label={`Slide ${stepIndex + 1} of ${script.steps.length}`}>
        <span>SLIDE</span>
        <strong>{String(stepIndex + 1).padStart(2, '0')}</strong>
        <small>/ {String(script.steps.length).padStart(2, '0')}</small>
      </div>
      <div class={`reader-timer reader-timer-${timerState}`} aria-label={`${clock(remainingSeconds)} remaining`}>
        <span>{clock(remainingSeconds)}</span>
        <small>/ {clock(script.durationSeconds)}</small>
      </div>
    </Card.Header>

    <Card.Content class="reader-content">
      {#if step.speech.text}<p class="reader-speech">{step.speech.text}</p>{/if}
      {#if step.speech.pause !== 'normal'}
        <div class={`reader-pause reader-pause-${step.speech.pause}`}>
          {step.speech.pause === 'long' ? 'LONG PAUSE' : 'PAUSE'}
        </div>
      {/if}
      {#if step.speech.presenterNote}
        <p class="reader-note"><strong>Action:</strong> {step.speech.presenterNote}</p>
      {/if}
      {#if error}
        <p class="reader-error" role="alert">{error}</p>
      {/if}
    </Card.Content>
  </Card.Root>
</aside>

<style>
  .reader-slide-count {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
    color: #71717a;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .reader-slide-count span {
    color: #71717a;
    font-size: 0.55rem;
    font-weight: 850;
    letter-spacing: 0.12em;
  }

  .reader-slide-count strong {
    color: #18181b;
    font-size: 0.78rem;
    letter-spacing: -0.04em;
  }

  .reader-slide-count small {
    color: #a1a1aa;
    font-size: 0.65rem;
    font-weight: 700;
  }

  .presentation-reader {
    position: fixed;
    right: auto;
    left: 50%;
    bottom: 1rem;
    z-index: 2000;
    width: min(34rem, calc(100vw - 2rem));
    transform: translateX(-50%);
    pointer-events: none;
  }

  :global(.presentation-reader-card) {
    pointer-events: auto;
    border: 1px solid #d4d4d8;
    border-radius: 0.7rem;
    background: rgb(255 255 255 / 98%);
    color: #18181b;
    box-shadow: 0 1rem 3rem rgb(24 24 27 / 18%);
  }

  :global(.reader-header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem 1rem 0;
  }

  .reader-timer {
    display: flex;
    flex: 1;
    width: auto;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.15rem;
    color: #18181b;
    font-variant-numeric: tabular-nums;
  }

  .reader-timer span {
    font-size: 1.35rem;
    font-weight: 850;
    letter-spacing: -0.06em;
  }

  .reader-timer small {
    color: #71717a;
    font-size: 0.6rem;
  }
  .reader-timer-warning {
    color: #b45309;
  }
  .reader-timer-critical {
    color: #b91c1c;
  }

  :global(.reader-content) {
    display: grid;
    gap: 0.6rem;
    padding: 0.45rem 1rem 1rem;
  }
  .reader-speech {
    margin: 0;
    color: #18181b;
    font-family: var(--font-secondary, Sora, sans-serif);
    font-size: 1.14rem;
    font-weight: 650;
    line-height: 1.35;
    letter-spacing: -0.035em;
  }
  .reader-pause {
    color: #b91c1c;
    font-size: 0.63rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }
  .reader-pause-long {
    font-size: 0.72rem;
  }
  .reader-note {
    margin: 0;
    padding-top: 0.5rem;
    border-top: 1px solid #e4e4e7;
    color: #52525b;
    font-size: 0.7rem;
    line-height: 1.4;
  }
  .reader-error {
    margin: 0;
    padding-top: 0.5rem;
    border-top: 1px solid #fecaca;
    color: #b91c1c;
    font-size: 0.7rem;
    line-height: 1.4;
  }

  @media (max-width: 44rem) {
    .presentation-reader {
      bottom: 0.5rem;
      width: calc(100vw - 1rem);
    }
    .reader-speech {
      font-size: 1rem;
    }
  }
</style>
