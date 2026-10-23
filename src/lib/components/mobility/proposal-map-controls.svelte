<script lang="ts">
  import type { ServiceDemandCategory } from './island-services';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';

  import { Button } from '$components/ui/button';

  let {
    view = $bindable<'before' | 'after'>('after'),
    lens = $bindable<ServiceDemandCategory>('transport'),
    pending = false,
    current = true,
    preview = false
  }: {
    view?: 'before' | 'after';
    lens?: ServiceDemandCategory;
    pending?: boolean;
    current?: boolean;
    preview?: boolean;
  } = $props();

  const lenses = [
    { value: 'transport', label: 'Transport', icon: Route },
    { value: 'health', label: 'Health', icon: Hospital },
    { value: 'education', label: 'Education', icon: School }
  ] as const;
  const status = $derived(
    view === 'before'
      ? 'Showing the baseline without the proposal.'
      : pending
        ? 'Updating proposal. Last available result shown.'
        : preview
          ? 'Preview shown. This change has not been added to the proposal.'
          : current
            ? 'Proposal comparison ready.'
            : 'Previous result shown. Refresh the proposal impact for a current result.'
  );
</script>

<nav class="proposal-map-dock" aria-label="Compare the proposal on the map">
  <div
    class="lens-pill"
    role="group"
    aria-label="Service shown on the map"
    title="Map colours show modeled demand pressure, rather than journey times or unique residents served."
  >
    {#each lenses as category (category.value)}
      {@const Icon = category.icon}
      <Button
        variant="ghost"
        class="map-control-button"
        type="button"
        aria-pressed={lens === category.value}
        onclick={() => (lens = category.value)}
      >
        <Icon size={13} aria-hidden="true" /><span>{category.label}</span>
      </Button>
    {/each}
  </div>
  <div class="comparison-pill" role="group" aria-label="Compare baseline and proposal">
    <Button
      variant="ghost"
      class="map-control-button"
      type="button"
      aria-pressed={view === 'before'}
      onclick={() => (view = 'before')}>Without proposal</Button
    >
    <Button
      variant="ghost"
      class="map-control-button"
      type="button"
      aria-pressed={view === 'after'}
      onclick={() => (view = 'after')}>With proposal</Button
    >
    <span
      class="comparison-status"
      class:updating={pending}
      class:stale={view === 'after' && !pending && !current && !preview}
      title={status}
    >
      <span class="sr-only" role="status">{status}</span>
    </span>
  </div>
</nav>

<style>
  .proposal-map-dock {
    position: fixed;
    z-index: 25;
    right: 1rem;
    bottom: 1.1rem;
    left: 26rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    pointer-events: none;
    color: var(--mobility-ink);
    color-scheme: light;
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity var(--mobility-duration-enter) var(--mobility-ease),
      transform var(--mobility-duration-enter) var(--mobility-ease);

    @starting-style {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .lens-pill,
  .comparison-pill {
    display: flex;
    align-items: center;
    max-width: 100%;
    gap: 0.15rem;
    padding: 0.3rem;
    border: 1px solid var(--mobility-border);
    border-radius: 999px;
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
    pointer-events: auto;
  }
  .proposal-map-dock :global(.map-control-button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--mobility-muted);
    font: inherit;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--mobility-duration-fast) var(--mobility-ease),
      color var(--mobility-duration-fast) var(--mobility-ease),
      box-shadow var(--mobility-duration-fast) var(--mobility-ease),
      scale var(--mobility-duration-fast) var(--mobility-ease),
      transform var(--mobility-duration-fast) var(--mobility-ease);
  }
  .lens-pill :global(.map-control-button) {
    min-height: 2rem;
    padding: 0.3rem 0.85rem;
    font-size: var(--mobility-text-xs);
  }
  .lens-pill :global(.map-control-button[aria-pressed='true']) {
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }
  .comparison-pill :global(.map-control-button) {
    min-height: 2.5rem;
    min-width: 8.6rem;
    padding: 0.45rem 1.15rem;
  }
  .comparison-pill :global(.map-control-button[aria-pressed='true']) {
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    box-shadow: var(--mobility-shadow-card);
  }
  @media (hover: hover) and (pointer: fine) {
    .proposal-map-dock :global(.map-control-button:hover:not([aria-pressed='true'])) {
      background: var(--mobility-surface-muted);
      color: var(--mobility-ink);
    }
    .comparison-pill :global(.map-control-button[aria-pressed='true']:hover) {
      background: var(--mobility-accent-hover);
    }
  }
  .proposal-map-dock :global(.map-control-button:focus-visible) {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 2px;
  }
  .proposal-map-dock :global(.map-control-button:active) {
    background: var(--mobility-accent-soft);
  }
  .comparison-pill :global(.map-control-button[aria-pressed='true']:active) {
    background: var(--mobility-accent-hover);
  }
  .comparison-status {
    width: 0.35rem;
    height: 0.35rem;
    flex: 0 0 auto;
    margin: 0 0.5rem 0 0.3rem;
    border-radius: 50%;
    background: var(--mobility-accent);
    transition: background-color var(--mobility-duration-fast) var(--mobility-ease);
  }
  .comparison-status.updating,
  .comparison-status.stale {
    background: var(--mobility-warning);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 800px) and (min-width: 641px) {
    .proposal-map-dock {
      left: 25.5rem;
      right: 0.5rem;
    }
    .comparison-pill :global(.map-control-button) {
      min-width: 0;
      padding-inline: 0.6rem;
      font-size: var(--mobility-text-xs);
    }
    .lens-pill :global(.map-control-button) {
      padding-inline: 0.5rem;
    }
    .lens-pill :global(svg) {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .proposal-map-dock {
      right: 0.6rem;
      bottom: calc(0.6rem + env(safe-area-inset-bottom, 0px));
      left: 0.6rem;
      gap: 0.4rem;
    }
    .lens-pill :global(.map-control-button) {
      min-height: 2.5rem;
      padding-inline: 0.9rem;
    }
    .comparison-pill {
      width: min(100%, 20rem);
    }
    .comparison-pill :global(.map-control-button) {
      min-width: 0;
      min-height: 2.75rem;
      flex: 1;
      padding-inline: 0.7rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .proposal-map-dock {
      transform: none;
      transition: none;
    }
    .proposal-map-dock :global(.map-control-button) {
      transition: none;
    }
    .comparison-status {
      transition: none;
    }
  }
</style>
