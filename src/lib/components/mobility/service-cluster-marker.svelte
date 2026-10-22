<script lang="ts">
  import { serviceClusterBackground } from './service-marker-clustering';

  type Props = {
    total: number;
    healthCount: number;
    educationCount: number;
    transportCount: number;
    label: string;
    onSelect?: () => void;
  };

  let { total, healthCount, educationCount, transportCount, label, onSelect = () => {} }: Props = $props();

  let background = $derived(serviceClusterBackground({ total, healthCount, educationCount, transportCount }));

  function handleSelect(event: MouseEvent): void {
    event.stopPropagation();
    onSelect();
  }
</script>

<button
  type="button"
  class="service-cluster-marker"
  data-service-cluster-marker
  style:--cluster-background={background}
  aria-label={label}
  title={label}
  onclick={handleSelect}
>
  <span>{total > 99 ? '99+' : total}</span>
</button>

<style>
  .service-cluster-marker {
    display: grid;
    place-items: center;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0 0.28rem;
    border: 2px solid var(--mobility-surface);
    border-radius: var(--mobility-radius-pill);
    background: var(--cluster-background);
    color: var(--mobility-on-accent);
    box-shadow: var(--mobility-shadow-marker);
    animation: service-cluster-marker-enter var(--mobility-duration-enter) var(--mobility-ease) both;
    opacity: 1;
    transform: scale(var(--marker-scale, 1));
    cursor: pointer;
    font-family: var(--mobility-font-body);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-extrabold);
    line-height: 1;
    text-shadow: var(--mobility-shadow-text);
    transition:
      transform var(--mobility-duration-fast) var(--mobility-ease),
      opacity var(--mobility-duration-fast) ease,
      box-shadow var(--mobility-duration-fast) ease;
  }

  .service-cluster-marker:hover {
    transform: scale(calc(var(--marker-scale, 1) * 1.08));
    box-shadow: var(--mobility-shadow-popup);
  }

  :global(.service-cluster-marker-exiting) {
    animation: none;
    opacity: 0;
    transform: scale(calc(var(--marker-scale, 1) * 0.72));
  }

  .service-cluster-marker:focus-visible {
    outline: 3px solid var(--mobility-ink);
    outline-offset: 3px;
  }

  @keyframes service-cluster-marker-enter {
    from {
      opacity: 0;
      transform: scale(calc(var(--marker-scale, 1) * 0.72));
    }
    to {
      opacity: 1;
      transform: scale(var(--marker-scale, 1));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .service-cluster-marker {
      animation: none;
      transition: none;
    }
  }
</style>
