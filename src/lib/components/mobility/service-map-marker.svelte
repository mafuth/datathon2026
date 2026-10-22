<script lang="ts">
  import { serviceAppearance } from '$lib/mobility/service-icons';

  type ServiceType = 'health' | 'education' | 'transport';

  type Props = {
    serviceType: ServiceType;
    subtype: string;
    label: string;
    onSelect?: () => void;
  };

  let { serviceType, subtype, label, onSelect = () => {} }: Props = $props();
  let appearance = $derived(serviceAppearance(serviceType, subtype));

  let markerColor = $derived.by(() => {
    const type = subtype
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (serviceType === 'health') {
      return type === 'pharmacy'
        ? 'var(--mobility-marker-pharmacy)'
        : type === 'hospital'
          ? 'var(--mobility-marker-hospital)'
          : 'var(--mobility-marker-clinic)';
    }
    if (serviceType === 'education') return 'var(--mobility-marker-school)';
    if (['airport', 'air_terminal', 'helipad', 'aerodrome'].includes(type)) return 'var(--mobility-marker-airport)';
    if (['port', 'jetty', 'harbour', 'harbor', 'pier'].includes(type)) return 'var(--mobility-marker-ferry)';
    return 'var(--mobility-marker-bus)';
  });

  function handleSelect(event: MouseEvent): void {
    event.stopPropagation();
    onSelect();
  }
</script>

<button
  type="button"
  class="service-marker"
  data-service-marker
  data-service-type={serviceType}
  data-service-subtype={subtype}
  style={`--marker-color: ${markerColor}`}
  aria-label={label}
  title={label}
  onclick={handleSelect}
>
  <span class="service-marker-icon" aria-hidden="true">
    <appearance.Icon size={17} strokeWidth={2.1} />
  </span>
</button>

<style>
  .service-marker {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0;
    width: 2.25rem;
    height: 2.25rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color-scheme: light;
    z-index: 4;
    animation: service-marker-enter var(--mobility-duration-enter) var(--mobility-ease) both;
    opacity: 1;
    transform: translateY(0) scale(1);
    transition:
      opacity var(--mobility-duration-fast) var(--mobility-ease),
      transform var(--mobility-duration-enter) var(--mobility-ease);
    pointer-events: auto;
    cursor: pointer;
  }

  .service-marker:focus-visible {
    outline: 3px solid var(--mobility-focus);
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
    width: 1.9rem;
    height: 1.9rem;
    border: 1.5px solid color-mix(in srgb, var(--marker-color) 38%, var(--mobility-surface));
    border-radius: 50%;
    background: color-mix(in srgb, var(--marker-color) 6%, var(--mobility-surface));
    color: var(--marker-color);
    box-shadow:
      0 0 0 2px var(--mobility-surface),
      var(--mobility-shadow-marker);
    transform: scale(var(--marker-scale, 1));
    transition:
      transform var(--mobility-duration-fast) var(--mobility-ease),
      box-shadow var(--mobility-duration-fast) var(--mobility-ease);
  }

  .service-marker:is(:hover, :focus-visible) .service-marker-icon {
    transform: scale(calc(var(--marker-scale, 1) * 1.12));
    box-shadow:
      0 0 0 2px var(--mobility-surface),
      var(--mobility-shadow-marker);
  }

  :global(.service-marker-icon svg) {
    display: block;
    width: 17px;
    height: 17px;
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
