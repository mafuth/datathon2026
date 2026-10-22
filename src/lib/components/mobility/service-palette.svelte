<script lang="ts">
  import type { AddableServiceSubtype, AddServiceSelection, ServiceCatalogEntry } from '$lib/mobility/service-catalog';

  import { SERVICE_CATALOG, SERVICE_DRAG_MIME, SERVICE_TYPE_OPTIONS } from '$lib/mobility/service-catalog';
  import { serviceAppearance } from '$lib/mobility/service-icons';

  import { Button } from '$components/ui/button';

  type Props = {
    pending?: boolean;
    activeSelection?: AddServiceSelection | null;
    onStartAddService?: (selection: AddServiceSelection) => void;
  };

  let { pending = false, activeSelection = null, onStartAddService = () => {} }: Props = $props();
  let draggingSubtype = $state<AddableServiceSubtype | null>(null);
  let suppressPlacementClickUntil = 0;

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
    if (pending || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(selectionFor(entry)));
    event.dataTransfer.setData('text/plain', entry.label);
    const source = event.currentTarget as HTMLButtonElement;
    const bounds = source.getBoundingClientRect();
    event.dataTransfer.setDragImage(source, bounds.width / 2, bounds.height / 2);
    draggingSubtype = entry.subtype;
    suppressPlacementClickUntil = Date.now() + 500;
  }

  function handleDragEnd(): void {
    draggingSubtype = null;
    suppressPlacementClickUntil = Date.now() + 350;
  }

  function handleSelect(event: MouseEvent, entry: ServiceCatalogEntry): void {
    if (event.detail !== 0 && Date.now() < suppressPlacementClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!pending) onStartAddService(selectionFor(entry));
  }
</script>

<section class="service-palette" aria-label="Add a service to the proposal">
  <div class="service-palette-heading">
    <div>
      <p class="service-palette-title">Service library</p>
      <p class="service-palette-hint">Drag to the map, or select and choose a location</p>
    </div>
    <span class="service-palette-mark" aria-hidden="true">+</span>
  </div>

  <div class="service-palette-groups">
    {#each paletteGroups as group (group.value)}
      <div class={`service-palette-group service-palette-group-${group.value}`}>
        <p class="service-palette-group-label">{group.label}</p>
        <div class="service-palette-items">
          {#each group.entries as entry (entry.subtype)}
            {@const { Icon } = serviceAppearance(entry.serviceType, entry.subtype)}
            {@const selected = activeSelection?.subtype === entry.subtype}
            <Button
              class={`service-palette-button service-palette-button-${group.value}`}
              variant="outline"
              size="icon"
              type="button"
              draggable={!pending}
              data-dragging={draggingSubtype === entry.subtype}
              data-service-subtype={entry.subtype}
              disabled={pending}
              aria-label={`Add ${entry.label}`}
              aria-pressed={selected}
              title={`${entry.label}: drag to map or click to place`}
              onclick={(event) => handleSelect(event, entry)}
              ondragstart={(event) => handleDragStart(event, entry)}
              ondragend={handleDragEnd}
            >
              <Icon strokeWidth={1.8} aria-hidden="true" />
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
    gap: 0.75rem;
    padding: 0.8rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.015em;
  }

  .service-palette-hint {
    margin-top: 0.1rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }

  .service-palette-mark {
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    place-items: center;
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-normal);
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
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .service-palette-items {
    display: grid;
    align-content: start;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 2.25rem;
    gap: 0.25rem;
  }

  :global(.service-palette-button) {
    width: 100%;
    height: 100%;
    min-width: 0;
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--palette-color, var(--mobility-ink));
    cursor: grab;
    touch-action: manipulation;
    translate: none;
  }

  :global(.service-palette-button[aria-pressed='true']) {
    border-color: var(--mobility-accent);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
    box-shadow: inset 0 0 0 1px var(--mobility-accent);
  }

  :global(.service-palette-button:active) {
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
    cursor: grabbing;
  }

  :global(.service-palette-button:focus-visible) {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 2px;
    box-shadow: none;
  }

  :global(.service-palette-button[data-dragging='true']) {
    opacity: 0.55;
    cursor: grabbing;
  }

  :global(.service-palette-button:disabled) {
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.service-palette-button:not(:disabled):hover) {
      border-color: var(--mobility-accent);
      background: var(--mobility-accent-soft);
      color: var(--mobility-accent);
    }
  }

  .service-palette-group-health {
    --palette-color: var(--mobility-chart-health);
  }

  .service-palette-group-education {
    --palette-color: var(--mobility-chart-education);
  }

  .service-palette-group-transport {
    --palette-color: var(--mobility-chart-transport);
  }

  @media (max-width: 520px) {
    .service-palette {
      padding: 0.6rem;
    }

    .service-palette-groups {
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }

    .service-palette-group {
      grid-template-columns: 3.5rem minmax(0, 1fr);
      align-items: start;
      gap: 0.4rem;
    }

    .service-palette-group + .service-palette-group {
      padding-top: 0.6rem;
      border-top: 1px solid var(--mobility-border);
    }

    .service-palette-group-label {
      display: flex;
      align-items: center;
      min-height: 2.5rem;
      white-space: normal;
    }

    .service-palette-items {
      width: 100%;
      max-width: 12rem;
      grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr));
      grid-auto-rows: 2.5rem;
    }

    :global(.service-palette-button) {
      min-width: 2.5rem;
      min-height: 2.5rem;
      border-radius: var(--mobility-radius-control);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.service-palette-button) {
      transition: none;
    }
  }
</style>
