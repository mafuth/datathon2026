<script lang="ts" module>
  export type ProposalServiceFilter = 'all' | import('./island-services').ServiceDemandCategory;
  export type ProposalPendingPlacement = {
    label: string;
    coordinates: [number, number];
    costs: import('$lib/mobility/proposal-planning').ProposalCosts | null;
    checking?: boolean;
    error?: string | null;
    allowed?: boolean;
  };
  export type ProposalSuggestion = { id: string; label: string; description: string; capital: number; annual: number };
</script>

<script lang="ts">
  import type { IslandMapService, ServiceDemandCategory } from './island-services';
  import type { ProposalCosts, ProposalImpact, ProposalSettings } from '$lib/mobility/proposal-planning';
  import type { ProposalTransportOptions, ProposalTransportPlan } from '$lib/mobility/proposal-transport';
  import type { ScenarioOperation } from '$lib/mobility/scenario-contracts';
  import type { AddServiceSelection } from '$lib/mobility/service-catalog';

  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import BusFront from '@lucide/svelte/icons/bus-front';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Copy from '@lucide/svelte/icons/copy';
  import Hospital from '@lucide/svelte/icons/hospital';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Plus from '@lucide/svelte/icons/plus';
  import School from '@lucide/svelte/icons/school';
  import Search from '@lucide/svelte/icons/search';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Undo2 from '@lucide/svelte/icons/undo-2';

  import { DEFAULT_PROPOSAL_SETTINGS } from '$lib/mobility/proposal-planning';
  import { SERVICE_DRAG_MIME } from '$lib/mobility/service-catalog';
  import { serviceAppearance } from '$lib/mobility/service-icons';

  import * as Alert from '$components/ui/alert';
  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import * as Field from '$components/ui/field';
  import { Input } from '$components/ui/input';
  import * as Tabs from '$components/ui/tabs';
  import * as ToggleGroup from '$components/ui/toggle-group';

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
    onSelectOperation?: (operationId: string) => void;
    activeSelection?: AddServiceSelection | null;
    addServiceLabel?: string | null;
    onStartAddService?: (selection: AddServiceSelection) => void;
    onCancelAdd?: () => void;
    settings?: ProposalSettings;
    onSettingsChange?: (settings: ProposalSettings) => void;
    costs?: ProposalCosts | null;
    impact?: ProposalImpact | null;
    operations?: readonly ScenarioOperation[];
    transportPlans?: readonly ProposalTransportPlan[];
    transportOptions?: ProposalTransportOptions | null;
    transportOptionsLoading?: boolean;
    transportOptionsError?: string | null;
    onLoadTransportOptions?: () => Promise<void>;
    pendingPlacement?: ProposalPendingPlacement | null;
    onConfirmPlacement?: () => void;
    onCancelPlacement?: () => void;
    onUndo?: () => void;
    onRemoveOperation?: (operationId: string) => void;
    onDuplicateService?: (service: IslandMapService) => void;
    onMoveService?: (service: IslandMapService) => void;
    onSuggest?: (priorities: ServiceDemandCategory[]) => void;
    suggesting?: boolean;
    suggestions?: readonly ProposalSuggestion[];
    suggestionsAllowed?: boolean;
    onAcceptSuggestions?: () => void;
    onCancelSuggestions?: () => void;
    onSelectSuggestion?: (suggestionId: string) => void;
    onEstimatePlacement?: (estimate: { capital: number; annual: number; basis: string }) => void;
    reviewCurrent?: boolean;
    exporting?: boolean;
    exportError?: string | null;
    onDownloadPdf?: () => void;
    onRefreshImpact?: () => void;
    selectedIslandId?: string;
    onPreviewTransport?: (operation: ScenarioOperation) => void;
    selectedArea?: { id: string; before: number | null; after: number | null; label: string } | null;
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
    onSelectOperation = () => {},
    activeSelection = null,
    addServiceLabel = null,
    onStartAddService = () => {},
    onCancelAdd = () => {},
    settings = { ...DEFAULT_PROPOSAL_SETTINGS },
    onSettingsChange = () => {},
    costs = null,
    impact = null,
    operations = [],
    transportPlans = [],
    transportOptions = null,
    transportOptionsLoading = false,
    transportOptionsError = null,
    onLoadTransportOptions,
    pendingPlacement = null,
    onConfirmPlacement = () => {},
    onCancelPlacement = () => {},
    onUndo = () => {},
    onRemoveOperation = () => {},
    onDuplicateService = () => {},
    onMoveService = () => {},
    onSuggest = () => {},
    suggesting = false,
    suggestions = [],
    suggestionsAllowed = false,
    onAcceptSuggestions = () => {},
    onCancelSuggestions = () => {},
    onSelectSuggestion = () => {},
    onEstimatePlacement = () => {},
    reviewCurrent = false,
    exporting = false,
    exportError = null,
    onDownloadPdf = () => {},
    onRefreshImpact = () => {},
    selectedIslandId = '',
    onPreviewTransport = () => {},
    selectedArea = null
  }: Props = $props();
  let composeMode = $state<'manual' | 'budget'>('manual');
  let budgetEditing = $state(false);
  let reviewOpen = $state(false);
  let Review = $state.raw<typeof import('./proposal-review.svelte').default | null>(null);
  let reviewLoading = $state(false);
  let reviewLoadError = $state<string | null>(null);
  let transportModule = $state.raw<Promise<typeof import('./proposal-transport-planner.svelte')> | null>(null);
  let paletteModule = $state.raw<Promise<typeof import('./service-palette.svelte')> | null>(null);
  let existingServicesOpen = $state(false);
  let compact = $state(false);
  let priorities = $state<ServiceDemandCategory[]>(['transport']);
  let estimateCapital = $state<number | undefined>(0);
  let estimateAnnual = $state<number | undefined>(0);
  let estimateBasis = $state('');
  let draggingSubtype = $state<AddServiceSelection['subtype'] | null>(null);
  let suppressPlacementClickUntil = 0;
  const estimateValid = $derived(
    estimateCapital != null &&
      Number.isFinite(estimateCapital) &&
      estimateCapital >= 0 &&
      estimateCapital <= 1e12 &&
      estimateAnnual != null &&
      Number.isFinite(estimateAnnual) &&
      estimateAnnual >= 0 &&
      estimateAnnual <= 1e12 &&
      estimateBasis.trim().length >= 5
  );
  const fieldId = $props.id();
  const categories = [
    { value: 'transport', label: 'Transport' },
    { value: 'health', label: 'Healthcare' },
    { value: 'education', label: 'Education' }
  ] as const;
  const quickImprovements = [
    { serviceType: 'transport', subtype: 'bus_stop', label: 'Bus stop', icon: BusFront },
    { serviceType: 'education', subtype: 'school', label: 'School', icon: School },
    { serviceType: 'health', subtype: 'hospital', label: 'Hospital', icon: Hospital }
  ] as const;
  const mappedServices = $derived(services.filter((service) => service.coordinates !== null));
  const serviceIndex = $derived(new Map(services.map((service) => [service.id, service])));
  const searchableServices = $derived(
    mappedServices.map((service) => ({
      service,
      search: `${service.name ?? ''} ${service.subtype} ${service.id}`.toLowerCase()
    }))
  );
  const normalizedQuery = $derived(query.trim().toLowerCase());
  const visibleServices = $derived(
    searchableServices
      .filter(
        ({ service, search }) =>
          (serviceFilter === 'all' || service.serviceType === serviceFilter) &&
          (!normalizedQuery || search.includes(normalizedQuery))
      )
      .map(({ service }) => service)
  );
  const pendingAllowed = $derived(
    !!pendingPlacement &&
      !pending &&
      !pendingPlacement.checking &&
      !pendingPlacement.error &&
      !!pendingPlacement.costs?.complete &&
      pendingPlacement.costs.withinBudget &&
      pendingPlacement.allowed !== false
  );
  const canReview = $derived(
    !pendingPlacement && !activeSelection && !moveActive && !pending && suggestions.length === 0
  );
  const pendingCapital = $derived(
    pendingPlacement?.costs ? pendingPlacement.costs.capital - (costs?.capital ?? 0) : null
  );
  const pendingAnnual = $derived(pendingPlacement?.costs ? pendingPlacement.costs.annual - (costs?.annual ?? 0) : null);
  const compactMoney = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
  function money(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'Unavailable' : compactMoney.format(value);
  }
  function pressure(value: number | null): string {
    return value == null ? 'Unavailable' : value.toFixed(2);
  }
  function budgetUse(amount: number, limit: number): string {
    const percentage = limit > 0 ? (amount / limit) * 100 : amount > 0 ? 100 : 0;
    return `${Math.min(100, Math.max(0, percentage))}%`;
  }
  function changeSetting(key: 'capitalLimit' | 'annualLimit', event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const value = input.valueAsNumber;
    if (Number.isFinite(value) && value >= 0 && value <= 1e12) {
      onSettingsChange({ ...settings, [key]: value });
    } else {
      input.value = String(settings[key]);
    }
  }
  function changeName(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.value.trim().slice(0, 120) || DEFAULT_PROPOSAL_SETTINGS.name;
    input.value = name;
    if (name !== settings.name) onSettingsChange({ ...settings, name });
  }
  async function showReview(): Promise<void> {
    if (!canReview || reviewLoading) return;
    reviewLoadError = null;
    if (!reviewCurrent) onRefreshImpact();
    if (!Review) {
      reviewLoading = true;
      try {
        Review = (await import('./proposal-review.svelte')).default;
      } catch {
        reviewLoadError = 'The proposal review could not be loaded. Please try again.';
        return;
      } finally {
        reviewLoading = false;
      }
    }
    reviewOpen = true;
  }
  function itemService(serviceId: string): IslandMapService | undefined {
    return serviceIndex.get(serviceId);
  }
  function quickSelection(improvement: (typeof quickImprovements)[number]): AddServiceSelection {
    return { serviceType: improvement.serviceType, subtype: improvement.subtype, name: null };
  }
  function startQuickDrag(event: DragEvent, improvement: (typeof quickImprovements)[number]): void {
    if (pending || pendingPlacement || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const selection = quickSelection(improvement);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SERVICE_DRAG_MIME, JSON.stringify(selection));
    event.dataTransfer.setData('text/plain', improvement.label);
    const icon = (event.currentTarget as HTMLButtonElement).querySelector<HTMLElement>('[data-drag-icon]');
    if (icon) {
      const bounds = icon.getBoundingClientRect();
      event.dataTransfer.setDragImage(icon, bounds.width / 2, bounds.height / 2);
    }
    draggingSubtype = selection.subtype;
    suppressPlacementClickUntil = Date.now() + 500;
  }
  function endQuickDrag(): void {
    draggingSubtype = null;
    suppressPlacementClickUntil = Date.now() + 350;
  }
  function selectQuickImprovement(event: MouseEvent, improvement: (typeof quickImprovements)[number]): void {
    if (event.detail !== 0 && Date.now() < suppressPlacementClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!pending && !pendingPlacement) onStartAddService(quickSelection(improvement));
  }
</script>

<Card.Root
  class={`proposal-builder-panel${compact ? ' proposal-builder-compact' : ''}`}
  aria-label="Proposal builder"
  aria-busy={pending}
>
  <div class="proposal-header">
    <div>
      <p class="proposal-eyebrow">Proposal workspace</p>
      <h2>Build your proposal</h2>
    </div>
    <Button
      variant="ghost"
      size="icon-sm"
      class="proposal-compact-toggle"
      aria-label={compact ? 'Expand proposal panel' : 'Make room for the map'}
      aria-expanded={!compact}
      onclick={() => (compact = !compact)}
      ><ChevronDown class={compact ? 'proposal-chevron-up' : ''} aria-hidden="true" /></Button
    >
  </div>
  <Card.Content class="proposal-builder-content">
    <Tabs.Root bind:value={composeMode} class="proposal-compose-tabs"
      ><Tabs.List aria-label="How to build your proposal"
        ><Tabs.Trigger value="manual"><Plus size={14} aria-hidden="true" />Place improvements</Tabs.Trigger
        ><Tabs.Trigger value="budget"><Sparkles size={14} aria-hidden="true" />Suggest a draft</Tabs.Trigger></Tabs.List
      >
      <section class="proposal-budget" aria-label="Proposal budget">
        <div class="proposal-section-heading">
          <h3>Your budget <span>MVR</span></h3>
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={budgetEditing}
            onclick={() => (budgetEditing = !budgetEditing)}>{budgetEditing ? 'Done' : 'Edit limits'}</Button
          >
        </div>
        <div class="proposal-budget-totals">
          <div>
            <span>Upfront investment</span><strong
              >{money(costs?.capital ?? 0)} <small>/ {money(settings.capitalLimit)}</small></strong
            >
            <div
              class="proposal-budget-track"
              data-over={(costs?.capital ?? 0) > settings.capitalLimit}
              aria-hidden="true"
            >
              <span style:width={budgetUse(costs?.capital ?? 0, settings.capitalLimit)}></span>
            </div>
          </div>
          <div>
            <span>Annual running cost</span><strong
              >{money(costs?.annual ?? 0)} <small>/ {money(settings.annualLimit)}</small></strong
            >
            <div
              class="proposal-budget-track"
              data-over={(costs?.annual ?? 0) > settings.annualLimit}
              aria-hidden="true"
            >
              <span style:width={budgetUse(costs?.annual ?? 0, settings.annualLimit)}></span>
            </div>
          </div>
        </div>
        {#if budgetEditing || composeMode === 'budget'}
          <Field.FieldGroup class="proposal-budget-fields"
            ><Field.Field
              ><Field.FieldLabel for={`${fieldId}-capital`}>Upfront limit (MVR)</Field.FieldLabel><Input
                id={`${fieldId}-capital`}
                type="number"
                min={0}
                max={1000000000000}
                step={100000}
                value={settings.capitalLimit}
                onchange={(event) => changeSetting('capitalLimit', event)}
              /></Field.Field
            ><Field.Field
              ><Field.FieldLabel for={`${fieldId}-annual`}>Annual running limit (MVR)</Field.FieldLabel><Input
                id={`${fieldId}-annual`}
                type="number"
                min={0}
                max={1000000000000}
                step={100000}
                value={settings.annualLimit}
                onchange={(event) => changeSetting('annualLimit', event)}
              /></Field.Field
            ></Field.FieldGroup
          >
          <p class="proposal-hint">
            Editable planning limits. Upfront costs and yearly running costs are checked separately.
          </p>
        {/if}
        {#if costs && !costs.withinBudget}<p class="proposal-warning" role="alert">
            This draft exceeds a budget limit or includes unpriced scope. Adjust the limits or review the items below.
          </p>{/if}
      </section>
      {#if error}<Alert.Root variant="destructive" class="proposal-alert"
          ><Alert.Title>Draft needs attention</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root
        >{:else if message}<p class="proposal-status" role="status">
          <Check size={14} aria-hidden="true" />{message}
        </p>{/if}
      {#if pendingPlacement}
        <section class="proposal-confirmation" aria-label="Review pending change" aria-busy={pendingPlacement.checking}>
          <p class="proposal-eyebrow">Preview · not added yet</p>
          <h3>{pendingPlacement.label}</h3>
          <p class="proposal-location">
            <MapPin size={13} aria-hidden="true" />{pendingPlacement.coordinates[1].toFixed(5)}, {pendingPlacement.coordinates[0].toFixed(
              5
            )}
          </p>
          {#if pendingPlacement.checking}<p class="proposal-status" role="status">
              <LoaderCircle class="proposal-spinner" size={14} aria-hidden="true" />Checking this change and both
              budgets…
            </p>{:else}<div class="proposal-budget-totals">
              <div><span>Change upfront</span><strong>MVR {money(pendingCapital)}</strong></div>
              <div><span>Change per year</span><strong>MVR {money(pendingAnnual)}</strong></div>
            </div>
            {#if pendingPlacement.error}<p class="proposal-warning" role="alert">
                {pendingPlacement.error}
              </p>{/if}{#if pendingPlacement.costs && !pendingPlacement.costs.withinBudget}<p
                class="proposal-warning"
                role="alert"
              >
                This change cannot be funded within the current limits, or needs a scoped estimate. Edit the budget or
                enter a project estimate below.
              </p>{/if}
            {#if pendingPlacement.costs && !pendingPlacement.costs.complete}<details class="proposal-disclosure" open>
                <summary>Set a scoped cost estimate<ChevronDown size={14} aria-hidden="true" /></summary>
                <div class="proposal-disclosure-content">
                  <p class="proposal-hint">
                    Supply your planning assumption for the whole pending change. The entered basis appears in the
                    review and PDF.
                  </p>
                  <Field.FieldGroup class="proposal-budget-fields"
                    ><Field.Field
                      ><Field.FieldLabel for={`${fieldId}-estimate-capital`}>Upfront estimate (MVR)</Field.FieldLabel
                      ><Input
                        id={`${fieldId}-estimate-capital`}
                        type="number"
                        min={0}
                        max={1000000000000}
                        bind:value={estimateCapital}
                      /></Field.Field
                    ><Field.Field
                      ><Field.FieldLabel for={`${fieldId}-estimate-annual`}>Annual estimate (MVR)</Field.FieldLabel
                      ><Input
                        id={`${fieldId}-estimate-annual`}
                        type="number"
                        min={0}
                        max={1000000000000}
                        bind:value={estimateAnnual}
                      /></Field.Field
                    ></Field.FieldGroup
                  ><Field.Field
                    ><Field.FieldLabel for={`${fieldId}-estimate-basis`}>Estimate scope and basis</Field.FieldLabel
                    ><Input
                      id={`${fieldId}-estimate-basis`}
                      bind:value={estimateBasis}
                      minlength={5}
                      maxlength={500}
                      placeholder="Scope, quantities and source of this allowance"
                    /></Field.Field
                  ><Button
                    variant="outline"
                    size="sm"
                    disabled={!estimateValid || pending}
                    onclick={() => {
                      if (estimateValid && estimateCapital != null && estimateAnnual != null)
                        onEstimatePlacement({
                          capital: estimateCapital,
                          annual: estimateAnnual,
                          basis: estimateBasis.trim()
                        });
                    }}>Recheck with my estimate</Button
                  >
                </div>
              </details>{/if}
          {/if}
          <div class="proposal-confirm-actions">
            <Button variant="outline" size="sm" onclick={onCancelPlacement}>Cancel</Button><Button
              size="sm"
              disabled={!pendingAllowed}
              onclick={onConfirmPlacement}><Check size={14} aria-hidden="true" />Add to proposal</Button
            >
          </div>
        </section>
      {:else if moveActive || activeSelection}<section class="proposal-placement-cue" role="status" aria-live="polite">
          <MapPin size={17} aria-hidden="true" />
          <p>
            {moveActive
              ? 'Choose the new location inside the island.'
              : `Click inside the island to place ${addServiceLabel ?? 'your improvement'}.`}<span
              >Review costs before confirming.</span
            >
          </p>
          <Button variant="ghost" size="xs" onclick={moveActive ? onCancelMove : onCancelAdd}>Cancel</Button>
        </section>{/if}
      <Tabs.Content value="manual">
        <section class="proposal-add-section" aria-label="Add an improvement">
          <div class="proposal-place-heading">
            <h3>What would you like to add?</h3>
            <p id={`${fieldId}-placement-help`} class="proposal-hint">
              Drag a card onto the map, or select it and choose a location.
            </p>
          </div>
          <div class="proposal-quick-actions">
            {#each quickImprovements as improvement (improvement.subtype)}{@const Icon = improvement.icon}<Button
                variant="outline"
                class="proposal-quick-action"
                disabled={pending || !!pendingPlacement}
                draggable={!pending && !pendingPlacement}
                data-dragging={draggingSubtype === improvement.subtype}
                data-service-subtype={improvement.subtype}
                aria-pressed={activeSelection?.subtype === improvement.subtype}
                aria-describedby={`${fieldId}-placement-help`}
                title={`${improvement.label}: drag to map or select to place`}
                onclick={(event) => selectQuickImprovement(event, improvement)}
                ondragstart={(event) => startQuickDrag(event, improvement)}
                ondragend={endQuickDrag}
                ><span class="proposal-quick-icon" data-drag-icon><Icon class="size-5" aria-hidden="true" /></span><span
                  class="proposal-quick-label">{improvement.label}</span
                ><Plus class="proposal-quick-plus size-3" aria-hidden="true" /></Button
              >{/each}
          </div>
          <details
            class="proposal-disclosure"
            ontoggle={(event) => {
              if (event.currentTarget.open && !transportModule)
                transportModule = import('./proposal-transport-planner.svelte');
            }}
          >
            <summary>Bus & ferry services<ChevronDown size={14} aria-hidden="true" /></summary>
            <div class="proposal-disclosure-content">
              {#if transportModule}
                {#await transportModule}
                  <p class="proposal-status" role="status">Loading transport planner…</p>
                {:then { default: ProposalTransportPlanner }}
                  {#if selectedIslandId}<ProposalTransportPlanner
                      {selectedIslandId}
                      providedOptions={transportOptions}
                      providedLoading={transportOptionsLoading}
                      providedError={transportOptionsError}
                      onLoadOptions={onLoadTransportOptions}
                      pending={pending || !!pendingPlacement}
                      {onPreviewTransport}
                    />{:else}<p class="proposal-hint">Select an island to plan a bus or ferry connection.</p>{/if}
                {:catch}
                  <p class="proposal-warning" role="alert">The transport planner could not be loaded.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => (transportModule = import('./proposal-transport-planner.svelte'))}>Try again</Button
                  >
                {/await}
              {/if}
            </div>
          </details>
          <details
            class="proposal-disclosure"
            ontoggle={(event) => {
              if (event.currentTarget.open && !paletteModule) paletteModule = import('./service-palette.svelte');
            }}
          >
            <summary>More improvements<ChevronDown size={14} aria-hidden="true" /></summary>
            <div class="proposal-disclosure-content">
              {#if paletteModule}
                {#await paletteModule}
                  <p class="proposal-status" role="status">Loading service library…</p>
                {:then { default: ServicePalette }}
                  <ServicePalette pending={pending || !!pendingPlacement} {activeSelection} {onStartAddService} />
                {:catch}
                  <p class="proposal-warning" role="alert">The service library could not be loaded.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => (paletteModule = import('./service-palette.svelte'))}>Try again</Button
                  >
                {/await}
              {/if}
              <p class="proposal-hint">
                Some specialist facilities need a scoped estimate before they can be accepted.
              </p>
            </div>
          </details>
        </section>
      </Tabs.Content>
      <Tabs.Content value="budget">
        <section class="proposal-suggestions" aria-label="Find options within my budget">
          <h3>What matters most?</h3>
          <p class="proposal-hint">Choose service priorities, then review the suggested locations on the map.</p>
          <ToggleGroup.Root
            type="multiple"
            bind:value={priorities}
            variant="outline"
            class="proposal-priorities"
            aria-label="Proposal priorities"
            >{#each categories as category (category.value)}<ToggleGroup.Item value={category.value}
                >{category.label}</ToggleGroup.Item
              >{/each}</ToggleGroup.Root
          ><Button
            class="proposal-find-button"
            variant="secondary"
            disabled={pending || suggesting || priorities.length === 0 || !!pendingPlacement}
            onclick={() => onSuggest([...priorities])}
            >{#if suggesting}<LoaderCircle size={15} class="proposal-spinner" aria-hidden="true" />{:else}<Sparkles
                size={15}
                aria-hidden="true"
              />{/if}{suggesting ? 'Finding options…' : 'Find options within my budget'}</Button
          >
          {#if suggestions.length > 0}<ul class="proposal-suggestion-list" aria-label="Suggested improvements">
              {#each suggestions as suggestion (suggestion.id)}<li>
                  <div class="proposal-section-heading">
                    <strong>{suggestion.label}</strong><Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Show suggested ${suggestion.label} on the map`}
                      onclick={() => onSelectSuggestion(suggestion.id)}><MapPin size={13} aria-hidden="true" /></Button
                    >
                  </div>
                  <p>{suggestion.description}</p>
                  <span>MVR {money(suggestion.capital)} upfront · {money(suggestion.annual)}/year</span>
                </li>{/each}
            </ul>
            <div class="proposal-confirm-actions">
              <Button variant="outline" disabled={pending} onclick={onCancelSuggestions}>Cancel suggestions</Button
              ><Button disabled={pending || !!pendingPlacement || !suggestionsAllowed} onclick={onAcceptSuggestions}
                ><Plus size={14} aria-hidden="true" />Add suggested draft</Button
              >
            </div>
            {#if !suggestionsAllowed}<p class="proposal-hint">
                Wait for the combined cost check or find fresh options for your current limits.
              </p>{/if}{/if}
        </section>
      </Tabs.Content>
    </Tabs.Root>
    {#if pending}<p class="proposal-status" role="status">
        <LoaderCircle size={13} class="proposal-spinner" aria-hidden="true" />Updating the proposal…
      </p>{:else if !reviewCurrent && operations.length > 0}<p class="proposal-warning" role="status">
        Previous result shown. Refresh impact before exporting.
      </p>{/if}
    {#if selectedArea}<section class="proposal-selected-area" aria-label="Selected map area evidence">
        <h3>Selected area <span>{selectedArea.label}</span></h3>
        <div class="proposal-budget-totals">
          <div><span>Without proposal</span><strong>{pressure(selectedArea.before)}</strong></div>
          <div><span>With proposal</span><strong>{pressure(selectedArea.after)}</strong></div>
        </div>
        <p class="proposal-hint">
          Relative modeled pressure at this map cell. An unavailable value means the evidence is incomplete.
        </p>
      </section>{/if}
    <section class="proposal-accepted" aria-label="Accepted proposal changes">
      <div class="proposal-section-heading">
        <h3>Your improvements <span>{operations.length}</span></h3>
        <Button
          variant="ghost"
          size="xs"
          disabled={operations.length === 0 || pending || !!pendingPlacement}
          onclick={onUndo}><Undo2 size={13} aria-hidden="true" />Undo</Button
        >
      </div>
      {#if operations.length === 0}<div class="proposal-empty">
          <Plus size={20} aria-hidden="true" />
          <p>
            Start with an improvement.<span>Place it on the map, review the costs, then add it to your proposal.</span>
          </p>
        </div>
      {:else if costs?.items.length}<ul class="proposal-item-list">
          {#each costs.items as item (item.operationId)}{@const service = itemService(item.serviceId)}
            <li>
              <div class="proposal-item-heading">
                <Button
                  variant="ghost"
                  class="proposal-item-title"
                  disabled={!service && !transportPlans.some((plan) => plan.operationId === item.operationId)}
                  onclick={() => (service ? onSelectService(service) : onSelectOperation(item.operationId))}
                  ><MapPin size={14} aria-hidden="true" /><span>{item.label}</span></Button
                ><Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${item.label} from proposal`}
                  disabled={pending || !!pendingPlacement}
                  onclick={() => onRemoveOperation(item.operationId)}><Trash2 size={13} aria-hidden="true" /></Button
                >
              </div>
              <p class="proposal-item-cost">
                {item.costAvailable
                  ? `MVR ${money(item.capital)} upfront · ${money(item.annual)}/year`
                  : 'Project cost estimate required'}
              </p>
              {#if service?.change === 'added'}<div class="proposal-item-actions">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending || !!pendingPlacement}
                    onclick={() => onMoveService(service)}><MapPin size={12} aria-hidden="true" />Move</Button
                  ><Button
                    variant="ghost"
                    size="xs"
                    disabled={pending || !!pendingPlacement}
                    onclick={() => onDuplicateService(service)}><Copy size={12} aria-hidden="true" />Duplicate</Button
                  >
                </div>{/if}
            </li>{/each}
        </ul>
      {:else}<p class="proposal-hint">
          {operations.length} accepted {operations.length === 1 ? 'change' : 'changes'}. Costs are being prepared.
        </p>{/if}
    </section>
    <details class="proposal-disclosure" bind:open={existingServicesOpen}>
      <summary
        >Existing services<Badge variant="outline">{mappedServices.length}</Badge><ChevronDown
          size={14}
          aria-hidden="true"
        /></summary
      >
      <div class="proposal-disclosure-content">
        {#if existingServicesOpen}
          <Field.Field
            ><Field.FieldLabel for={`${fieldId}-search`} class="sr-only">Search services</Field.FieldLabel>
            <div class="proposal-search-field">
              <Search size={14} aria-hidden="true" /><Input
                id={`${fieldId}-search`}
                bind:value={query}
                placeholder="Search name, type or ID"
                autocomplete="off"
              />
            </div></Field.Field
          ><ToggleGroup.Root
            type="single"
            value={serviceFilter}
            onValueChange={(value) => {
              if (value === 'all' || value === 'health' || value === 'education' || value === 'transport')
                serviceFilter = value;
            }}
            class="proposal-segmented"
            aria-label="Filter existing services"
            ><ToggleGroup.Item value="all">All</ToggleGroup.Item><ToggleGroup.Item value="health"
              >Health</ToggleGroup.Item
            ><ToggleGroup.Item value="education">Education</ToggleGroup.Item><ToggleGroup.Item value="transport"
              >Transport</ToggleGroup.Item
            ></ToggleGroup.Root
          >
          <p class="proposal-hint">
            {visibleServices.length} services match. Select one to inspect available improvements.
          </p>
          <ul class="proposal-existing-list">
            {#each visibleServices as service (service.id)}{@const { Icon, label } = serviceAppearance(
                service.serviceType,
                service.subtype
              )}
              <li>
                <Button variant="ghost" class="proposal-service-row" onclick={() => onSelectService(service)}
                  ><Icon data-icon="inline-start" aria-hidden="true" /><span
                    >{service.name || label}<small>{label}</small></span
                  >{#if service.change && service.change !== 'unchanged'}<Badge variant="outline"
                      >{service.change}</Badge
                    >{/if}</Button
                >
              </li>{/each}
          </ul>
          {#if visibleServices.length === 0}<p class="proposal-hint">No services match these filters.</p>{/if}
        {/if}
      </div>
    </details>
    <details class="proposal-disclosure">
      <summary>Proposal details & assumptions<ChevronDown size={14} aria-hidden="true" /></summary>
      <div class="proposal-disclosure-content">
        <Field.Field
          ><Field.FieldLabel for={`${fieldId}-name`}>Proposal name</Field.FieldLabel><Input
            id={`${fieldId}-name`}
            value={settings.name}
            maxlength={120}
            onchange={changeName}
            onblur={changeName}
          /></Field.Field
        >
        <p class="proposal-hint">
          Costs use the previous project's MVR planning allowances. They are estimates rather than supplier quotations.
          Land, major civil works and feasibility need separate assessment.
        </p>
        {#if costs}<div class="proposal-fiscal">
            <div><span>Year 1</span><strong>MVR {money(costs.oneYear)}</strong></div>
            <div><span>5 years</span><strong>MVR {money(costs.fiveYear)}</strong></div>
            <div><span>10 years</span><strong>MVR {money(costs.tenYear)}</strong></div>
          </div>{/if}
      </div>
    </details>
  </Card.Content>
  <div class="proposal-footer">
    <Button
      variant="ghost"
      size="sm"
      onclick={() => {
        budgetEditing = true;
        compact = false;
      }}>Budget</Button
    ><Button class="proposal-review-button" disabled={!canReview || reviewLoading} onclick={showReview}
      >{reviewLoading ? 'Opening review…' : 'Review full impact'}{#if reviewLoading}<LoaderCircle
          size={15}
          class="proposal-spinner"
          aria-hidden="true"
        />{:else}<ArrowRight size={15} aria-hidden="true" />{/if}</Button
    >
  </div>
  {#if reviewLoadError}<p class="proposal-warning" role="alert">{reviewLoadError}</p>{/if}
</Card.Root>
{#if Review}<Review
    bind:open={reviewOpen}
    {settings}
    {costs}
    {impact}
    {operations}
    {transportPlans}
    {services}
    current={reviewCurrent && !pendingPlacement}
    {pending}
    {exporting}
    error={error || exportError}
    {onDownloadPdf}
    onRefresh={onRefreshImpact}
    {onSelectService}
    {onSelectOperation}
  />{/if}

<style>
  :global(.proposal-builder-panel) {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 20;
    display: flex;
    flex-direction: column;
    width: min(24rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: hidden;
    gap: 0;
    padding: 0;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
    color-scheme: light;
    box-shadow: var(--mobility-shadow-panel);
    animation: proposal-enter var(--mobility-duration-enter) var(--mobility-ease);
  }
  .proposal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1rem 0.85rem;
  }
  .proposal-eyebrow {
    margin: 0 0 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .proposal-header h2 {
    margin: 0;
    font-family: var(--mobility-font-heading);
    font-size: var(--mobility-text-xl);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: var(--mobility-leading-tight);
    letter-spacing: -0.04em;
  }
  :global(.proposal-builder-content) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: 0.1rem 1rem 0.9rem;
  }
  :global(.proposal-compose-tabs) {
    gap: 0.8rem;
  }
  :global(.proposal-segmented) {
    display: flex;
    width: 100%;
    min-height: 2.1rem;
    gap: 0.2rem;
    padding: 0.2rem;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  :global(.proposal-segmented [data-slot='toggle-group-item']) {
    flex: 1;
    min-width: 0;
    height: auto;
    gap: 0.25rem;
    padding: 0.35rem 0.25rem;
    border-radius: var(--mobility-radius-small);
    font-size: var(--mobility-text-xs);
  }
  :global(.proposal-segmented [data-slot='toggle-group-item'][data-state='on']) {
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    box-shadow: var(--mobility-shadow-card);
  }
  :global(.proposal-compose-tabs > [data-slot='tabs-list']) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    height: auto;
    min-height: 2.5rem;
    padding: 0.2rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  :global(.proposal-compose-tabs > [data-slot='tabs-list'] > [data-slot='tabs-trigger']) {
    flex: 1;
    min-width: 0;
    gap: 0.3rem;
    min-height: 2rem;
    padding: 0.4rem 0.3rem;
    border-radius: var(--mobility-radius-small);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  :global(.proposal-compose-tabs > [data-slot='tabs-list'] > [data-slot='tabs-trigger'][data-state='active']) {
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-card);
  }
  .proposal-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    font-family: var(--mobility-font-heading);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.015em;
  }
  h3 span {
    margin-left: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
  }
  .proposal-budget {
    display: grid;
    gap: 0.5rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  .proposal-budget-totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .proposal-budget-totals > div {
    display: grid;
    gap: 0.15rem;
  }
  .proposal-budget-totals span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-budget-totals strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
  }
  .proposal-budget-totals small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-medium);
    letter-spacing: 0;
  }
  .proposal-budget-track {
    height: 3px;
    margin-top: 0.45rem;
    overflow: hidden;
    border-radius: 3px;
    background: var(--mobility-border);
  }
  .proposal-budget-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--mobility-accent);
  }
  .proposal-budget-track[data-over='true'] > span {
    background: var(--mobility-warning);
  }
  :global(.proposal-budget-fields) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
    padding-top: 0.45rem;
  }
  .proposal-budget :global([data-slot='field-label']),
  .proposal-disclosure :global([data-slot='field-label']) {
    font-size: var(--mobility-text-xs);
  }
  .proposal-budget :global(input),
  .proposal-disclosure :global(input) {
    min-width: 0;
    min-height: 2.25rem;
    background: var(--mobility-surface);
    font-size: var(--mobility-text-sm);
  }
  .proposal-hint {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-warning {
    margin: 0;
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  :global(.proposal-alert) {
    font-size: var(--mobility-text-sm);
  }
  .proposal-confirmation {
    animation: proposal-state-enter var(--mobility-duration-enter) var(--mobility-ease);
    display: grid;
    gap: 0.65rem;
    padding: 0.85rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-accent-soft);
  }
  .proposal-confirmation h3 {
    font-size: var(--mobility-text-md);
  }
  .proposal-confirmation .proposal-eyebrow {
    margin: 0;
    color: var(--mobility-accent);
  }
  .proposal-location {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin: -0.2rem 0 0;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  .proposal-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.4rem;
  }
  .proposal-placement-cue {
    animation: proposal-state-enter var(--mobility-duration-enter) var(--mobility-ease);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }
  .proposal-placement-cue p {
    flex: 1;
    margin: 0;
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-placement-cue p span {
    display: block;
    margin-top: 0.2rem;
    font-size: var(--mobility-text-xs);
  }
  .proposal-add-section,
  .proposal-suggestions,
  .proposal-accepted {
    display: grid;
    gap: 0.7rem;
  }
  .proposal-place-heading {
    display: grid;
    gap: 0.25rem;
  }
  .proposal-quick-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  :global(.proposal-builder-panel .proposal-quick-action) {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: auto;
    min-height: 5.2rem;
    padding: 0.75rem 0.3rem 0.65rem;
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    cursor: grab;
    touch-action: manipulation;
    translate: none;
  }
  .proposal-quick-icon {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
    color: var(--mobility-accent);
    pointer-events: none;
  }
  .proposal-quick-label {
    font-weight: var(--mobility-font-weight-semibold);
    pointer-events: none;
  }
  :global(.proposal-quick-plus) {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    color: var(--mobility-muted);
    pointer-events: none;
  }
  :global(.proposal-builder-panel .proposal-quick-action[aria-pressed='true']) {
    border-color: var(--mobility-accent);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
    box-shadow: inset 0 0 0 1px var(--mobility-accent);
  }
  :global(.proposal-builder-panel .proposal-quick-action:focus-visible) {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 3px;
    box-shadow: none;
  }
  :global(.proposal-builder-panel .proposal-quick-action:active) {
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
    cursor: grabbing;
  }
  :global(.proposal-builder-panel .proposal-quick-action[data-dragging='true']) {
    opacity: 0.55;
    cursor: grabbing;
  }
  :global(.proposal-builder-panel .proposal-quick-action:disabled) {
    cursor: default;
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.proposal-builder-panel .proposal-quick-action:not(:disabled):hover) {
      border-color: var(--mobility-accent);
      background: var(--mobility-accent-soft);
      color: var(--mobility-accent);
    }
  }
  .proposal-disclosure {
    border-top: 1px solid var(--mobility-border);
  }
  .proposal-disclosure summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.6rem;
    padding: 0.6rem 0;
    list-style: none;
    cursor: pointer;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .proposal-disclosure summary::-webkit-details-marker {
    display: none;
  }
  .proposal-disclosure summary > :global(svg:last-child) {
    margin-left: auto;
    color: var(--mobility-muted);
    transition: transform var(--mobility-duration-fast) var(--mobility-ease);
  }
  .proposal-disclosure[open] summary > :global(svg:last-child) {
    transform: rotate(180deg);
  }
  .proposal-disclosure summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 4px;
    border-radius: var(--mobility-radius-small);
  }
  .proposal-disclosure-content {
    display: grid;
    gap: 0.65rem;
    padding: 0.1rem 0 0.6rem;
  }
  :global(.proposal-priorities) {
    width: 100%;
    flex-wrap: wrap;
  }
  :global(.proposal-priorities [data-slot='toggle-group-item']) {
    flex: 1;
    min-height: 2.25rem;
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    transition:
      background-color var(--mobility-duration-fast) ease,
      border-color var(--mobility-duration-fast) ease,
      color var(--mobility-duration-fast) ease;
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.proposal-priorities [data-slot='toggle-group-item']:hover) {
      background: var(--mobility-accent-soft);
      color: var(--mobility-accent);
    }
  }
  :global(.proposal-priorities [data-slot='toggle-group-item'][data-state='on']) {
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    border-color: var(--mobility-accent);
  }
  :global(.proposal-find-button) {
    width: 100%;
    font-size: var(--mobility-text-sm);
  }
  .proposal-suggestion-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .proposal-suggestion-list li {
    padding: 0.65rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
  }
  .proposal-suggestion-list strong {
    font-size: var(--mobility-text-sm);
  }
  .proposal-suggestion-list p {
    margin: 0.2rem 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-suggestion-list span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-selected-area {
    display: grid;
    gap: 0.6rem;
    padding: 0.65rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
  }
  .proposal-empty {
    display: flex;
    gap: 0.7rem;
    align-items: flex-start;
    padding: 0.75rem;
    border: 1px dashed var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
    color: var(--mobility-muted);
  }
  .proposal-empty p {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
  }
  .proposal-empty span {
    display: block;
    margin-top: 0.25rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-item-list {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .proposal-item-list > li {
    display: grid;
    gap: 0.2rem;
    padding: 0.45rem 0.5rem 0.5rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
  }
  .proposal-item-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3rem;
  }
  :global(.proposal-item-title) {
    justify-content: flex-start;
    gap: 0.35rem;
    min-width: 0;
    height: auto;
    padding: 0.2rem;
    white-space: normal;
    text-align: left;
    font-size: var(--mobility-text-sm);
  }
  .proposal-item-cost {
    margin: 0 0 0 0.2rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-item-actions {
    display: flex;
    gap: 0.2rem;
    margin-top: 0.15rem;
  }
  .proposal-search-field {
    position: relative;
  }
  .proposal-search-field > :global(svg) {
    position: absolute;
    top: 50%;
    left: 0.6rem;
    transform: translateY(-50%);
    color: var(--mobility-muted);
    pointer-events: none;
  }
  .proposal-search-field :global(input) {
    padding-left: 1.9rem;
  }
  .proposal-existing-list {
    display: grid;
    gap: 0.2rem;
    max-height: 16rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  :global(.proposal-service-row) {
    display: flex;
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
    height: auto;
    min-height: 2.8rem;
    padding: 0.4rem;
    white-space: normal;
    text-align: left;
    font-size: var(--mobility-text-sm);
  }
  :global(.proposal-service-row > span) {
    flex: 1;
    min-width: 0;
  }
  :global(.proposal-service-row small) {
    display: block;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    text-transform: capitalize;
  }
  .proposal-existing-list :global([data-slot='badge']),
  .proposal-disclosure summary :global([data-slot='badge']) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface-muted);
    color: var(--mobility-accent);
    padding: 0.1rem 0.35rem;
    font-size: var(--mobility-text-xs);
  }
  .proposal-fiscal {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .proposal-fiscal div {
    display: grid;
    gap: 0.2rem;
  }
  .proposal-fiscal span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-fiscal strong {
    font-size: var(--mobility-text-sm);
    font-variant-numeric: tabular-nums;
  }
  .proposal-footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--mobility-border);
    background: var(--mobility-surface);
  }
  :global(.proposal-review-button) {
    flex: 1;
    justify-content: space-between;
    min-height: 2.4rem;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    font-size: var(--mobility-text-sm);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.proposal-review-button:not(:disabled):hover) {
      background: var(--mobility-accent-hover);
      color: var(--mobility-on-accent);
    }
  }
  :global(.proposal-compact-toggle) {
    display: none;
  }
  :global(.proposal-spinner) {
    animation: proposal-spin 0.8s linear infinite;
  }
  @keyframes proposal-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes proposal-state-enter {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes proposal-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 640px) {
    :global(.proposal-builder-panel) {
      top: auto;
      bottom: calc(8rem + env(safe-area-inset-bottom, 0px));
      left: 0.6rem;
      width: calc(100vw - 1.2rem);
      max-height: min(52dvh, calc(100dvh - 10rem));
      border-radius: var(--mobility-radius-panel);
    }
    .proposal-header {
      padding: 0.85rem 1rem 0.65rem;
    }
    .proposal-header h2 {
      font-size: var(--mobility-text-lg);
    }
    .proposal-eyebrow {
      font-size: var(--mobility-text-xs);
    }
    :global(.proposal-compact-toggle) {
      display: flex;
    }
    :global(.proposal-chevron-up) {
      transform: rotate(180deg);
    }
    :global(.proposal-builder-compact .proposal-builder-content) {
      display: none;
    }
    :global(.proposal-builder-content) {
      gap: 0.85rem;
      padding-inline: 0.95rem;
    }
    .proposal-footer {
      padding: 0.65rem 0.95rem;
    }
    :global(.proposal-review-button) {
      min-height: 2.75rem;
    }
    .proposal-budget :global(input),
    .proposal-disclosure :global(input) {
      min-height: 2.5rem;
      font-size: var(--mobility-text-lg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.proposal-builder-panel),
    .proposal-confirmation,
    .proposal-placement-cue,
    :global(.proposal-spinner) {
      animation: none;
    }
    .proposal-disclosure summary > :global(svg:last-child) {
      transition: none;
    }
    :global(.proposal-priorities [data-slot='toggle-group-item']),
    :global(.proposal-builder-panel [data-slot='button']) {
      transition: none;
    }
  }
</style>
