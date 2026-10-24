<script lang="ts">
  import { base } from '$app/paths';

  import type { ProposalTransportOperation, ProposalTransportOptions } from '$lib/mobility/proposal-transport';

  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Bus from '@lucide/svelte/icons/bus';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import * as v from 'valibot';

  import { formatProposalMoney } from '$lib/mobility/proposal-planning';
  import {
    proposalTransportOperationSchema,
    transportDeparturesPerDirection,
    transportDistanceKm,
    transportMinimumFleet
  } from '$lib/mobility/proposal-transport';

  import * as Accordion from '$components/ui/accordion';
  import * as Alert from '$components/ui/alert';
  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Empty from '$components/ui/empty';
  import * as Field from '$components/ui/field';
  import { Input } from '$components/ui/input';
  import * as Select from '$components/ui/select';
  import * as Tabs from '$components/ui/tabs';
  import * as Tooltip from '$components/ui/tooltip';

  let {
    selectedIslandId,
    pending = false,
    providedOptions = null,
    providedLoading = false,
    providedError = null,
    initialOperation = null,
    onLoadOptions,
    onApplyTransport
  }: {
    selectedIslandId: string;
    pending?: boolean;
    providedOptions?: ProposalTransportOptions | null;
    providedLoading?: boolean;
    providedError?: string | null;
    initialOperation?: ProposalTransportOperation | null;
    onLoadOptions?: () => Promise<void>;
    onApplyTransport: (operation: ProposalTransportOperation) => void | Promise<void>;
  } = $props();

  const uid = $props.id();
  let mode = $state<'bus' | 'ferry'>('bus');
  let options = $state.raw<ProposalTransportOptions | null>(null);
  let appliedOptions: ProposalTransportOptions | null = null;
  let loading = $state(false);
  let error = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let retry = $state(0);
  let routeId = $state('');
  let originStopId = $state('');
  let destinationStopId = $state('');
  let originQuery = $state('');
  let destinationQuery = $state('');
  let activeStopSearch = $state<'origin' | 'destination' | null>(null);
  let ferryStopIds = $state<string[]>([]);
  let baselineChainId = $state('');
  let appliedInitialOperationKey: string | null = null;
  let headwayMinutes = $state<number | undefined>(60);
  let startHour = $state<number | undefined>(6);
  let endHour = $state<number | undefined>(22);
  let serviceDaysPerWeek = $state<number | undefined>(7);
  let speedKph = $state<number | undefined>(30);
  let openAccordion = $state<string[]>([]);
  let selectedRoute = $derived(options?.busRoutes.find((route) => route.id === routeId));
  let allFerryStops = $derived([...(options?.origins ?? []), ...(options?.destinations ?? [])]);
  let selectedFerryStops = $derived(
    ferryStopIds.flatMap((id) => {
      const stop = allFerryStops.find((entry) => entry.id === id);
      return stop ? [stop] : [];
    })
  );
  let originMatches = $derived(
    (options?.origins ?? [])
      .filter((stop) => stop.name.toLowerCase().includes(originQuery.trim().toLowerCase()))
      .slice(0, 5)
  );
  let destinationMatches = $derived(
    (options?.destinations ?? [])
      .filter(
        (stop) =>
          !ferryStopIds.includes(stop.id) &&
          `${stop.islandName} ${stop.name}`.toLowerCase().includes(destinationQuery.trim().toLowerCase())
      )
      .slice(0, 5)
  );
  let distanceKm = $derived(
    mode === 'bus'
      ? (selectedRoute?.distanceKm ?? 0)
      : selectedFerryStops
          .slice(1)
          .reduce(
            (total, stop, index) =>
              total + transportDistanceKm(selectedFerryStops[index].coordinates, stop.coordinates),
            0
          )
  );
  let fleet = $derived(
    transportMinimumFleet(mode, distanceKm, Number(headwayMinutes), mode === 'bus' ? 20 : Number(speedKph))
  );
  let departures = $derived(
    transportDeparturesPerDirection(Number(startHour), Number(endHour), Number(headwayMinutes))
  );
  let capital = $derived(fleet * (mode === 'bus' ? 3_000_000 : 15_000_000));
  let annual = $derived(
    departures * 2 * distanceKm * Number(serviceDaysPerWeek) * (365 / 7) * (mode === 'bus' ? 30 : 100)
  );
  let modeAvailable = $derived(
    mode === 'bus'
      ? (options?.busRoutes.length ?? 0) > 0
      : (options?.origins.length ?? 0) > 0 && (options?.destinations.length ?? 0) > 0
  );
  let estimateReady = $derived(
    distanceKm > 0 &&
      fleet > 0 &&
      fleet <= 100 &&
      Number.isFinite(annual) &&
      departures > 0 &&
      typeof serviceDaysPerWeek === 'number' &&
      Number.isInteger(serviceDaysPerWeek) &&
      serviceDaysPerWeek >= 1 &&
      serviceDaysPerWeek <= 7 &&
      typeof startHour === 'number' &&
      Number.isInteger(startHour) &&
      startHour >= 0 &&
      typeof endHour === 'number' &&
      Number.isInteger(endHour) &&
      endHour <= 24 &&
      endHour > startHour &&
      typeof headwayMinutes === 'number' &&
      headwayMinutes >= 5 &&
      headwayMinutes <= 1440 &&
      (mode === 'bus' || (typeof speedKph === 'number' && speedKph >= 5 && speedKph <= 80))
  );

  function hourLabel(hour: number | undefined): string {
    return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 24
      ? `${String(hour).padStart(2, '0')}:00`
      : '—';
  }

  function applyOptions(result: ProposalTransportOptions): void {
    if (appliedOptions === result) return;
    appliedOptions = result;
    routeId = result.busRoutes[0]?.id ?? '';
    originStopId = result.origins[0]?.id ?? '';
    originQuery = result.origins[0]?.name ?? '';
    destinationStopId = '';
    destinationQuery = '';
    activeStopSearch = null;
    ferryStopIds = originStopId ? [originStopId] : [];
    baselineChainId = '';
  }

  function addFerryStop(): void {
    if (!destinationStopId || ferryStopIds.includes(destinationStopId)) return;
    ferryStopIds = [...ferryStopIds, destinationStopId];
    destinationStopId = '';
    destinationQuery = '';
    activeStopSearch = null;
  }

  function selectOriginStop(stopId: string): void {
    const stop = options?.origins.find((entry) => entry.id === stopId);
    if (!stop) return;
    originStopId = stop.id;
    originQuery = stop.name;
    ferryStopIds = [stop.id];
    activeStopSearch = null;
  }

  function selectDestinationStop(stopId: string): void {
    const stop = options?.destinations.find((entry) => entry.id === stopId);
    if (!stop) return;
    destinationStopId = stop.id;
    destinationQuery = `${stop.islandName} · ${stop.name}`;
    activeStopSearch = null;
  }

  function moveFerryStop(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    if (index < 1 || nextIndex < 1 || nextIndex >= ferryStopIds.length) return;
    const next = [...ferryStopIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    ferryStopIds = next;
  }

  function removeFerryStop(index: number): void {
    if (index < 1) return;
    ferryStopIds = ferryStopIds.filter((_, stopIndex) => stopIndex !== index);
  }

  function loadBaselineChain(): void {
    const chain = options?.baselineFerryChains.find((entry) => entry.routeId === baselineChainId);
    if (!chain || !originStopId) return;
    const ordered = chain.stopIds.filter((id) => allFerryStops.some((stop) => stop.id === id));
    const originIndex = ordered.indexOf(originStopId);
    if (originIndex < 0) ferryStopIds = [originStopId];
    else {
      const forward = ordered.slice(originIndex);
      const backward = ordered.slice(0, originIndex + 1).reverse();
      ferryStopIds = forward.length >= backward.length ? forward : backward;
    }
  }

  function applyInitialOperation(operation: ProposalTransportOperation): void {
    if (!options) return;
    const operationKey = `${options.islandId}:${JSON.stringify(operation)}`;
    if (appliedInitialOperationKey === operationKey) return;
    appliedInitialOperationKey = operationKey;
    mode = operation.kind === 'add_bus_service' ? 'bus' : 'ferry';
    headwayMinutes = operation.headwayMinutes;
    startHour = operation.startHour;
    endHour = operation.endHour;
    serviceDaysPerWeek = operation.serviceDaysPerWeek;
    if (operation.kind === 'add_bus_service') routeId = operation.routeId;
    else {
      speedKph = operation.speedKph;
      ferryStopIds =
        operation.stopIds ?? [operation.originStopId, operation.destinationStopId].filter((id): id is string => !!id);
      originStopId = ferryStopIds[0] ?? originStopId;
      originQuery = options.origins.find((stop) => stop.id === originStopId)?.name ?? '';
      destinationQuery = '';
      activeStopSearch = null;
    }
  }

  function retryOptions(): void {
    if (onLoadOptions) void onLoadOptions();
    else retry += 1;
  }

  $effect(() => {
    if (mode === 'ferry' && originStopId && ferryStopIds[0] !== originStopId) ferryStopIds = [originStopId];
  });

  $effect(() => {
    const islandId = selectedIslandId;
    void retry;
    const shared = providedOptions?.islandId === islandId ? providedOptions : null;
    if (onLoadOptions || shared) {
      options = shared;
      loading = providedLoading || (!shared && !providedError && pending);
      error = shared ? null : providedError;
      formError = null;
      if (shared) {
        applyOptions(shared);
        if (initialOperation) applyInitialOperation(initialOperation);
        else appliedInitialOperationKey = null;
      } else appliedOptions = null;
      // The workspace owns its in-flight request. Standalone use retains the fetch fallback below.
      if (!shared && !loading && !error && islandId) void onLoadOptions?.();
      return;
    }
    const controller = new AbortController();
    options = null;
    error = null;
    formError = null;
    loading = true;
    if (!islandId) {
      loading = false;
      return;
    }
    void (async () => {
      try {
        const response = await fetch(`${base}/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(islandId)}`, {
          signal: controller.signal
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Transport options could not be loaded.');
        if (controller.signal.aborted) return;
        const result = body as ProposalTransportOptions;
        if (result.islandId !== islandId)
          throw new Error('Transport options belong to a different island. Please try again.');
        options = result;
        applyOptions(result);
        if (initialOperation) applyInitialOperation(initialOperation);
        else appliedInitialOperationKey = null;
      } catch (failure) {
        if (!controller.signal.aborted)
          error = failure instanceof Error ? failure.message : 'Transport options could not be loaded.';
      } finally {
        if (!controller.signal.aborted) loading = false;
      }
    })();
    return () => controller.abort();
  });

  async function apply(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    formError = null;
    if (loading || pending || options?.islandId !== selectedIslandId) {
      formError = 'Wait for the selected island’s transport options to load before applying a transport change.';
      return;
    }
    const common = {
      operationId: initialOperation?.operationId ?? crypto.randomUUID(),
      headwayMinutes,
      startHour,
      endHour,
      serviceDaysPerWeek,
      vehicleCount: fleet
    };
    const operation =
      mode === 'bus'
        ? { ...common, kind: 'add_bus_service', routeId }
        : { ...common, kind: 'add_ferry_service', stopIds: ferryStopIds, speedKph };
    if (fleet > 100) {
      formError = 'This service needs more than 100 vehicles. Increase the headway or choose a shorter connection.';
      return;
    }
    const parsed = v.safeParse(proposalTransportOperationSchema, operation);
    if (
      !parsed.success ||
      !Number.isFinite(distanceKm) ||
      distanceKm <= 0 ||
      typeof startHour !== 'number' ||
      typeof endHour !== 'number' ||
      endHour <= startHour
    ) {
      formError =
        'Choose a route or at least two ordered landing places, valid service hours, a positive headway and 1–7 service days. End hour must be later than start hour.';
      return;
    }
    try {
      await onApplyTransport(parsed.output);
    } catch (failure) {
      formError = failure instanceof Error ? failure.message : 'The transport proposal could not be applied.';
    }
  }
</script>

<section class="transport-planner" aria-label="Plan bus and ferry services" aria-busy={loading || pending}>
  {#if !selectedIslandId}
    <p class="transport-state">Select an island to find its routes and landing places.</p>
  {:else if loading}
    <p class="transport-state" role="status">
      <LoaderCircle class="transport-loading-icon" size={16} aria-hidden="true" />
      Finding routes and landing places…
    </p>
  {:else if error}
    <Alert.Root variant="destructive" class="transport-alert">
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
    <Button type="button" variant="outline" class="transport-retry" onclick={retryOptions}>Try again</Button>
  {:else if options}
    <Field.FieldSet class="transport-mode-fieldset">
      <Field.Legend>Service type</Field.Legend>
      <Tabs.Root bind:value={mode} class="transport-mode-tabs">
        <Tabs.List aria-label="Transport service type">
          <Tabs.Trigger value="bus" disabled={pending}
            ><Bus data-icon="inline-start" aria-hidden="true" />Bus</Tabs.Trigger
          >
          <Tabs.Trigger value="ferry" disabled={pending}
            ><Ship data-icon="inline-start" aria-hidden="true" />Ferry</Tabs.Trigger
          >
        </Tabs.List>
      </Tabs.Root>
    </Field.FieldSet>
    <p class="transport-intro">
      {mode === 'bus' ? 'Add departures on an existing bus route.' : 'Connect two existing landing places, both ways.'}
    </p>
    {#if !modeAvailable}
      <Empty.Root class="transport-empty" role="status">
        <Empty.Header>
          <Empty.Media variant="icon"><Route aria-hidden="true" /></Empty.Media>
          <Empty.Title>{mode === 'bus' ? 'No mapped bus route' : 'No suitable ferry connection'}</Empty.Title>
          <Empty.Description>
            {mode === 'bus'
              ? `No recorded route serves ${options.islandName}. Select another island, or add a bus stop separately.`
              : 'A connection needs a recorded landing place here and on another island. Select another island to continue.'}
          </Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {:else}
      <form onsubmit={apply} aria-describedby={formError ? `${uid}-form-error` : undefined}>
        <Field.Group class="transport-form-fields">
          {#if mode === 'bus'}
            <Field.Field>
              <Field.Label for={`${uid}-route`}>Route & direction</Field.Label>
              <Select.Root type="single" bind:value={routeId} disabled={pending}>
                <Select.Trigger id={`${uid}-route`} class="transport-select">
                  <span>{selectedRoute?.name ?? 'Choose a route'}</span>
                </Select.Trigger>
                <Select.Content class="proposal-transport-options">
                  <Select.Group>
                    {#each options.busRoutes as route (route.id)}
                      <Select.Item
                        value={route.id}
                        label={`${route.name} · ${route.distanceKm.toFixed(1)} km`}
                        class="proposal-transport-option"
                      />
                    {/each}
                  </Select.Group>
                </Select.Content>
              </Select.Root>
              {#if selectedRoute}
                <Field.Description
                  >{selectedRoute.stopCount} mapped stops · {selectedRoute.distanceKm.toFixed(1)} km</Field.Description
                >
              {/if}
            </Field.Field>
          {:else}
            <div class="transport-endpoints">
              <Field.Field>
                <Field.Label for={`${uid}-origin`}>Start · {options.islandName}</Field.Label>
                <div class="transport-stop-search">
                  <Input
                    id={`${uid}-origin`}
                    class="transport-search-input"
                    bind:value={originQuery}
                    placeholder="Search landing place"
                    autocomplete="off"
                    disabled={pending}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={activeStopSearch === 'origin'}
                    aria-controls={`${uid}-origin-options`}
                    onfocus={() => (activeStopSearch = 'origin')}
                    oninput={() => {
                      activeStopSearch = 'origin';
                      originStopId = '';
                      ferryStopIds = [];
                    }}
                    onblur={() => setTimeout(() => (activeStopSearch = null), 120)}
                  />
                  {#if activeStopSearch === 'origin'}
                    <div
                      id={`${uid}-origin-options`}
                      class="transport-stop-suggestions"
                      role="listbox"
                      aria-label="Start landing places"
                    >
                      {#each originMatches as stop (stop.id)}
                        <button
                          type="button"
                          role="option"
                          aria-selected={originStopId === stop.id}
                          onpointerdown={(event) => {
                            event.preventDefault();
                            selectOriginStop(stop.id);
                          }}>{stop.name}</button
                        >
                      {:else}
                        <p>No landing places found</p>
                      {/each}
                    </div>
                  {/if}
                </div>
              </Field.Field>
              {#if options.baselineFerryChains.length}
                <Field.Field>
                  <Field.Label for={`${uid}-baseline-chain`}>Copy existing island chain</Field.Label>
                  <div class="transport-chain-picker">
                    <Select.Root type="single" bind:value={baselineChainId} disabled={pending}>
                      <Select.Trigger id={`${uid}-baseline-chain`} class="transport-select">
                        <span
                          >{options.baselineFerryChains.find((chain) => chain.routeId === baselineChainId)?.routeName ??
                            'Choose existing route'}</span
                        >
                      </Select.Trigger>
                      <Select.Content class="proposal-transport-options">
                        <Select.Group>
                          {#each options.baselineFerryChains as chain (chain.routeId)}
                            <Select.Item
                              value={chain.routeId}
                              label={chain.routeName}
                              class="proposal-transport-option"
                            />
                          {/each}
                        </Select.Group>
                      </Select.Content>
                    </Select.Root>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!baselineChainId || pending}
                      onclick={loadBaselineChain}>Copy</Button
                    >
                  </div>
                </Field.Field>
              {/if}
              <Field.Field>
                <Field.Label for={`${uid}-destination`}>Add next island</Field.Label>
                <div class="transport-chain-picker">
                  <div class="transport-stop-search">
                    <Input
                      id={`${uid}-destination`}
                      class="transport-search-input"
                      bind:value={destinationQuery}
                      placeholder="Search island or landing place"
                      autocomplete="off"
                      disabled={pending}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={activeStopSearch === 'destination'}
                      aria-controls={`${uid}-destination-options`}
                      onfocus={() => (activeStopSearch = 'destination')}
                      oninput={() => {
                        activeStopSearch = 'destination';
                        destinationStopId = '';
                      }}
                      onblur={() => setTimeout(() => (activeStopSearch = null), 120)}
                    />
                    {#if activeStopSearch === 'destination'}
                      <div
                        id={`${uid}-destination-options`}
                        class="transport-stop-suggestions"
                        role="listbox"
                        aria-label="Destination landing places"
                      >
                        {#each destinationMatches as stop (stop.id)}
                          <button
                            type="button"
                            role="option"
                            aria-selected={destinationStopId === stop.id}
                            onpointerdown={(event) => {
                              event.preventDefault();
                              selectDestinationStop(stop.id);
                            }}>{stop.islandName} · {stop.name}</button
                          >
                        {:else}
                          <p>No landing places found</p>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <Button
                    class="transport-add-button"
                    type="button"
                    disabled={!destinationStopId || pending}
                    onclick={addFerryStop}>Add</Button
                  >
                </div>
              </Field.Field>
            </div>
            {#if selectedFerryStops.length}
              <ol class="transport-chain" aria-label="Ordered ferry island chain">
                {#each selectedFerryStops as stop, index (stop.id)}
                  <li>
                    <span>{index + 1}</span>
                    <strong>{stop.islandName}</strong>
                    <small>{stop.name}</small>
                    {#if index > 0}
                      <Tooltip.Provider delayDuration={250}>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={index === 1 || pending}
                                aria-label={`Move ${stop.islandName} earlier`}
                                onclick={() => moveFerryStop(index, -1)}><ArrowUp /></Button
                              >
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>Move earlier</Tooltip.Content>
                        </Tooltip.Root>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={index === selectedFerryStops.length - 1 || pending}
                                aria-label={`Move ${stop.islandName} later`}
                                onclick={() => moveFerryStop(index, 1)}><ArrowDown /></Button
                              >
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>Move later</Tooltip.Content>
                        </Tooltip.Root>
                        <Tooltip.Root>
                          <Tooltip.Trigger>
                            {#snippet child({ props })}
                              <Button
                                {...props}
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={pending}
                                aria-label={`Remove ${stop.islandName}`}
                                onclick={() => removeFerryStop(index)}><Trash2 /></Button
                              >
                            {/snippet}
                          </Tooltip.Trigger>
                          <Tooltip.Content>Remove stop</Tooltip.Content>
                        </Tooltip.Root>
                      </Tooltip.Provider>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          {/if}
          <div class="transport-fields">
            <Field.Field>
              <Field.Label for={`${uid}-headway`}>Departure interval</Field.Label>
              <div class="transport-input-unit">
                <Input
                  id={`${uid}-headway`}
                  type="number"
                  bind:value={headwayMinutes}
                  min={5}
                  max={1440}
                  step="any"
                  required
                  disabled={pending}
                  aria-describedby={`${uid}-headway-unit`}
                />
                <span id={`${uid}-headway-unit`}>min</span>
              </div>
            </Field.Field>
            <Field.Field>
              <Field.Label for={`${uid}-days`}>Days per week</Field.Label>
              <div class="transport-input-unit">
                <Input
                  id={`${uid}-days`}
                  type="number"
                  bind:value={serviceDaysPerWeek}
                  min={1}
                  max={7}
                  step={1}
                  required
                  disabled={pending}
                  aria-describedby={`${uid}-days-unit`}
                />
                <span id={`${uid}-days-unit`}>1–7 days</span>
              </div>
            </Field.Field>
          </div>
        </Field.Group>
        <Accordion.Root type="multiple" bind:value={openAccordion} class="transport-accordion">
          <Accordion.Item value="operating">
            <Accordion.Trigger>
              <span class="transport-accordion-label"
                ><strong>Operating hours{mode === 'ferry' ? ' & speed' : ''}</strong><small
                  >{hourLabel(startHour)}–{hourLabel(endHour)} MVT{mode === 'ferry'
                    ? ` · ${speedKph ?? '—'} km/h`
                    : ''}</small
                ></span
              >
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="transport-advanced-fields">
                <div class="transport-fields">
                  <Field.Field>
                    <Field.Label for={`${uid}-start`}>First departure hour</Field.Label>
                    <Input
                      id={`${uid}-start`}
                      type="number"
                      bind:value={startHour}
                      min={0}
                      max={23}
                      step={1}
                      required
                      disabled={pending}
                      aria-describedby={`${uid}-operating-note`}
                      oninvalid={() => (openAccordion = [...new Set([...openAccordion, 'operating'])])}
                    />
                  </Field.Field>
                  <Field.Field>
                    <Field.Label for={`${uid}-end`}>Departures end before</Field.Label>
                    <Input
                      id={`${uid}-end`}
                      type="number"
                      bind:value={endHour}
                      min={1}
                      max={24}
                      step={1}
                      required
                      disabled={pending}
                      aria-describedby={`${uid}-operating-note`}
                      oninvalid={() => (openAccordion = [...new Set([...openAccordion, 'operating'])])}
                    />
                  </Field.Field>
                </div>
                <p id={`${uid}-operating-note`} class="transport-note">
                  Whole hours, Maldives time. The end hour is excluded.
                </p>
                {#if mode === 'ferry'}
                  <Field.Field>
                    <Field.Label for={`${uid}-speed`}>Sailing speed · km/h</Field.Label>
                    <Input
                      id={`${uid}-speed`}
                      type="number"
                      bind:value={speedKph}
                      min={5}
                      max={80}
                      step="any"
                      required
                      disabled={pending}
                      aria-describedby={`${uid}-speed-note`}
                      oninvalid={() => (openAccordion = [...new Set([...openAccordion, 'operating'])])}
                    />
                    <Field.Description id={`${uid}-speed-note`}>Between 5 and 80 km/h.</Field.Description>
                  </Field.Field>
                {/if}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
        {#if estimateReady}
          <div class="transport-estimate" aria-live="polite" aria-atomic="true">
            <div class="transport-estimate-heading">
              <strong>Estimated service</strong><Badge variant="secondary">{mode === 'ferry' ? 'Ferry' : 'Bus'}</Badge>
            </div>
            <dl class="transport-service-summary">
              <div>
                <dt>{mode === 'ferry' ? 'Direct distance' : 'Route distance'}</dt>
                <dd>{distanceKm.toFixed(2)} <small>km</small></dd>
              </div>
              <div>
                <dt>{mode === 'ferry' ? 'Each way / day' : 'Departures / day'}</dt>
                <dd>{departures}</dd>
              </div>
              <div>
                <dt>Required fleet</dt>
                <dd>
                  {fleet}
                  <small>{mode === 'bus' ? (fleet === 1 ? 'bus' : 'buses') : fleet === 1 ? 'ferry' : 'ferries'}</small>
                </dd>
              </div>
            </dl>
            <dl class="transport-cost-summary">
              <div>
                <dt>Upfront allowance</dt>
                <dd>{formatProposalMoney(capital)}</dd>
              </div>
              <div>
                <dt>Annual running</dt>
                <dd>{formatProposalMoney(annual)}</dd>
              </div>
            </dl>
          </div>
        {:else if fleet > 100}
          <p class="transport-error" role="alert">
            This service needs more than 100 vehicles. Increase the interval or choose a shorter route.
          </p>
        {/if}
        {#if formError}
          <Alert.Root id={`${uid}-form-error`} variant="destructive" class="transport-alert"
            ><Alert.Description>{formError}</Alert.Description></Alert.Root
          >
        {/if}
        <Button
          type="submit"
          class="transport-apply"
          disabled={pending || distanceKm <= 0 || fleet === 0 || fleet > 100}
        >
          {#if pending}<LoaderCircle
              class="transport-loading-icon"
              data-icon="inline-start"
              aria-hidden="true"
            />Applying service…
          {:else}Add {mode === 'bus' ? 'bus service' : 'ferry connection'}{/if}
        </Button>
        <p class="transport-note transport-scope">
          {mode === 'bus'
            ? 'Adds departures in this direction. Existing service stays.'
            : 'Outward and return service. Existing landing places only.'}
        </p>
      </form>
    {/if}
    <p class="transport-baseline-note">Current timetable unavailable · waiting-time savings unknown.</p>
  {/if}
</section>

<style>
  .transport-planner {
    display: grid;
    gap: 10px;
    min-width: 0;
    color: var(--mobility-ink);
  }
  .transport-chain-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.45rem;
  }
  .transport-stop-search {
    position: relative;
    min-width: 0;
    width: 100%;
  }
  :global(.transport-search-input) {
    width: 100%;
    height: 2.25rem;
    border-color: var(--mobility-border-strong);
    border-radius: 0.5rem;
    background: #ffffff;
    color: var(--mobility-text);
    font-size: 0.8rem;
  }
  :global(.transport-search-input::placeholder) {
    color: var(--mobility-muted);
  }
  :global(.transport-search-input:focus-visible) {
    border-color: var(--mobility-focus);
    outline: none;
    box-shadow: 0 0 0 3px rgb(24 24 27 / 12%);
  }
  .transport-stop-suggestions {
    position: absolute;
    z-index: 10;
    top: calc(100% + 0.35rem);
    right: 0;
    left: 0;
    display: grid;
    max-height: 14rem;
    overflow: auto;
    gap: 0.15rem;
    padding: 0.3rem;
    border: 1px solid var(--mobility-border-strong);
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: var(--mobility-shadow-panel);
  }
  .transport-stop-suggestions button {
    min-height: 2.1rem;
    padding: 0.45rem 0.65rem;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    color: var(--mobility-text);
    text-align: left;
  }
  .transport-stop-suggestions button:hover,
  .transport-stop-suggestions button:focus-visible {
    background: var(--mobility-surface-muted);
    outline: none;
  }
  .transport-stop-suggestions p {
    margin: 0;
    padding: 0.5rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .transport-chain {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .transport-chain li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-small);
    padding: 0.4rem;
  }
  .transport-chain li > span {
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    font-size: 0.65rem;
    font-weight: 800;
  }
  .transport-chain li > strong {
    min-width: 0;
    font-size: var(--mobility-text-sm);
  }
  .transport-chain li > small {
    color: var(--mobility-muted);
  }
  .transport-intro,
  .transport-note,
  .transport-baseline-note {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-intro {
    margin-top: -2px;
  }
  .transport-state {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 10px 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  form {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .transport-planner :global(.transport-form-fields) {
    gap: 12px;
  }
  .transport-planner :global([data-slot='field']) {
    gap: 5px;
    min-width: 0;
  }
  .transport-planner :global([data-slot='field-label']) {
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-tight);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .transport-planner :global([data-slot='field-description']) {
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-endpoints {
    display: grid;
    gap: 10px;
  }
  .transport-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .transport-planner :global([data-slot='input']) {
    min-height: 40px;
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-variant-numeric: tabular-nums;
  }
  .transport-input-unit {
    position: relative;
  }
  .transport-input-unit :global(input) {
    padding-right: 46px;
  }
  .transport-input-unit > span {
    position: absolute;
    top: 50%;
    right: 28px;
    transform: translateY(-50%);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    pointer-events: none;
  }
  .transport-planner :global(.transport-select) {
    width: 100%;
    min-width: 0;
    height: 2rem;
    min-height: 2rem;
    gap: 8px;
    border-color: var(--mobility-border-strong);
    border-radius: 0.38rem;
    background: #ffffff;
    color: var(--mobility-text);
    white-space: normal;
    text-align: left;
    font-size: 0.68rem;
    font-weight: 650;
    line-height: var(--mobility-leading-normal);
  }
  .transport-planner :global(.transport-select:focus-visible) {
    border-color: var(--mobility-focus);
    background: #ffffff;
    box-shadow: 0 0 0 3px rgb(9 9 11 / 16%);
  }
  :global(.transport-add-button) {
    height: 2.25rem;
    min-height: 2.25rem;
    min-width: 4.25rem;
    border-color: var(--mobility-accent);
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
  }
  :global(.transport-add-button:hover:not(:disabled)) {
    border-color: var(--mobility-accent-hover);
    background: var(--mobility-accent-hover);
    color: var(--mobility-on-accent);
  }
  .transport-planner :global(.transport-select > span) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  :global(.proposal-transport-options) {
    --background: var(--mobility-surface);
    --foreground: var(--mobility-ink);
    --popover: var(--mobility-surface);
    --popover-foreground: var(--mobility-ink);
    --accent: var(--mobility-accent-soft);
    --accent-foreground: var(--mobility-accent);
    --muted: var(--mobility-surface-muted);
    --muted-foreground: var(--mobility-muted);
    --border: var(--mobility-border);
    --ring: var(--mobility-accent);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-muted-foreground: var(--mobility-muted);
    --color-border: var(--mobility-border);
    --color-ring: var(--mobility-accent);
    --color-foreground: var(--mobility-ink);
    width: var(--bits-select-anchor-width);
    max-width: min(28rem, calc(100vw - 24px));
    max-height: min(22rem, var(--bits-select-content-available-height, calc(100dvh - 2rem)));
    border-radius: var(--mobility-radius-card);
    box-shadow: var(--mobility-shadow-panel);
    color-scheme: light;
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
  }
  :global(.proposal-transport-option) {
    min-height: 40px;
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: var(--mobility-text-sm);
  }
  .transport-advanced-fields {
    display: grid;
    gap: 10px;
    padding: 4px 0 12px;
  }
  .transport-estimate {
    display: grid;
    gap: 10px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    padding: 10px;
    background: var(--mobility-surface-muted);
    animation: transport-estimate-enter var(--mobility-duration-enter) var(--mobility-ease);
  }
  .transport-estimate dl {
    display: grid;
    min-width: 0;
    gap: 8px;
    margin: 0;
  }
  .transport-service-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .transport-estimate dl > div {
    min-width: 0;
  }
  .transport-estimate dt {
    margin-bottom: 4px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-estimate dd {
    margin: 0;
    font-size: var(--mobility-text-lg);
    line-height: var(--mobility-leading-tight);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.025em;
    overflow-wrap: anywhere;
  }
  .transport-estimate dd small {
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
    letter-spacing: 0;
  }
  .transport-cost-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-top: 9px;
    border-top: 1px solid var(--mobility-border);
  }
  .transport-cost-summary dd {
    font-size: var(--mobility-text-sm);
    letter-spacing: -0.015em;
  }
  .transport-planner :global(.transport-apply),
  .transport-planner :global(.transport-retry) {
    min-height: 40px;
    font-size: var(--mobility-text-sm);
  }
  .transport-planner :global(.transport-retry) {
    justify-self: start;
  }
  .transport-scope {
    margin-top: -6px;
  }
  .transport-baseline-note {
    font-size: var(--mobility-text-xs);
  }
  .transport-planner :global(.transport-alert [data-slot='alert-description']) {
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-error {
    margin: 0;
    color: var(--mobility-danger-ink);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-planner :global(.transport-loading-icon) {
    flex: 0 0 auto;
    animation: transport-spin 1s linear infinite;
  }
  :global(.transport-mode-fieldset) {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }
  :global(.transport-mode-fieldset) :global([data-slot='field-legend']) {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  :global(.transport-mode-fieldset) :global([data-slot='toggle-group']) {
    width: 100%;
  }
  :global(.transport-mode-fieldset) :global([data-slot='toggle-group-item']) {
    flex: 1 1 0;
    justify-content: center;
  }
  .transport-chain li {
    position: relative;
    grid-template-columns: 1.4rem minmax(0, 1fr) auto auto auto;
    border: 0;
    border-radius: 0;
    padding-inline: 0;
  }
  .transport-chain li:not(:last-child)::after {
    position: absolute;
    top: 1.7rem;
    bottom: -0.35rem;
    left: 0.6rem;
    width: 1px;
    background: var(--mobility-border);
    content: '';
  }
  .transport-chain li > small {
    grid-column: 2;
    margin-top: -0.2rem;
    font-size: var(--mobility-text-xs);
  }
  .transport-chain li > :global(button) {
    z-index: 1;
  }
  :global(.transport-accordion) {
    border-block: 1px solid var(--mobility-border);
  }
  :global(.transport-accordion) :global([data-slot='accordion-trigger']) {
    min-height: 2.5rem;
    width: 100%;
    padding-inline: 0;
    border-radius: 0;
  }
  .transport-accordion-label {
    display: grid;
    gap: 0.15rem;
  }
  .transport-accordion-label strong {
    font-size: var(--mobility-text-xs);
  }
  .transport-accordion-label small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  :global(.transport-accordion) :global([data-slot='accordion-content']) {
    color: var(--mobility-muted);
  }
  :global(.transport-mode-tabs [data-slot='tabs-list']) {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  :global(.proposal-workspace .proposal-section .transport-mode-tabs [data-slot='tabs-list']) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  :global(.transport-mode-tabs) {
    display: block;
    width: 100%;
  }
  :global(.transport-mode-tabs [data-slot='tabs-trigger']) {
    display: inline-flex;
    width: 100%;
    min-height: 2rem;
    min-width: 0;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--mobility-radius-small);
    color: var(--mobility-muted);
  }
  :global(.transport-mode-tabs [data-slot='tabs-trigger'][data-state='active']) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    box-shadow: var(--mobility-shadow-card);
  }
  :global(.transport-mode-tabs [data-slot='tabs-trigger']:hover) {
    color: var(--mobility-ink);
  }
  .transport-estimate {
    border: 0;
    border-radius: 0;
    border-top: 1px solid var(--mobility-border);
    padding: 0.8rem 0 0;
    background: transparent;
  }
  .transport-estimate-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .transport-estimate-heading strong {
    font-size: var(--mobility-text-xs);
  }
  .transport-estimate-heading :global([data-slot='badge']) {
    font-size: var(--mobility-text-xs);
  }
  @keyframes transport-estimate-enter {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes transport-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .transport-planner :global(.transport-select:hover:not(:disabled)) {
      background: color-mix(in srgb, var(--mobility-surface-muted) 45%, transparent);
    }
  }
  @media (max-width: 640px) {
    .transport-planner :global([data-slot='input']) {
      font-size: var(--mobility-text-lg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .transport-estimate,
    .transport-planner :global(.transport-loading-icon) {
      animation: none;
    }
    .transport-planner :global([data-slot='toggle-group-item']) {
      transition: none;
    }
  }
  .transport-planner {
    color-scheme: light;
  }
</style>
