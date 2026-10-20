<script lang="ts">
  import type { IslandMapService, IslandServiceChange, ServiceDemandCategory } from './island-services';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Input } from '$components/ui/input';
  import * as Tabs from '$components/ui/tabs';

  import ServicePalette from './service-palette.svelte';

  export type ProposalServiceFilter = 'all' | ServiceDemandCategory;

  type Props = {
    services: readonly IslandMapService[];
    query?: string;
    serviceFilter?: ProposalServiceFilter;
    pending?: boolean;
    moveActive?: boolean;
    error?: string | null;
    message?: string | null;
    onCancelMove?: () => void;
    onSelectService?: (service: IslandMapService) => void;
    activeSelection?: AddServiceSelection | null;
    addServiceLabel?: string | null;
    onStartAddService?: (selection: AddServiceSelection) => void;
    onCancelAdd?: () => void;
  };

  let {
    services,
    query = $bindable(''),
    serviceFilter = $bindable<ProposalServiceFilter>('all'),
    pending = false,
    moveActive = false,
    error = null,
    message = null,
    onCancelMove = () => {},
    onSelectService = () => {},
    activeSelection = null,
    addServiceLabel = null,
    onStartAddService = () => {},
    onCancelAdd = () => {}
  }: Props = $props();

  let addActive = $derived(activeSelection !== null);

  let visibleServices = $derived(
    services.filter((service) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${service.name ?? ''} ${service.subtype} ${service.id}`.toLowerCase().includes(normalizedQuery);
      const matchesType = serviceFilter === 'all' || service.serviceType === serviceFilter;
      return matchesQuery && matchesType;
    })
  );

  function serviceLabel(service: IslandMapService): string {
    return service.name ?? service.subtype.replaceAll('_', ' ');
  }

  function changeLabel(change: IslandServiceChange | undefined): string | null {
    if (change === 'added') return 'Added';
    if (change === 'upgraded') return 'Upgraded';
    if (change === 'moved') return 'Moved';
    return null;
  }
</script>

<Card.Root class="proposal-builder-panel" aria-label="Proposal builder" aria-busy={pending}>
  <Card.Content class="proposal-builder-content">
    <div class="proposal-builder-title-row">
      <h2>Draft proposal</h2>
    </div>

    <ServicePalette {pending} {activeSelection} {onStartAddService} />

    {#if addActive}
      <div class="proposal-placement-mode" role="status" aria-live="polite">
        <span>Drag a service onto the map, or click the map to place {addServiceLabel ?? 'the new service'}.</span>
        <Button variant="ghost" size="sm" onclick={onCancelAdd}>Cancel</Button>
      </div>
    {/if}

    <div class="proposal-search">
      <div class="proposal-search-field">
        <Search aria-hidden="true" />
        <Input
          id="proposal-service-search"
          bind:value={query}
          placeholder="Search name, type, or ID"
          autocomplete="off"
          aria-label="Search services on this island"
        />
      </div>
    </div>

    <div class="proposal-filter-group">
      <Tabs.Root bind:value={serviceFilter} class="proposal-type-tabs">
        <Tabs.List aria-label="Filter services by type">
          <Tabs.Trigger value="all">All</Tabs.Trigger>
          <Tabs.Trigger value="health">Health</Tabs.Trigger>
          <Tabs.Trigger value="education">Education</Tabs.Trigger>
          <Tabs.Trigger value="transport">Transport</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
    </div>

    {#if moveActive}
      <div class="proposal-move-mode" role="status" aria-live="polite">
        <span>Move mode is on. Click inside the island to place the service.</span>
        <Button variant="ghost" size="sm" onclick={onCancelMove}>Cancel</Button>
      </div>
    {/if}

    {#if error}
      <p class="proposal-builder-error" role="alert">{error}</p>
    {/if}

    {#if message && !error}
      <p class="proposal-builder-message" role="status">{message}</p>
    {/if}

    <div class="proposal-builder-summary">
      <span>{visibleServices.length} of {services.length} services</span>
    </div>

    {#if visibleServices.length === 0}
      <p class="proposal-builder-empty">No services match these filters.</p>
    {:else}
      <ul class="proposal-service-list" aria-label="Services on selected island">
        {#each visibleServices as service (service.id)}
          {@const change = changeLabel(service.change)}
          {@const Icon =
            service.serviceType === 'health' ? Hospital : service.serviceType === 'education' ? School : Route}
          <li>
            <Button
              class="proposal-service-row"
              variant="ghost"
              type="button"
              aria-label={`Show ${serviceLabel(service)} on the map`}
              onclick={() => onSelectService(service)}
            >
              <span class={`proposal-service-icon proposal-service-icon-${service.serviceType}`} aria-hidden="true">
                <Icon size={15} strokeWidth={2.2} />
              </span>
              <span class="proposal-service-copy">
                <strong>{serviceLabel(service)}</strong>
                <span>{service.subtype.replaceAll('_', ' ')}</span>
              </span>
              {#if change}<Badge variant="outline">{change}</Badge>{/if}
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.proposal-builder-panel) {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 20;
    width: min(22rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: hidden;
    border-color: #09090b;
    background: #ffffff;
    color: #09090b;
    box-shadow: 0 0.75rem 2rem rgb(16 24 32 / 18%);
  }

  .proposal-filter-label {
    color: #71717a;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  :global(.proposal-builder-content) {
    display: grid;
    gap: 0.8rem;
    min-height: 0;
    overflow: auto;
    padding: 0.85rem 1rem;
  }

  .proposal-search {
    display: grid;
    gap: 0.35rem;
  }

  .proposal-search label {
    color: #52525b;
    font-size: 0.65rem;
    font-weight: 750;
  }

  .proposal-search-field {
    position: relative;
  }

  .proposal-search-field > :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.65rem;
    width: 0.9rem;
    height: 0.9rem;
    color: #71717a;
    transform: translateY(-50%);
    pointer-events: none;
  }

  :global(.proposal-search-field input) {
    height: 2.15rem;
    padding-left: 2rem;
    border-color: #d4d4d8;
    font-size: 0.68rem;
  }

  .proposal-filter-group {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.2rem;
  }

  :global(.proposal-type-tabs) {
    margin-top: 0.15rem;
  }

  :global(.proposal-type-tabs [data-slot='tabs-list']) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: 100%;
    min-height: 2rem;
    background: #f4f4f5;
  }

  :global(.proposal-type-tabs [data-slot='tabs-trigger']) {
    min-width: 0;
    padding: 0.3rem 0.15rem;
    color: #52525b;
    font-size: 0.58rem;
  }

  :global(.proposal-type-tabs [data-slot='tabs-trigger'][data-state='active']) {
    color: #09090b;
  }

  .proposal-move-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.45rem;
    background: #f4f4f5;
    color: #09090b;
    font-size: 0.64rem;
    font-weight: 650;
    line-height: 1.25;
  }

  .proposal-move-mode :global(button) {
    flex: 0 0 auto;
    height: 1.8rem;
    padding-inline: 0.5rem;
    font-size: 0.6rem;
  }

  .proposal-builder-error {
    margin: 0;
    padding: 0.55rem 0.6rem;
    border: 1px solid #e8b4ae;
    border-radius: 0.45rem;
    color: #a42318;
    font-size: 0.64rem;
    line-height: 1.3;
  }

  .proposal-builder-message {
    margin: 0;
    color: #09090b;
    font-size: 0.64rem;
    font-weight: 700;
    line-height: 1.3;
  }

  .proposal-builder-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: #52525b;
    font-size: 0.62rem;
  }

  .proposal-builder-empty {
    margin: 0;
    padding: 1rem 0.4rem;
    color: #52525b;
    font-size: 0.68rem;
    text-align: center;
  }

  .proposal-service-list {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .proposal-service-list li {
    min-width: 0;
  }

  .proposal-service-copy {
    display: grid;
    min-width: 0;
    flex: 1 1 auto;
    gap: 0.1rem;
  }

  .proposal-service-copy strong,
  .proposal-service-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proposal-service-copy strong {
    color: #09090b;
    font-size: 0.68rem;
  }

  .proposal-service-copy span {
    color: #71717a;
    font-size: 0.58rem;
    text-transform: capitalize;
  }

  .proposal-service-list :global([data-slot='badge']) {
    flex: 0 0 auto;
    font-size: 0.52rem;
  }

  :global(.proposal-service-row) {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-height: 3.1rem;
    min-width: 0;
    padding: 0.45rem 0.5rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.45rem;
    background: #fafafa;
    color: inherit;
    text-align: left;
  }

  @media (max-width: 640px) {
    :global(.proposal-builder-panel) {
      top: 0.75rem;
      left: 0.75rem;
      width: calc(100vw - 1.5rem);
      max-height: calc(100dvh - 1.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .proposal-builder-panel :global(*) {
      scroll-behavior: auto;
    }
  }

  :global(.proposal-builder-panel) {
    display: flex;
    flex-direction: column;
    border-color: var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.75rem;
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
    box-shadow: 0 0.8rem 2rem rgb(16 24 32 / 12%);
  }

  .proposal-builder-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex: 0 0 auto;
    padding: 0.1rem 0 1.15rem;
  }

  .proposal-builder-title-row h2 {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 1.5rem;
    font-weight: 850;
    letter-spacing: -0.035em;
    line-height: 1.05;
  }

  .proposal-placement-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.6rem;
    border: 1px solid #c4d9cc;
    border-radius: 0.5rem;
    background: #f0f8f3;
    color: #315d4c;
    font-size: 0.64rem;
    font-weight: 650;
    line-height: 1.25;
  }

  .proposal-placement-mode :global(button) {
    flex: 0 0 auto;
    height: 1.8rem;
    padding-inline: 0.5rem;
    color: #315d4c;
    font-size: 0.6rem;
  }

  :global(.proposal-builder-content) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0.8rem 1rem;
  }

  .proposal-search {
    gap: 0.5rem;
  }

  .proposal-search label,
  .proposal-filter-label {
    color: var(--mobility-muted, #71717a);
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .proposal-search label {
    font-size: 0.7rem;
  }

  :global(.proposal-search-field input) {
    height: 2.45rem;
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
    font-size: 0.72rem;
  }

  :global(.proposal-search-field input:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0 0 3px rgb(9 9 11 / 15%);
  }

  :global(.proposal-type-tabs [data-slot='tabs-list']) {
    min-height: 2.25rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface-soft, #f4f4f5);
  }

  :global(.proposal-type-tabs [data-slot='tabs-trigger']) {
    padding-block: 0.42rem;
  }

  :global(.proposal-type-tabs [data-slot='tabs-trigger'][data-state='active']) {
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 1px 2px rgb(16 24 32 / 8%);
  }

  .proposal-move-mode {
    border-color: #d4d4d8;
    background: #f4f4f5;
    color: var(--mobility-accent, #09090b);
  }

  .proposal-builder-summary {
    justify-content: flex-start;
    padding-top: 0;
    color: var(--mobility-muted, #71717a);
  }

  .proposal-service-list {
    flex: 1 1 auto;
    gap: 0.55rem;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.2rem;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .proposal-service-list li {
    min-width: 0;
  }

  :global(.proposal-service-row) {
    gap: 0.6rem;
    min-height: 3.1rem;
    padding: 0.5rem 0.6rem;
    border-color: var(--mobility-border, #e4e4e7);
    border-radius: 0.55rem;
    background: var(--mobility-surface, #ffffff);
  }

  :global(.proposal-service-row:hover) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
  }

  .proposal-service-icon {
    display: grid;
    width: 1.9rem;
    height: 1.9rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.5rem;
  }

  .proposal-service-icon-health {
    background: #fff0f1;
    color: #ad4b52;
  }

  .proposal-service-icon-education {
    background: #edf2fb;
    color: #486995;
  }

  .proposal-service-icon-transport {
    background: #fbf3e7;
    color: #a46d32;
  }

  .proposal-service-copy strong {
    color: var(--mobility-text, #09090b);
    font-size: 0.7rem;
    font-weight: 750;
  }

  .proposal-service-copy span {
    color: var(--mobility-muted, #71717a);
  }

  .proposal-service-list :global([data-slot='badge']) {
    border-color: #d4d4d8;
    background: #f4f4f5;
    color: #3f3f46;
  }
</style>
