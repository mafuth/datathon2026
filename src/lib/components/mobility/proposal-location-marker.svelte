<script lang="ts">
  import type { ServiceDemandCategory } from './island-services';

  import { serviceAppearance } from '$lib/mobility/service-icons';

  type Props = {
    serviceType: ServiceDemandCategory;
    subtype: string;
    label: string;
    status: string;
  };

  let { serviceType, subtype, label, status }: Props = $props();
  const appearance = $derived(serviceAppearance(serviceType, subtype));
</script>

<div class="placement-marker" role="img" aria-label={`${label}. ${status}`} data-proposal-location>
  <div class="placement-caption" aria-hidden="true">
    <strong>{appearance.label} · Preview</strong>
    <small>{status}</small>
  </div>
  <span class="placement-icon" aria-hidden="true"><appearance.Icon size={20} strokeWidth={2} /></span>
</div>

<style>
  .placement-marker {
    position: relative;
    display: grid;
    width: 2.6rem;
    height: 2.8rem;
    place-items: start center;
    color: var(--mobility-accent);
  }
  .placement-icon {
    display: grid;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border: 2px solid var(--mobility-accent);
    border-radius: 50%;
    background: var(--mobility-accent-soft);
    box-shadow:
      0 0 0 3px var(--mobility-surface),
      var(--mobility-shadow-marker);
  }
  .placement-marker::after {
    position: absolute;
    bottom: 0;
    width: 0.45rem;
    height: 0.45rem;
    border-right: 2px solid var(--mobility-accent);
    border-bottom: 2px solid var(--mobility-accent);
    background: var(--mobility-accent-soft);
    content: '';
    transform: rotate(45deg);
  }
  .placement-caption {
    position: absolute;
    bottom: calc(100% + 0.45rem);
    display: grid;
    gap: 0.15rem;
    width: max-content;
    max-width: 12rem;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--mobility-border-strong);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-popup);
    text-align: center;
  }
  .placement-caption strong {
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-tight);
  }
  .placement-caption small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
</style>
