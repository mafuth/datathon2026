<script lang="ts">
  import type { IslandMapService, IslandServiceChange, ServiceDemandCategory } from './island-services';
  import type { ProposalTransportOperation, ProposalTransportPlan } from '$lib/mobility/proposal-transport';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';
  import type { Snippet } from 'svelte';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Redo2 from '@lucide/svelte/icons/redo-2';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import Undo2 from '@lucide/svelte/icons/undo-2';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Input } from '$components/ui/input';
  import { Skeleton } from '$components/ui/skeleton';
  import * as Tabs from '$components/ui/tabs';

  import ProposalTransportPlanner from './proposal-transport-planner.svelte';
  import ServicePalette from './service-palette.svelte';

  export type ProposalRecommendation = {
    accessibilityImprovementPercent: number;
    currentJourneyMinutes: number;
    recommendedJourneyMinutes: number;
    originalCapital: number;
    recommendedCapital: number;
    capitalSavings: number;
    originalAnnual: number;
    recommendedAnnual: number;
    annualSavings: number;
  };

  export type ProposalServiceFilter = 'all' | ServiceDemandCategory;

  type Props = {
    services: readonly IslandMapService[];
    mapControls?: Snippet;
    readOnly?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    onReset?: () => void;
    canReset?: boolean;
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
    selectedIslandId?: string;
    transportPlans?: readonly ProposalTransportPlan[];
    transportEditorOperation?: ProposalTransportOperation | null;
    builderTab?: 'services' | 'transport';
    onApplyTransport?: (operation: ProposalTransportOperation) => void | Promise<void>;
    onEditTransport?: (operationId: string) => void;
    onRemoveTransport?: (operationId: string) => void;
  };

  let {
    services,
    mapControls,
    readOnly = false,
    canUndo = false,
    canRedo = false,
    onUndo = () => {},
    onRedo = () => {},
    onReset = () => {},
    canReset = false,
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
    onCancelAdd = () => {},
    selectedIslandId = '',
    transportPlans = [],
    transportEditorOperation = null,
    builderTab = $bindable<'services' | 'transport'>('services'),
    onApplyTransport = () => {},
    onEditTransport = () => {},
    onRemoveTransport = () => {}
  }: Props = $props();

  let mappedServices = $derived(services.filter((service) => service.coordinates !== null));
  let visibleServices = $derived(
    mappedServices.filter((service) => {
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${service.name ?? ''} ${service.subtype} ${service.id}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (serviceFilter === 'all' || service.serviceType === serviceFilter);
    })
  );
  let addActive = $derived(activeSelection !== null);

  function serviceLabel(service: IslandMapService): string {
    return service.name ?? service.subtype.replaceAll('_', ' ');
  }

  function changeLabel(change: IslandServiceChange | undefined): string | null {
    if (change === 'added') return 'Added';
    if (change === 'upgraded') return 'Upgraded';
    if (change === 'downgraded') return 'Downgraded';
    if (change === 'moved') return 'Moved';
    return null;
  }
</script>

<Card.Root class="proposal-workspace" aria-label="Proposal builder" aria-busy={pending}>
  <Card.Header class="proposal-header">
    <div class="proposal-heading">
      <div>
        <Card.Title class="proposal-title">Draft proposal</Card.Title>
        <Card.Description>Plan the changes for this island.</Card.Description>
      </div>
    </div>
    {@render mapControls?.()}
  </Card.Header>

  <Card.Content class="proposal-content">
    <Tabs.Root bind:value={builderTab} class="proposal-builder-tabs">
      <Tabs.List aria-label="Proposal builder section">
        <Tabs.Trigger value="services">Services</Tabs.Trigger>
        <Tabs.Trigger value="transport" data-presentation-target="proposal-transport-tab">Transport</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    <div class="proposal-history" role="group" aria-label="Proposal history">
      <Button
        class="proposal-history-button"
        variant="outline"
        size="sm"
        disabled={pending || readOnly || !canUndo}
        onclick={onUndo}><Undo2 data-icon="inline-start" />Undo</Button
      >
      <Button
        class="proposal-history-button"
        variant="outline"
        size="sm"
        disabled={pending || readOnly || !canRedo}
        onclick={onRedo}><Redo2 data-icon="inline-start" />Redo</Button
      >
      <Button
        class="proposal-reset-button"
        variant="destructive"
        size="sm"
        disabled={pending || readOnly || !canReset}
        onclick={onReset}><RotateCcw data-icon="inline-start" />Reset</Button
      >
    </div>

    {#if pending}<div class="proposal-loading" role="status" aria-label="Updating proposal">
        <Skeleton class="proposal-loading-line" /><Skeleton class="proposal-loading-line proposal-loading-line-short" />
      </div>{/if}
    {#if error}<p class="proposal-error" role="alert">{error}</p>{/if}
    {#if message && !error}<p class="proposal-status" role="status">{message}</p>{/if}

    {#if builderTab === 'transport'}
      <section class="proposal-section" aria-labelledby="transport-heading">
        <div class="section-heading">
          <div>
            <h3 id="transport-heading">Transport routes</h3>
            <p>Plan a bus route or ferry connection.</p>
          </div>
          {#if transportPlans.length}<Badge variant="secondary">{transportPlans.length}</Badge>{/if}
        </div>
        <ProposalTransportPlanner
          {selectedIslandId}
          pending={pending || readOnly}
          initialOperation={transportEditorOperation}
          {onApplyTransport}
        />
      </section>

      {#if transportPlans.length}
        <section class="proposal-section route-list" aria-labelledby="route-list-heading">
          <div class="section-heading">
            <h3 id="route-list-heading">Routes in proposal</h3>
            <Badge variant="secondary">{transportPlans.length}</Badge>
          </div>
          {#each transportPlans as plan (plan.operationId)}
            <article class="route-row">
              <div class="route-copy">
                <Badge variant="outline">{plan.mode === 'ferry' ? 'Ferry' : 'Bus'}</Badge><strong>{plan.label}</strong
                ><span>{plan.distanceKm.toFixed(1)} km · every {plan.headwayMinutes} min</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || readOnly}
                onclick={() => onEditTransport(plan.operationId)}>Edit</Button
              >
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || readOnly}
                onclick={() => onRemoveTransport(plan.operationId)}>Remove</Button
              >
            </article>
          {/each}
        </section>
      {/if}
    {:else}
      <section class="proposal-section" aria-label="Services">
        <ServicePalette pending={pending || readOnly} {activeSelection} {onStartAddService} />

        {#if addActive}<div class="mode-banner" role="status">
            Place {addServiceLabel ?? 'the new service'} on the map.<Button
              variant="ghost"
              size="sm"
              onclick={onCancelAdd}>Cancel</Button
            >
          </div>{/if}
        {#if moveActive}<div class="mode-banner" role="status">
            Move mode is active.<Button variant="ghost" size="sm" onclick={onCancelMove}>Cancel</Button>
          </div>{/if}

        <div class="service-search">
          <Search aria-hidden="true" /><Input
            bind:value={query}
            placeholder="Search services"
            aria-label="Search services"
          />
        </div>
        <Tabs.Root bind:value={serviceFilter} class="proposal-filter-tabs">
          <Tabs.List aria-label="Filter services">
            <Tabs.Trigger value="all">All</Tabs.Trigger><Tabs.Trigger value="health">Health</Tabs.Trigger><Tabs.Trigger
              value="education">Education</Tabs.Trigger
            ><Tabs.Trigger value="transport">Transport</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        {#if visibleServices.length === 0}<p class="empty-state">No services match this search.</p>{:else}
          <ul class="service-list" aria-label="Services on selected island">
            {#each visibleServices as service (service.id)}
              {@const change = changeLabel(service.change)}
              {@const Icon =
                service.serviceType === 'health' ? Hospital : service.serviceType === 'education' ? School : Route}
              <li>
                <Button
                  variant="ghost"
                  class={`service-row service-row-${service.serviceType}`}
                  aria-label={`Show ${serviceLabel(service)} on the map`}
                  onclick={() => onSelectService(service)}
                  ><span class="service-icon"><Icon aria-hidden="true" /></span><span class="service-copy"
                    ><strong>{serviceLabel(service)}</strong><span>{service.subtype.replaceAll('_', ' ')}</span></span
                  >{#if change}<Badge variant="outline">{change}</Badge>{/if}</Button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.proposal-workspace) {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    min-height: 0;
    max-height: 100%;
    flex-direction: column;
    overflow: hidden;
    border-color: var(--border);
    border-radius: 0.55rem;
    background: var(--card);
    color: var(--card-foreground);
    box-shadow: 0 0.7rem 2.2rem rgb(24 24 27 / 10%);
  }
  :global(.proposal-header),
  :global(.proposal-content) {
    min-width: 0;
  }
  :global(.proposal-workspace) {
    color-scheme: light;
  }
  :global(.proposal-workspace [data-slot='tabs-list']) {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    background: var(--muted);
  }
  :global(.proposal-workspace [data-slot='tabs-trigger']) {
    min-width: 0;
  }
  :global(.proposal-workspace .proposal-section [data-slot='tabs-list']) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  :global(.proposal-header) {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }
  .proposal-heading,
  .section-heading,
  .proposal-history,
  .mode-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .proposal-heading,
  .section-heading {
    justify-content: space-between;
  }
  .proposal-heading :global([data-slot='card-title']) {
    font-size: 1.45rem;
    font-weight: 800;
    letter-spacing: -0.045em;
  }
  .proposal-heading :global([data-slot='card-description']),
  .section-heading p,
  .route-copy span,
  .service-copy span,
  .proposal-status {
    color: var(--muted-foreground);
    font-size: 0.68rem;
  }
  :global(.proposal-content) {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 1rem;
    overflow: auto;
    padding: 0 1rem 1rem;
  }
  .proposal-history {
    border-block: 1px solid var(--mobility-border, #e4e4e7);
    padding: 0.5rem 0;
  }
  .proposal-history :global(.proposal-history-button) {
    border-color: var(--input);
    background: var(--card);
    color: var(--foreground);
  }
  .proposal-history :global(.proposal-history-button:hover:not(:disabled)) {
    border-color: var(--ring);
    background: var(--muted);
    color: var(--foreground);
  }
  .proposal-history :global(.proposal-reset-button) {
    margin-left: auto;
    border-color: var(--destructive);
    background: var(--destructive);
    color: var(--destructive-foreground);
  }
  .proposal-history :global(.proposal-reset-button:hover:not(:disabled)) {
    background: color-mix(in srgb, var(--destructive) 85%, black);
    color: var(--destructive-foreground);
  }
  .proposal-history :global(button:last-child) {
    margin-left: auto;
  }
  .proposal-status,
  .proposal-error {
    margin: 0;
  }
  .proposal-error {
    color: var(--destructive);
    font-size: 0.7rem;
  }
  .proposal-loading {
    display: grid;
    gap: 0.35rem;
    padding: 0.35rem 0;
  }
  :global(.proposal-loading-line) {
    height: 0.55rem;
    width: 70%;
  }
  :global(.proposal-loading-line-short) {
    width: 38%;
  }
  .proposal-section {
    display: grid;
    gap: 0.75rem;
  }
  .section-heading h3 {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 750;
  }
  .section-heading p {
    margin: 0.15rem 0 0;
  }
  .service-search {
    position: relative;
  }
  .service-search > :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.65rem;
    width: 0.9rem;
    height: 0.9rem;
    transform: translateY(-50%);
    color: var(--mobility-muted, #71717a);
    pointer-events: none;
  }
  .service-search :global(input) {
    border-color: var(--input);
    background: var(--card);
    color: var(--foreground);
    padding-left: 2rem;
  }
  .service-search :global(input)::placeholder {
    color: var(--muted-foreground);
  }
  .service-search :global(input:focus-visible) {
    border-color: var(--ring);
    background: var(--card);
  }
  :global(.proposal-builder-tabs [data-slot='tabs-trigger'][data-state='active']),
  :global(.proposal-filter-tabs [data-slot='tabs-trigger'][data-state='active']) {
    border-color: var(--border);
    background: var(--card);
    color: var(--foreground);
    box-shadow: 0 1px 2px rgb(24 24 27 / 10%);
  }
  :global(.proposal-builder-tabs [data-slot='tabs-trigger']),
  :global(.proposal-filter-tabs [data-slot='tabs-trigger']) {
    color: var(--muted-foreground);
  }
  :global(.proposal-builder-tabs [data-slot='tabs-trigger']:hover),
  :global(.proposal-filter-tabs [data-slot='tabs-trigger']:hover) {
    color: var(--foreground);
  }
  .service-list {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  :global(.service-row) {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: flex-start;
    gap: 0.6rem;
    padding: 0.5rem 0.25rem;
    text-align: left;
    border: 1px solid transparent;
    border-bottom-color: var(--border);
    border-radius: 0.45rem;
  }
  :global(.service-row:hover) {
    background: var(--muted);
    color: var(--foreground);
  }
  :global(.service-row:focus-visible) {
    border-color: var(--ring);
    background: var(--card);
  }
  .service-icon {
    display: grid;
    width: 1.8rem;
    height: 1.8rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.35rem;
    background: var(--muted);
    color: var(--foreground);
  }
  :global(.service-row-health) .service-icon {
    color: #a33f4c;
    background: #fff1f2;
  }
  :global(.service-row-education) .service-icon {
    color: #3f5f91;
    background: #eff6ff;
  }
  :global(.service-row-transport) .service-icon {
    color: #9a641e;
    background: #fff7ed;
  }
  .service-copy,
  .route-copy {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
  }
  .service-copy {
    flex: 1;
  }
  .service-copy strong,
  .service-copy span,
  .route-copy strong,
  .route-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .service-copy strong,
  .route-copy strong {
    font-size: 0.72rem;
  }
  .empty-state {
    margin: 0;
    padding: 1rem 0;
    color: var(--muted-foreground);
    font-size: 0.72rem;
    text-align: center;
  }
  .mode-banner {
    justify-content: space-between;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.65rem;
    color: var(--muted-foreground);
    font-size: 0.68rem;
  }
  .route-list {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }
  .route-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.35rem;
    border-bottom: 1px solid var(--border);
    padding: 0.6rem 0;
  }
  .route-copy :global([data-slot='badge']) {
    width: fit-content;
    font-size: 0.58rem;
  }
  @media (max-width: 64rem) {
    :global(.proposal-workspace) {
      grid-row: 2;
    }
  }
  @media (max-width: 32rem) {
    .route-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .route-row :global(button:last-child) {
      grid-column: 2;
    }
  }
</style>
