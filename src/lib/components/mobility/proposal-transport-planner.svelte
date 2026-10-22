<script lang="ts">
  import type { ProposalTransportOperation, ProposalTransportOptions } from '$lib/mobility/proposal-transport';

  import Bus from '@lucide/svelte/icons/bus';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Ship from '@lucide/svelte/icons/ship';
  import * as v from 'valibot';

  import { formatProposalMoney } from '$lib/mobility/proposal-planning';
  import {
    proposalTransportOperationSchema,
    transportDeparturesPerDirection,
    transportDistanceKm,
    transportMinimumFleet
  } from '$lib/mobility/proposal-transport';

  import * as Alert from '$components/ui/alert';
  import { Button } from '$components/ui/button';
  import * as Field from '$components/ui/field';
  import { Input } from '$components/ui/input';
  import * as Select from '$components/ui/select';

  let {
    selectedIslandId,
    pending = false,
    providedOptions = null,
    providedLoading = false,
    providedError = null,
    onLoadOptions,
    onPreviewTransport
  }: {
    selectedIslandId: string;
    pending?: boolean;
    providedOptions?: ProposalTransportOptions | null;
    providedLoading?: boolean;
    providedError?: string | null;
    onLoadOptions?: () => Promise<void>;
    onPreviewTransport: (operation: ProposalTransportOperation) => void | Promise<void>;
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
  let headwayMinutes = $state<number | undefined>(60);
  let startHour = $state<number | undefined>(6);
  let endHour = $state<number | undefined>(22);
  let serviceDaysPerWeek = $state<number | undefined>(7);
  let speedKph = $state<number | undefined>(30);
  let operatingHoursOpen = $state(false);
  let selectedRoute = $derived(options?.busRoutes.find((route) => route.id === routeId));
  let origin = $derived(options?.origins.find((stop) => stop.id === originStopId));
  let destination = $derived(options?.destinations.find((stop) => stop.id === destinationStopId));
  let distanceKm = $derived(
    mode === 'bus'
      ? (selectedRoute?.distanceKm ?? 0)
      : origin && destination
        ? transportDistanceKm(origin.coordinates, destination.coordinates)
        : 0
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
    destinationStopId = '';
  }

  function retryOptions(): void {
    if (onLoadOptions) void onLoadOptions();
    else retry += 1;
  }

  $effect(() => {
    const islandId = selectedIslandId;
    void retry;
    const shared = providedOptions?.islandId === islandId ? providedOptions : null;
    if (onLoadOptions || shared) {
      options = shared;
      loading = providedLoading || (!shared && !providedError && pending);
      error = shared ? null : providedError;
      formError = null;
      if (shared) applyOptions(shared);
      else appliedOptions = null;
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
        const response = await fetch(`/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(islandId)}`, {
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
      } catch (failure) {
        if (!controller.signal.aborted)
          error = failure instanceof Error ? failure.message : 'Transport options could not be loaded.';
      } finally {
        if (!controller.signal.aborted) loading = false;
      }
    })();
    return () => controller.abort();
  });

  async function preview(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    formError = null;
    if (loading || pending || options?.islandId !== selectedIslandId) {
      formError = 'Wait for the selected island’s transport options to load before previewing.';
      return;
    }
    const common = {
      operationId: crypto.randomUUID(),
      headwayMinutes,
      startHour,
      endHour,
      serviceDaysPerWeek,
      vehicleCount: fleet
    };
    const operation =
      mode === 'bus'
        ? { ...common, kind: 'add_bus_service', routeId }
        : { ...common, kind: 'add_ferry_service', originStopId, destinationStopId, speedKph };
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
        'Choose a route or both landing places, valid service hours, a positive headway and 1–7 service days. End hour must be later than start hour.';
      return;
    }
    try {
      await onPreviewTransport(parsed.output);
    } catch (failure) {
      formError = failure instanceof Error ? failure.message : 'The transport proposal could not be previewed.';
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
    <div class="transport-modes" role="group" aria-label="Transport service type">
      <Button
        type="button"
        variant="ghost"
        class="transport-mode"
        aria-pressed={mode === 'bus'}
        disabled={pending}
        onclick={() => {
          mode = 'bus';
          formError = null;
        }}><Bus data-icon="inline-start" aria-hidden="true" />Bus</Button
      >
      <Button
        type="button"
        variant="ghost"
        class="transport-mode"
        aria-pressed={mode === 'ferry'}
        disabled={pending}
        onclick={() => {
          mode = 'ferry';
          formError = null;
        }}><Ship data-icon="inline-start" aria-hidden="true" />Ferry</Button
      >
    </div>
    <p class="transport-intro">
      {mode === 'bus' ? 'Add departures on an existing bus route.' : 'Connect two existing landing places, both ways.'}
    </p>
    {#if !modeAvailable}
      <div class="transport-empty" role="status">
        <strong>{mode === 'bus' ? 'No mapped bus route' : 'No suitable ferry connection'}</strong>
        <p>
          {mode === 'bus'
            ? `No recorded route serves ${options.islandName}. Select another island, or add a bus stop separately.`
            : 'A connection needs a recorded landing place here and on another island. Select another island to continue.'}
        </p>
      </div>
    {:else}
      <form onsubmit={preview}>
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
                <Field.Label for={`${uid}-origin`}>From · {options.islandName}</Field.Label>
                <Select.Root type="single" bind:value={originStopId} disabled={pending}>
                  <Select.Trigger id={`${uid}-origin`} class="transport-select">
                    <span>{origin?.name ?? 'Choose a landing place'}</span>
                  </Select.Trigger>
                  <Select.Content class="proposal-transport-options">
                    <Select.Group>
                      {#each options.origins as stop (stop.id)}
                        <Select.Item value={stop.id} label={stop.name} class="proposal-transport-option" />
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              </Field.Field>
              <Field.Field>
                <Field.Label for={`${uid}-destination`}>To · destination landing</Field.Label>
                <Select.Root type="single" bind:value={destinationStopId} disabled={pending}>
                  <Select.Trigger id={`${uid}-destination`} class="transport-select">
                    <span
                      >{destination ? `${destination.islandName} · ${destination.name}` : 'Choose a destination'}</span
                    >
                  </Select.Trigger>
                  <Select.Content class="proposal-transport-options">
                    <Select.Group>
                      {#each options.destinations as stop (stop.id)}
                        <Select.Item
                          value={stop.id}
                          label={`${stop.islandName} · ${stop.name}`}
                          class="proposal-transport-option"
                        />
                      {/each}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              </Field.Field>
            </div>
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
                />
                <span aria-hidden="true">/ 7</span>
              </div>
            </Field.Field>
          </div>
        </Field.Group>
        <details class="transport-operating" bind:open={operatingHoursOpen}>
          <summary>
            <span
              ><strong>Operating hours{mode === 'ferry' ? ' & speed' : ''}</strong><small
                >{hourLabel(startHour)}–{hourLabel(endHour)} MVT{mode === 'ferry'
                  ? ` · ${speedKph ?? '—'} km/h`
                  : ''}</small
              ></span
            >
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
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
                  oninvalid={() => (operatingHoursOpen = true)}
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
                  oninvalid={() => (operatingHoursOpen = true)}
                />
              </Field.Field>
            </div>
            <p class="transport-note">Whole hours, Maldives time. The end hour is excluded.</p>
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
                  oninvalid={() => (operatingHoursOpen = true)}
                />
              </Field.Field>
            {/if}
          </div>
        </details>
        {#if estimateReady}
          <div class="transport-estimate" aria-live="polite" aria-atomic="true">
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
          <Alert.Root variant="destructive" class="transport-alert"
            ><Alert.Description>{formError}</Alert.Description></Alert.Root
          >
        {/if}
        <Button
          type="submit"
          class="transport-preview"
          disabled={pending || distanceKm <= 0 || fleet === 0 || fleet > 100}
        >
          {#if pending}<LoaderCircle
              class="transport-loading-icon"
              data-icon="inline-start"
              aria-hidden="true"
            />Checking service…
          {:else}Preview {mode === 'bus' ? 'bus service' : 'ferry connection'}{/if}
        </Button>
        <p class="transport-note transport-scope">
          {mode === 'bus'
            ? 'Adds departures in this direction. Existing service stays.'
            : 'Outward and return service. Existing landing places only.'}
        </p>
      </form>
    {/if}
    <p class="transport-baseline-note">Current timetable unavailable · waiting-time savings unknown.</p>
    <details class="transport-assumptions">
      <summary><span>Assumptions & evidence</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <p>These are proposed schedules. A frequency upgrade cannot be verified against the retained baseline.</p>
      <ul>
        {#each options.assumptions as assumption (assumption)}<li>{assumption}</li>{/each}
      </ul>
      {#if mode === 'ferry'}<p>
          Cost and fleet estimates use direct endpoint distance. Accepted map geometry avoids mapped island land; reefs,
          navigation and landing permissions require review. Actual sailing distance and cost may be higher.
        </p>{/if}
    </details>
  {/if}
</section>

<style>
  .transport-planner {
    display: grid;
    gap: 10px;
    min-width: 0;
    color: var(--mobility-ink);
  }
  .transport-intro,
  .transport-note,
  .transport-baseline-note {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .transport-modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  .transport-planner :global(.transport-mode) {
    min-height: 40px;
    gap: 7px;
    border-radius: var(--mobility-radius-small);
    font-size: var(--mobility-text-sm);
  }
  .transport-planner :global(.transport-mode[aria-pressed='true']) {
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    box-shadow: var(--mobility-shadow-card);
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
  .transport-empty {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px dashed var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .transport-empty strong {
    font-weight: var(--mobility-font-weight-semibold);
  }
  .transport-empty p {
    margin: 0;
    color: var(--mobility-muted);
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
    height: auto;
    min-height: 40px;
    gap: 8px;
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    white-space: normal;
    text-align: left;
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
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
  .transport-operating {
    border-block: 1px solid var(--mobility-border);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 40px;
    list-style: none;
    cursor: pointer;
    border-radius: var(--mobility-radius-small);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary > span {
    display: grid;
    gap: 2px;
  }
  summary :global(svg) {
    flex: 0 0 auto;
    color: var(--mobility-muted);
    transition: transform var(--mobility-duration-fast) var(--mobility-ease);
  }
  details[open] > summary :global(svg) {
    transform: rotate(180deg);
  }
  summary strong {
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  summary small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 3px;
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
  .transport-planner :global(.transport-preview),
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
  .transport-assumptions {
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
    color: var(--mobility-muted);
  }
  .transport-assumptions > summary {
    min-height: 40px;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
  }
  .transport-assumptions p {
    margin: 0 0 8px;
  }
  .transport-assumptions ul {
    margin: 0 0 10px;
    padding-left: 18px;
  }
  .transport-assumptions li + li {
    margin-top: 6px;
  }
  .transport-planner :global(.transport-loading-icon) {
    flex: 0 0 auto;
    animation: transport-spin 1s linear infinite;
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
    summary:hover {
      color: var(--mobility-ink);
      background: color-mix(in srgb, var(--mobility-surface-muted) 50%, transparent);
    }
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
    summary :global(svg),
    .transport-planner :global(.transport-mode) {
      transition: none;
    }
  }
</style>
