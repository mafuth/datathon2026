<script lang="ts">
  import type { AddableServiceSubtype, AddServiceSelection, ServiceCatalogEntry } from '$lib/mobility/service-catalog';

  import Anchor from '@lucide/svelte/icons/anchor';
  import Baby from '@lucide/svelte/icons/baby';
  import Building2 from '@lucide/svelte/icons/building-2';
  import Bus from '@lucide/svelte/icons/bus';
  import BusFront from '@lucide/svelte/icons/bus-front';
  import Cross from '@lucide/svelte/icons/cross';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Helicopter from '@lucide/svelte/icons/helicopter';
  import Hospital from '@lucide/svelte/icons/hospital';
  import Plane from '@lucide/svelte/icons/plane';
  import PlaneLanding from '@lucide/svelte/icons/plane-landing';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Ship from '@lucide/svelte/icons/ship';
  import Stethoscope from '@lucide/svelte/icons/stethoscope';

  import { SERVICE_CATALOG, SERVICE_DRAG_MIME, SERVICE_TYPE_OPTIONS } from '$lib/mobility/service-catalog';

  import { Button } from '$components/ui/button';

  type Props = {
    pending?: boolean;
    activeSelection?: AddServiceSelection | null;
    onStartAddService?: (selection: AddServiceSelection) => void;
  };

  let { pending = false, activeSelection = null, onStartAddService = () => {} }: Props = $props();

  const SERVICE_ICON_BY_SUBTYPE: Record<AddableServiceSubtype, typeof Stethoscope> = {
    clinic: Stethoscope,
    health_center: Hospital,
    hospital: Cross,
    preschool: Baby,
    school: School,
    high_school: GraduationCap,
    tertiary: Building2,
    bus_stop: Bus,
    bus_station: BusFront,
    public_transport: Route,
    port: Ship,
    jetty: Anchor,
    airport: Plane,
    air_terminal: PlaneLanding,
    helipad: Helicopter
  };

  const paletteGroups = SERVICE_TYPE_OPTIONS.map((category) => ({
    ...category,
    entries: SERVICE_CATALOG.filter((entry) => entry.serviceType === category.value)
  }));

  function selectionFor(entry: ServiceCatalogEntry): AddServiceSelection {
    return {
      serviceType: entry.serviceType,
      subtype: entry.subtype,
      name: null
    };
  }

  function handleDragStart(event: DragEvent, entry: ServiceCatalogEntry): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(selectionFor(entry)));
    event.dataTransfer.setData('text/plain', entry.label);
  }

  function handleSelect(entry: ServiceCatalogEntry): void {
    onStartAddService(selectionFor(entry));
  }
</script>

<section class="service-palette" aria-label="Add a service to the proposal">
  <div class="service-palette-heading">
    <div>
      <p class="service-palette-title">Place a service</p>
      <p class="service-palette-hint">Drag an icon onto the map</p>
    </div>
    <span class="service-palette-mark" aria-hidden="true">+</span>
  </div>

  <div class="service-palette-groups">
    {#each paletteGroups as group (group.value)}
      <div class={`service-palette-group service-palette-group-${group.value}`}>
        <p class="service-palette-group-label">{group.label}</p>
        <div class="service-palette-items">
          {#each group.entries as entry (entry.subtype)}
            {@const Icon = SERVICE_ICON_BY_SUBTYPE[entry.subtype]}
            {@const selected = activeSelection?.subtype === entry.subtype}
            <Button
              class={`service-palette-button service-palette-button-${group.value}`}
              variant="outline"
              size="icon"
              type="button"
              draggable={!pending}
              disabled={pending}
              aria-label={`Add ${entry.label}`}
              aria-pressed={selected}
              title={`${entry.label}: drag to map or click to place`}
              onclick={() => handleSelect(entry)}
              ondragstart={(event) => handleDragStart(event, entry)}
            >
              <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
            </Button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  .service-palette {
    display: grid;
    gap: 0.6rem;
    padding: 0.7rem;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.8rem;
    background:
      linear-gradient(135deg, rgb(255 255 255 / 96%), rgb(250 250 250 / 96%)), var(--mobility-surface, #ffffff);
    box-shadow: 0 0.45rem 1.4rem rgb(16 24 32 / 10%);
  }

  .service-palette-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .service-palette-title,
  .service-palette-hint,
  .service-palette-group-label {
    margin: 0;
  }

  .service-palette-title {
    color: var(--mobility-text, #09090b);
    font-size: 0.7rem;
    font-weight: 850;
    letter-spacing: -0.015em;
  }

  .service-palette-hint {
    margin-top: 0.1rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.57rem;
    line-height: 1.25;
  }

  .service-palette-mark {
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border-radius: 50%;
    background: var(--mobility-text, #09090b);
    color: #ffffff;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1;
  }

  .service-palette-groups {
    display: grid;
    align-items: start;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .service-palette-group {
    display: grid;
    align-self: start;
    align-content: start;
    min-width: 0;
    gap: 0.3rem;
  }

  .service-palette-group-label {
    overflow: hidden;
    color: var(--mobility-muted, #71717a);
    font-size: 0.52rem;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .service-palette-items {
    display: grid;
    align-content: start;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 2.05rem;
    gap: 0.25rem;
  }

  :global(.service-palette-button) {
    width: 100%;
    height: 100%;
    min-width: 0;
    border-color: var(--palette-border, #d4d4d8);
    border-radius: 0.65rem;
    background: var(--palette-surface, #ffffff);
    color: var(--palette-color, #3f3f46);
    transition:
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease,
      transform 160ms ease;
  }

  :global(.service-palette-button:hover),
  :global(.service-palette-button[aria-pressed='true']) {
    border-color: var(--palette-color, #3f3f46);
    background: var(--palette-surface-strong, #f4f4f5);
    color: var(--palette-color, #3f3f46);
    transform: translateY(-1px);
  }

  :global(.service-palette-button:active) {
    transform: translateY(0);
  }

  :global(.service-palette-button:focus-visible) {
    box-shadow: 0 0 0 3px rgb(9 9 11 / 13%);
  }

  .service-palette-group-health {
    --palette-color: #ad4b52;
    --palette-border: #e8c5c8;
    --palette-surface: #fff8f8;
    --palette-surface-strong: #fff0f1;
  }

  .service-palette-group-education {
    --palette-color: #486995;
    --palette-border: #c8d5e7;
    --palette-surface: #f8faff;
    --palette-surface-strong: #edf2fb;
  }

  .service-palette-group-transport {
    --palette-color: #a46d32;
    --palette-border: #ead7ba;
    --palette-surface: #fffaf3;
    --palette-surface-strong: #fbf3e7;
  }

  @media (max-width: 520px) {
    .service-palette {
      padding: 0.6rem;
    }

    .service-palette-groups {
      gap: 0.3rem;
    }

    .service-palette-items {
      grid-auto-rows: 1.85rem;
    }

    :global(.service-palette-button) {
      border-radius: 0.55rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.service-palette-button) {
      transition: none;
    }
  }
</style>
