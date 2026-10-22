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
    size="sm"
    type="button"
    aria-label="Create a proposal"
    title="Create a proposal"
    onclick={onCreate}
  >
    <Hammer aria-hidden="true" data-icon="inline-start" />
    <span class="proposal-launcher-label">Create proposal</span>
  </Button>
</div>

<style>
  .proposal-launcher {
    display: flex;
    flex: 1 1 0;
    min-width: 0;
    width: 100%;
  }

  .proposal-launcher :global(.proposal-launcher-button) {
    display: inline-flex;
    width: 100%;
    min-width: 0;
    height: 2.375rem;
    justify-content: center;
    gap: 0.4rem;
    padding-inline: 0.75rem;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    font-size: var(--mobility-text-sm);
  }

  .proposal-launcher :global(.proposal-launcher-button:hover),
  .proposal-launcher:focus-within :global(.proposal-launcher-button) {
    background: var(--mobility-accent-hover);
    color: var(--mobility-on-accent);
  }

  .proposal-launcher-label {
    white-space: nowrap;
  }
</style>
