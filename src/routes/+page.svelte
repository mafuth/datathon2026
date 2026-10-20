<script lang="ts">
  import { onMount } from 'svelte';

  import NationalAccessibilityMap from '$components/mobility/national-accessibility-map.svelte';
  import { PresentationController } from '$components/mobility/presentation-controller.svelte';

  const controller = new PresentationController();
  let presentationCueElement: HTMLElement | undefined;

  onMount(() => {
    let frame = 0;
    const resizeObserver = new ResizeObserver(updatePresentationCuePosition);
    const mutationObserver = new MutationObserver(updatePresentationCuePosition);

    function updatePresentationCuePosition(): void {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!presentationCueElement) return;

        const scoreCard = document.querySelector<HTMLElement>('.national-panel-slot');
        const legend = document.querySelector<HTMLElement>('.map-legend');
        if (!scoreCard || !legend) return;

        const scoreBottom = scoreCard.getBoundingClientRect().bottom;
        const legendTop = legend.getBoundingClientRect().top;
        const gap = 8;
        presentationCueElement.style.top = `${scoreBottom + gap}px`;
        presentationCueElement.style.maxHeight = `${Math.max(0, legendTop - scoreBottom - gap * 2)}px`;
      });
    }

    const scoreCard = document.querySelector<HTMLElement>('.national-panel-slot');
    const legend = document.querySelector<HTMLElement>('.map-legend');
    if (scoreCard) resizeObserver.observe(scoreCard);
    if (legend) resizeObserver.observe(legend);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', updatePresentationCuePosition);
    updatePresentationCuePosition();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', updatePresentationCuePosition);
    };
  });
</script>

<svelte:window onkeydown={(event) => controller.handleKeydown(event)} />

<NationalAccessibilityMap
  presentationActive={controller.active}
  presentationStep={controller.active ? controller.currentStep : null}
/>

{#if controller.active}
  <aside
    bind:this={presentationCueElement}
    class="presentation-cue"
    aria-label="Presenter practice script"
    aria-live="polite"
    data-presentation-cue
  >
    <div class="presentation-cue-script">
      {#each controller.currentStep.speakerCues as cue, cueIndex (cueIndex)}
        {#if cue.kind === 'direction'}
          <span class="presentation-cue-direction">{cue.text}</span>
        {:else}
          <blockquote>{cue.text}</blockquote>
        {/if}
      {/each}
    </div>
  </aside>
{/if}

<style>
  .presentation-cue {
    position: fixed;
    top: var(--presentation-cue-top, 50%);
    bottom: auto;
    left: max(1rem, env(safe-area-inset-left));
    z-index: 50;
    display: block;
    width: min(19rem, calc(100vw - 2rem));
    margin: 0;
    max-height: var(--presentation-cue-max-height, none);
    padding: 0.5rem 0.8rem 0.6rem 0.95rem;
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid #d4d4d8;
    border-radius: 0.6rem;
    background: rgb(255 255 255 / 97%);
    box-shadow: 0 0.8rem 2rem rgb(24 24 27 / 18%);
    color: #18181b;
    pointer-events: none;
    backdrop-filter: blur(12px);
  }

  .presentation-cue::before {
    position: absolute;
    inset: 0 auto 0 0;
    width: 0.2rem;
    background: #f97316;
    content: '';
  }

  .presentation-cue-script {
    display: grid;
    gap: 0.2rem;
    overflow: visible;
  }

  .presentation-cue blockquote {
    margin: 0;
    color: #27272a;
    font-size: clamp(0.76rem, 1vw, 0.86rem);
    font-weight: 450;
    line-height: 1.28;
    text-wrap: pretty;
  }

  .presentation-cue-direction {
    display: block;
    color: #c2410c;
    font-size: clamp(0.64rem, 0.85vw, 0.72rem);
    font-style: italic;
    font-weight: 650;
    line-height: 1.12;
  }

  @media (max-width: 700px) {
    .presentation-cue {
      left: max(0.75rem, env(safe-area-inset-left));
      width: calc(100vw - 1.5rem);
      padding: 0.5rem 0.8rem 0.6rem 0.95rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .presentation-cue {
      backdrop-filter: none;
    }
  }
</style>
