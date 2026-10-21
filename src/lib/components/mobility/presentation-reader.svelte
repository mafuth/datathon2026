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
    border: 1px solid rgb(24 24 27 / 18%);
    border-radius: 0.9rem;
    background: rgb(255 255 255 / 97%);
    box-shadow: 0 1.2rem 3rem rgb(24 24 27 / 24%);
    color: #18181b;
    pointer-events: auto;
    scrollbar-color: #a1a1aa transparent;
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
    color: #27272a;
    font-size: clamp(0.8rem, 1vw, 0.92rem);
    font-weight: 470;
    line-height: 1.34;
    text-wrap: pretty;
  }

  .presentation-reader-direction {
    color: #c2410c;
    font-size: 0.72rem;
    font-style: italic;
    font-weight: 720;
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
