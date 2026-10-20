<script lang="ts">
  import Hammer from '@lucide/svelte/icons/hammer';

  import { Button } from '$components/ui/button';

  type Props = {
    onCreate?: () => void;
  };

  let { onCreate = () => {} }: Props = $props();
</script>

<div class="proposal-launcher">
  <Button
    class="proposal-launcher-button"
    variant="outline"
    size="icon"
    type="button"
    aria-label="Create a proposal"
    title="Create a proposal"
    onclick={onCreate}
  >
    <Hammer aria-hidden="true" />
    <span class="proposal-launcher-label">Create a proposal</span>
  </Button>
</div>

<style>
  .proposal-launcher {
    position: fixed;
    z-index: 21;
    bottom: 1.85rem;
    right: calc(min(31rem, calc(100vw - 2rem)) + 1.65rem);
  }

  :global(.proposal-launcher-button) {
    display: inline-flex;
    width: 2.75rem;
    min-width: 2.75rem;
    height: 2.75rem;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 999px;
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    transition:
      width 180ms ease,
      background-color 180ms ease,
      border-color 180ms ease;
  }

  :global(.proposal-launcher-button:hover),
  .proposal-launcher:focus-within :global(.proposal-launcher-button) {
    width: 11.2rem;
    border-color: var(--mobility-accent, #09090b);
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  :global(.proposal-launcher-button:hover) {
    color: var(--mobility-accent, #09090b);
  }

  .proposal-launcher-label {
    max-width: 0;
    overflow: hidden;
    margin-left: 0;
    opacity: 0;
    white-space: nowrap;
    transition:
      max-width 180ms ease,
      margin-left 180ms ease,
      opacity 120ms ease;
  }

  .proposal-launcher:hover .proposal-launcher-label,
  .proposal-launcher:focus-within .proposal-launcher-label {
    max-width: 8.2rem;
    margin-left: 0.45rem;
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.proposal-launcher-button),
    .proposal-launcher-label {
      transition: none;
    }
  }

  @media (max-width: 640px) {
    .proposal-launcher {
      bottom: 1.85rem;
      right: calc(1rem + 2.45rem + 0.5rem);
    }
  }
</style>
