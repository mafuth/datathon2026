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
    border: 2px solid #ffffff;
    border-radius: 999px;
    background: var(--cluster-background);
    color: #ffffff;
    box-shadow: 0 0.18rem 0.55rem rgb(16 24 32 / 22%);
    animation: service-cluster-marker-enter 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
    opacity: 1;
    transform: scale(var(--marker-scale, 1));
    cursor: pointer;
    font-size: 0.62rem;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 1px 2px rgb(0 0 0 / 32%);
    transition:
      transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 360ms ease,
      box-shadow 360ms ease;
  }

  .service-cluster-marker:hover {
    transform: scale(calc(var(--marker-scale, 1) * 1.08));
    box-shadow: 0 0.25rem 0.7rem rgb(16 24 32 / 28%);
  }

  :global(.service-cluster-marker-exiting) {
    animation: none;
    opacity: 0;
    transform: scale(calc(var(--marker-scale, 1) * 0.72));
  }

  .service-cluster-marker:focus-visible {
    outline: 3px solid #09090b;
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
