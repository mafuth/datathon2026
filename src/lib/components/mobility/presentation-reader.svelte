<script lang="ts">
  import type { PresentationStep } from './presentation-story';

  import { prefersReducedMotion } from 'svelte/motion';
  import { fade, fly } from 'svelte/transition';

  type Props = {
    step: PresentationStep;
  };

  let { step }: Props = $props();
  let transitionDuration = $derived(prefersReducedMotion.current ? 0 : 360);
</script>

<aside class="presentation-reader" aria-label="Presentation reader notes" data-presentation-reader>
  {#key step.id}
    <div
      class="presentation-reader-content"
      in:fly={{ y: 14, duration: transitionDuration }}
      out:fade={{ duration: transitionDuration * 0.7 }}
    >
      <div class="presentation-reader-script" aria-live="polite">
        {#each step.speakerCues as cue, cueIndex (`${step.id}:${cueIndex}`)}
          {#if cue.kind === 'direction'}
            <p class="presentation-reader-cue presentation-reader-direction">{cue.text}</p>
          {:else}
            <blockquote class="presentation-reader-cue">{cue.text}</blockquote>
          {/if}
        {/each}
      </div>
    </div>
  {/key}
</aside>

<style>
  .presentation-reader {
    position: fixed;
    right: auto;
    bottom: max(1rem, env(safe-area-inset-bottom));
    left: max(1rem, env(safe-area-inset-left));
    z-index: 60;
    width: min(25rem, calc(100vw - 2rem));
    max-height: min(60vh, 34rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--mobility-border-strong);
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--mobility-surface) 97%, transparent);
    box-shadow: var(--mobility-shadow-panel);
    color: var(--mobility-ink);
    pointer-events: auto;
    scrollbar-color: var(--mobility-chart-reference) transparent;
    backdrop-filter: blur(16px);
  }

  .presentation-reader-content {
    padding: 0.8rem 1rem 0.85rem;
  }

  .presentation-reader-script {
    display: grid;
    gap: 0.3rem;
  }

  .presentation-reader-cue {
    margin: 0;
    color: var(--mobility-ink);
    font-size: clamp(var(--mobility-text-base), 1vw, var(--mobility-text-md));
    font-weight: var(--mobility-font-weight-normal);
    line-height: 1.34;
    text-wrap: pretty;
  }

  .presentation-reader-direction {
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-sm);
    font-style: italic;
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: 0.01em;
  }

  @media (max-width: 700px) {
    .presentation-reader {
      bottom: max(0.75rem, env(safe-area-inset-bottom));
      left: max(0.75rem, env(safe-area-inset-left));
      width: auto;
      max-height: min(58vh, 26rem);
    }

    .presentation-reader-content {
      padding: 0.75rem 0.85rem 0.8rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .presentation-reader {
      backdrop-filter: none;
    }
  }
</style>
