<script lang="ts">
  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';

  type ServiceType = 'health' | 'education' | 'transport';

  type Props = {
    serviceType: ServiceType;
    label: string;
    presentationTarget?: string;
    onSelect?: () => void;
  };

  let { serviceType, label, presentationTarget, onSelect = () => {} }: Props = $props();

  let markerColor = $derived(
    serviceType === 'health' ? '#bf4f55' : serviceType === 'education' ? '#4b6fa8' : '#b47a3c'
  );

  function handleSelect(event: MouseEvent): void {
    event.stopPropagation();
    onSelect();
  }
</script>

<button
  type="button"
  class="service-marker"
  data-service-marker
  data-presentation-target={presentationTarget}
  style={`--marker-color: ${markerColor}`}
  aria-label={label}
  title={label}
  onclick={handleSelect}
>
  <span class="service-marker-icon" aria-hidden="true">
    {#if serviceType === 'health'}
      <Hospital size={15} strokeWidth={2.5} />
    {:else if serviceType === 'education'}
      <School size={15} strokeWidth={2.5} />
    {:else}
      <Route size={15} strokeWidth={2.5} />
    {/if}
  </span>
</button>

<style>
  .service-marker {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color-scheme: light;
    z-index: 4;
    animation: service-marker-enter 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    opacity: 1;
    transform: translateY(0) scale(1);
    transition:
      opacity 420ms ease,
      transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
    pointer-events: auto;
    cursor: pointer;
  }

  .service-marker:focus-visible {
    outline: 3px solid #09090b;
    outline-offset: 3px;
  }

  :global(.service-marker-exiting) {
    animation: none;
    transform: translateY(0.18rem) scale(0.7);
    opacity: 0;
  }

  .service-marker-icon {
    display: grid;
    place-items: center;
    width: 1.65rem;
    height: 1.65rem;
    border: 2px solid #ffffff;
    border-radius: 50%;
    background: var(--marker-color);
    color: #ffffff;
    box-shadow: 0 0.18rem 0.55rem rgb(16 24 32 / 18%);
    transform: scale(var(--marker-scale, 1));
    transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  :global(.service-marker-icon svg) {
    display: block;
    width: 15px;
    height: 15px;
    stroke: currentColor;
  }

  @keyframes service-marker-enter {
    from {
      opacity: 0;
      transform: translateY(0.18rem) scale(0.7);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .service-marker {
      animation: none;
      transition: none;
    }

    .service-marker-icon {
      transition: none;
    }
  }
</style>
