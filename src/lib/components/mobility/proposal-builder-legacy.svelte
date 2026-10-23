<script lang="ts">
  import type { IslandMapService, IslandServiceChange, ServiceDemandCategory } from './island-services';
  import type { ProposalTransportOperation, ProposalTransportPlan } from '$lib/mobility/proposal-transport';
  import type { ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';
  import type { Snippet } from 'svelte';

  import Hospital from '@lucide/svelte/icons/hospital';
  import Redo2 from '@lucide/svelte/icons/redo-2';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import Undo2 from '@lucide/svelte/icons/undo-2';

  import { formatProposalMoney } from '$lib/mobility/proposal-planning';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Input } from '$components/ui/input';
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
    storageMessage?: string | null;
    restoreBlocked?: boolean;
    onRetryRestore?: () => void;
    onStartFresh?: () => void;
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
    onPreviewTransport?: (operation: ProposalTransportOperation) => void | Promise<void>;
    stagedTransportPreview?: ScenarioPreviewResponse | null;
    onConfirmTransport?: () => void | Promise<void>;
    onCancelTransport?: () => void;
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
    storageMessage = null,
    restoreBlocked = false,
    onRetryRestore = () => {},
    onStartFresh = () => {},
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
    onPreviewTransport = () => {},
    stagedTransportPreview = null,
    onConfirmTransport = () => {},
    onCancelTransport = () => {},
    onEditTransport = () => {},
    onRemoveTransport = () => {}
  }: Props = $props();

  let addActive = $derived(activeSelection !== null);
  let mappedServices = $derived(services.filter((service) => service.coordinates !== null));

  let visibleServices = $derived(
    mappedServices.filter((service) => {
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
    if (change === 'downgraded') return 'Downgraded';
    if (change === 'moved') return 'Moved';
    return null;
  }
</script>

<Card.Root class="proposal-builder-panel" aria-label="Proposal builder" aria-busy={pending}>
  <Card.Content class="proposal-builder-content">
    <div class="proposal-builder-title-row">
      <h2>Draft proposal</h2>
    </div>

    {@render mapControls?.()}

    <Tabs.Root bind:value={builderTab} class="proposal-builder-tabs">
      <Tabs.List aria-label="Proposal builder section">
        <Tabs.Trigger value="services">Services</Tabs.Trigger>
        <Tabs.Trigger value="transport">Transport routes</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    <div class="proposal-history-actions" role="group" aria-label="Draft operation history">
      <Button
        class="proposal-history-button"
        variant="outline"
        disabled={pending || readOnly || !canUndo}
        onclick={onUndo}
        aria-label="Undo last change"
        title="Undo last change"
      >
        <Undo2 aria-hidden="true" />
        <span>Undo</span>
      </Button>
      <Button
        class="proposal-history-button"
        variant="outline"
        disabled={pending || readOnly || !canRedo}
        onclick={onRedo}
        aria-label="Redo last change"
        title="Redo last change"
      >
        <Redo2 aria-hidden="true" />
        <span>Redo</span>
      </Button>
      <Button
        class="proposal-reset-button"
        variant="outline"
        disabled={pending || readOnly || !canReset}
        onclick={onReset}
        aria-label="Reset draft proposal"
        title="Reset draft proposal"
      >
        <RotateCcw aria-hidden="true" />
        <span>Reset draft</span>
      </Button>
    </div>
    {#if storageMessage}<p class="proposal-builder-message" role="status">{storageMessage}</p>{/if}
    {#if pending}<p class="proposal-builder-message" role="status">Loading server preview…</p>{/if}
    {#if error}
      <p class="proposal-builder-error" role="alert">{error}</p>
      {#if !restoreBlocked}
        <Button variant="outline" size="sm" disabled={pending} onclick={onRetryRestore}>Reload draft</Button>
      {/if}
    {/if}
    {#if restoreBlocked}
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onclick={onRetryRestore}>Retry restore</Button>
        <Button variant="outline" size="sm" disabled={pending} onclick={onStartFresh}>Replace saved draft</Button>
      </div>
    {/if}

    {#if builderTab === 'transport'}
      <ProposalTransportPlanner
        {selectedIslandId}
        pending={pending || readOnly}
        initialOperation={transportEditorOperation}
        {onPreviewTransport}
      />
      {#if stagedTransportPreview}
        <section class="proposal-transport-confirmation" aria-live="polite">
          <div>
            <strong>Review transport change</strong>
            <span>The route is staged and has not changed the proposal yet.</span>
          </div>
          <dl>
            <div>
              <dt>Upfront</dt>
              <dd>{formatProposalMoney(stagedTransportPreview.costs.capital)}</dd>
            </div>
            <div>
              <dt>Annual</dt>
              <dd>{formatProposalMoney(stagedTransportPreview.costs.annual)}</dd>
            </div>
          </dl>
          <div class="proposal-transport-confirmation-actions">
            <Button variant="ghost" size="sm" onclick={onCancelTransport}>Cancel</Button>
            <Button size="sm" onclick={() => void onConfirmTransport()}>Confirm transport change</Button>
          </div>
        </section>
      {/if}
      {#if transportPlans.length}
        <section class="proposal-transport-list" aria-label="Proposed transport routes">
          <div class="proposal-transport-list-heading">
            <h3>Routes in this proposal</h3>
            <Badge variant="secondary">{transportPlans.length}</Badge>
          </div>
          {#each transportPlans as plan (plan.operationId)}
            <article>
              <div>
                <Badge variant="outline">{plan.mode === 'ferry' ? 'Ferry' : 'Bus'}</Badge>
                <strong>{plan.label}</strong>
                <span>{plan.distanceKm.toFixed(1)} km · {plan.headwayMinutes} min interval</span>
              </div>
              <Button
                disabled={pending || readOnly}
                variant="ghost"
                size="sm"
                onclick={() => onEditTransport(plan.operationId)}>Edit</Button
              >
              <Button
                disabled={pending || readOnly}
                variant="ghost"
                size="sm"
                onclick={() => onRemoveTransport(plan.operationId)}>Remove</Button
              >
            </article>
          {/each}
        </section>
      {/if}
    {:else}
      <ServicePalette pending={pending || readOnly} {activeSelection} {onStartAddService} />

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
        <p class="proposal-filter-label">Service list filters</p>
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

      {#if message && !error}
        <p class="proposal-builder-message" role="status">{message}</p>
      {/if}

      <div class="proposal-builder-summary">
        <span>{visibleServices.length} of {mappedServices.length} services</span>
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
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.proposal-builder-panel) {
    grid-column: 1;
    color-scheme: light;
    grid-row: 1;
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --border: 240 5.9% 90%;
    width: 100%;
    min-height: 0;
    max-height: 100%;
    overflow: hidden;
    border-color: #09090b;
    background: #ffffff;
    color: #09090b;
    box-shadow: 0 0.75rem 2rem rgb(16 24 32 / 18%);
  }

  :global(.proposal-builder-tabs [data-slot='tabs-list']) {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .proposal-transport-list {
    display: grid;
    gap: 0.5rem;
  }

  .proposal-transport-list-heading,
  .proposal-transport-confirmation-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .proposal-transport-list h3 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 850;
  }

  .proposal-transport-list article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--mobility-border, #e4e4e7);
  }

  .proposal-transport-list article > div {
    display: grid;
    min-width: 0;
  }

  .proposal-transport-list strong,
  .proposal-transport-list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proposal-transport-confirmation {
    display: grid;
    gap: 0.65rem;
    padding: 0.75rem 0;
    border-block: 1px solid var(--mobility-border, #e4e4e7);
  }

  .proposal-transport-confirmation > div:first-child {
    display: grid;
    gap: 0.15rem;
  }

  .proposal-transport-confirmation > div:first-child span,
  .proposal-transport-confirmation dt {
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
  }

  .proposal-transport-confirmation dl {
    display: flex;
    gap: 1.25rem;
    margin: 0;
  }

  .proposal-transport-confirmation dl div {
    display: grid;
    gap: 0.1rem;
  }

  .proposal-transport-confirmation dd {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 750;
  }

  .proposal-transport-list span {
    color: #71717a;
    font-size: 0.65rem;
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
    padding: 0.1rem 0 0.25rem;
  }

  .proposal-builder-title-row h2 {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 1.7rem;
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 1.05;
  }

  .proposal-history-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .proposal-history-button {
    width: 100%;
    justify-content: center;
    gap: 0.4rem;
    border-color: #d4d4d8;
    background: #ffffff;
    color: #09090b;
  }

  .proposal-history-button:hover:not(:disabled) {
    background: #f4f4f5;
  }

  :global(.proposal-reset-button) {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    justify-content: center !important;
    gap: 0.4rem;
    border-color: #fca5a5 !important;
    background: #fef2f2 !important;
    color: #b91c1c !important;
  }

  :global(.proposal-reset-button:hover:not(:disabled)) {
    border-color: #ef4444 !important;
    background: #fee2e2 !important;
    color: #991b1b !important;
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
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.8rem 1rem;
  }

  .proposal-search {
    gap: 0.5rem;
  }

  .proposal-filter-label {
    color: var(--mobility-muted, #71717a);
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  :global(.proposal-builder-content) > :global(*) {
    flex-shrink: 0;
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
    flex-shrink: 0;
    gap: 0.55rem;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.2rem;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  @media (max-width: 64rem) {
    :global(.proposal-builder-panel) {
      grid-row: 2;
      padding-block: 0.5rem;
    }
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
