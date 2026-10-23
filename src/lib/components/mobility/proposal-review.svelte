<script lang="ts">
  import type { IslandMapService } from './island-services';
  import type { ProposalCosts, ProposalImpact, ProposalSettings } from '$lib/mobility/proposal-planning';
  import type { ProposalTransportPlan } from '$lib/mobility/proposal-transport';
  import type { ScenarioOperation } from '$lib/mobility/scenario-contracts';

  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import FileText from '@lucide/svelte/icons/file-text';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';

  import { PROPOSAL_COST_SOURCES } from '$lib/mobility/proposal-planning';

  import * as Alert from '$components/ui/alert';
  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Dialog from '$components/ui/dialog';

  import ProposalCostCharts from './proposal-cost-charts.svelte';
  import ProposalImpactCharts from './proposal-impact-charts.svelte';

  type Props = {
    open?: boolean;
    settings: ProposalSettings;
    costs: ProposalCosts | null;
    impact: ProposalImpact | null;
    operations: readonly ScenarioOperation[];
    transportPlans?: readonly ProposalTransportPlan[];
    services: readonly IslandMapService[];
    current?: boolean;
    pending?: boolean;
    exporting?: boolean;
    error?: string | null;
    onDownloadPdf?: () => void;
    onRefresh?: () => void;
    onSelectService?: (service: IslandMapService) => void;
    onSelectOperation?: (operationId: string) => void;
  };
  let {
    open = $bindable(false),
    settings,
    costs,
    impact,
    operations,
    transportPlans = [],
    services,
    current = false,
    pending = false,
    exporting = false,
    error = null,
    onDownloadPdf = () => {},
    onRefresh = () => {},
    onSelectService = () => {},
    onSelectOperation = () => {}
  }: Props = $props();
  let reviewTitle = $state<HTMLDivElement | null>(null);
  const canExport = $derived(current && !pending && !exporting && !!costs?.complete && costs.withinBudget && !!impact);
  const limitations = $derived([
    ...new Set([
      ...(costs?.limitations ?? []),
      ...(impact?.limitations ?? []),
      ...transportPlans.flatMap((plan) => plan.assumptions)
    ])
  ]);
  const sources = $derived(
    PROPOSAL_COST_SOURCES.filter((source) => costs?.items.some((item) => item.sourceIds.includes(source.id)))
  );
  const moneyFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const figureFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
  function money(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'Unavailable' : moneyFormatter.format(value);
  }
  function figure(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'Unavailable' : figureFormatter.format(value);
  }
  function showOnMap(serviceId: string, operationId: string): void {
    const service = services.find((entry) => entry.id === serviceId);
    if (service) {
      open = false;
      onSelectService(service);
    } else if (transportPlans.some((plan) => plan.operationId === operationId)) {
      open = false;
      onSelectOperation(operationId);
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="proposal-review-dialog"
    showCloseButton={true}
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      reviewTitle?.focus({ preventScroll: true });
    }}
  >
    <Dialog.Header class="proposal-review-header"
      ><div class="proposal-review-eyebrow">
        <FileText size={15} aria-hidden="true" />Decision brief<Badge variant="outline">Draft proposal</Badge>
      </div>
      <Dialog.Title bind:ref={reviewTitle} tabindex={-1} class="proposal-review-title"
        >{settings.name.trim() || 'Community investment proposal'}</Dialog.Title
      ><Dialog.Description class="proposal-review-description"
        >{operations.length} accepted {operations.length === 1 ? 'change' : 'changes'} · MVR planning estimates · baseline
        and proposed demand</Dialog.Description
      ></Dialog.Header
    >
    <div class="proposal-review-body">
      {#if error}<Alert.Root variant="destructive"
          ><Alert.Title>Review needs attention</Alert.Title><Alert.Description>{error}</Alert.Description></Alert.Root
        >{/if}
      {#if !current || pending}<Alert.Root class="proposal-review-stale"
          ><Alert.Title>{pending ? 'Updating this proposal' : 'Previous result'}</Alert.Title><Alert.Description
            >{pending
              ? 'The last calculated result remains below while the current proposal is evaluated.'
              : 'The proposal has changed since this result was calculated. Refresh it to enable PDF export.'}<Button
              variant="outline"
              size="sm"
              disabled={pending}
              onclick={onRefresh}
              >{#if pending}<LoaderCircle
                  size={14}
                  class="proposal-review-spinner"
                  aria-hidden="true"
                />{:else}<RefreshCw size={14} aria-hidden="true" />{/if}{pending
                ? 'Calculating…'
                : 'Refresh impact'}</Button
            ></Alert.Description
          ></Alert.Root
        >{/if}
      <section class="proposal-review-section" aria-label="Proposal cost summary">
        <div class="proposal-review-section-title">
          <span>01</span>
          <h3>Funding the proposal</h3>
          {#if costs?.withinBudget}<Badge variant="outline"><Check size={11} aria-hidden="true" />Within limits</Badge
            >{/if}
        </div>
        {#if costs && !costs.complete}<p class="proposal-review-warning">
            This estimate is incomplete. Unpriced items below need a scoped project estimate before PDF export.
          </p>{:else if costs && !costs.withinBudget}<p class="proposal-review-warning">
            This proposal exceeds a budget limit. Adjust the draft or limits before exporting.
          </p>{/if}
        {#if costs}<ProposalCostCharts {costs} {settings} />{:else}<p class="proposal-review-note">
            A current cost calculation is needed before the funding charts can be shown.
          </p>{/if}
      </section>
      <section class="proposal-review-section" aria-label="Modeled proposal impact">
        <div class="proposal-review-section-title">
          <span>02</span>
          <h3>What changes</h3>
        </div>
        {#if impact}<div class="proposal-review-counts">
            <div>
              <strong>{impact.baselineServiceCount}<span> → </span>{impact.proposedServiceCount}</strong><span
                >service facilities</span
              >
            </div>
            <div><strong>{impact.addedServiceCount}</strong><span>added</span></div>
            <div><strong>{impact.removedServiceCount}</strong><span>removed</span></div>
          </div>
          <ProposalImpactCharts {impact} />
          <p class="proposal-review-note">
            These are modeled service demand allocations. A person can contribute to several needs, so these are not
            unique residents. Demand changes and map intensity do not establish shorter journeys or residents gaining
            access. Reachable-resident and travel-time outcomes are not calculated by this model.
          </p>
          <details class="proposal-review-details">
            <summary>Demand and pressure evidence</summary>
            <div class="proposal-review-table-wrap">
              <table>
                <caption>Modeled demand allocated to services, by category</caption><thead
                  ><tr
                    ><th scope="col">Service</th><th scope="col">Without proposal</th><th scope="col">With proposal</th
                    ><th scope="col">Change</th></tr
                  ></thead
                ><tbody
                  >{#each impact.categories as category (category.category)}<tr
                      ><th scope="row"
                        >{category.label}<span
                          >{category.status === 'numeric'
                            ? 'Modeled allocation'
                            : category.status === 'partial'
                              ? 'Partial evidence'
                              : 'Unavailable'}</span
                        ></th
                      ><td>{figure(category.beforeDemand)}</td><td>{figure(category.afterDemand)}</td><td
                        >{category.demandChange == null
                          ? 'Unavailable'
                          : `${category.demandChange > 0 ? '+' : ''}${figure(category.demandChange)}`}</td
                      ></tr
                    >{/each}</tbody
                >
              </table>
            </div>
            <div class="proposal-review-pressure">
              {#each impact.categories as category (category.category)}<div>
                  <h4>{category.label}</h4>
                  <p>Service facilities: {category.beforeServiceCount} → {category.afterServiceCount}</p>
                  <p>Mean modeled load ratio: {figure(category.beforePressure)} → {figure(category.afterPressure)}</p>
                </div>{/each}
            </div>
          </details>{:else}<p class="proposal-review-note">
            A current impact calculation is needed. Available costs and accepted changes remain visible.
          </p>{/if}
      </section>
      {#if transportPlans.length}
        <section class="proposal-review-section" aria-label="Proposed transport service">
          <div class="proposal-review-section-title"><h3>Proposed bus & ferry service</h3></div>
          <div class="proposal-review-transport-plans">
            {#each transportPlans as plan (plan.operationId)}
              <article>
                <h4>{plan.label}</h4>
                <dl>
                  <div>
                    <dt>Proposed departures / service day</dt>
                    <dd>
                      {plan.departuresPerDirectionPerDay}{plan.bidirectional ? ' each way' : ' in selected direction'}
                    </dd>
                  </div>
                  <div>
                    <dt>Operating window</dt>
                    <dd>
                      {String(plan.startHour).padStart(2, '0')}:00–{String(plan.endHour).padStart(2, '0')}:00 · {plan.serviceDaysPerWeek}
                      days/week
                    </dd>
                  </div>
                  <div>
                    <dt>Regular headway assumption</dt>
                    <dd>{figure(plan.headwayMinutes)} minutes</dd>
                  </div>
                  <div>
                    <dt>Proposed expected wait</dt>
                    <dd>{figure(plan.proposedExpectedWaitMinutes)} minutes during service</dd>
                  </div>
                  <div>
                    <dt>Planning distance</dt>
                    <dd>
                      {figure(plan.distanceKm)} km{plan.mode === 'ferry'
                        ? ' direct endpoint estimate'
                        : ' mapped route'}
                    </dd>
                  </div>
                  <div>
                    <dt>Fleet allowance</dt>
                    <dd>{plan.vehicleCount} {plan.mode === 'ferry' ? 'ferries' : 'buses'}</dd>
                  </div>
                </dl>
              </article>
            {/each}
          </div>
          <p class="proposal-review-note">
            Comparable published baseline timetables are unavailable in the retained transport options. These are
            proposed schedule assumptions. Expected wait assumes passengers arrive uniformly between regular departures
            during the proposed operating window; current waits and savings are unavailable. Service frequency does not
            shorten the walk to a stop or landing place.
          </p>
        </section>
      {/if}
      <section class="proposal-review-section" aria-label="Accepted proposal inventory">
        <div class="proposal-review-section-title">
          <span>03</span>
          <h3>Your improvements</h3>
        </div>
        {#if costs?.items.length}<ol class="proposal-review-items">
            {#each costs.items as item (item.operationId)}<li>
                <div>
                  <h4>{item.label}</h4>
                  <p>
                    {item.costAvailable
                      ? `MVR ${money(item.capital)} upfront · MVR ${money(item.annual)} per year`
                      : 'Cost unavailable — project estimate required'}
                  </p>
                  <p class="proposal-review-item-basis">{item.basis}</p>
                  {#if item.sourceIds.length}<span class="proposal-review-source-ids"
                      >Evidence: {#each item.sourceIds as sourceId (sourceId)}{@const source =
                          PROPOSAL_COST_SOURCES.find((entry) => entry.id === sourceId)}{#if source}<a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer">{source.title}</a
                          >{:else}<span>Evidence source unavailable</span>{/if}{/each}</span
                    >{/if}
                </div>
                {#if services.some((service) => service.id === item.serviceId) || transportPlans.some((plan) => plan.operationId === item.operationId)}<Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Show ${item.label} on the map`}
                    onclick={() => showOnMap(item.serviceId, item.operationId)}
                    ><MapPin size={15} aria-hidden="true" /></Button
                  >{/if}
              </li>{/each}
          </ol>{:else}<p class="proposal-review-note">
            No accepted improvements. This brief describes the unchanged baseline.
          </p>{/if}
      </section>
      <section class="proposal-review-section" aria-label="Assumptions and limitations">
        <div class="proposal-review-section-title">
          <span>04</span>
          <h3>Evidence & assumptions</h3>
        </div>
        <p class="proposal-review-note">
          The proposal uses baseline service records and modeled demand. Costs follow the previous project's MVR
          planning allowances, with source qualifications retained in the PDF. No construction, timetable, funding
          approval or observed passenger demand is established by this draft.
        </p>
        {#if limitations.length}<ul class="proposal-review-limitations">
            {#each limitations as limitation (limitation)}<li>{limitation}</li>{/each}
          </ul>{/if}
        {#if sources.length}<details class="proposal-review-details">
            <summary>Dated cost sources</summary>
            <ul class="proposal-review-source-list">
              {#each sources as source (source.id)}<li>
                  <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                  <p>{source.qualification}</p>
                </li>{/each}
            </ul>
          </details>{/if}
        <p class="proposal-review-note">
          PDF generation recalculates the accepted proposal on the server and includes costs, impact, interventions and
          evidence qualifications.
        </p>
      </section>
    </div>
    <Dialog.Footer class="proposal-review-footer"
      ><Button variant="outline" onclick={() => (open = false)}
        ><ArrowLeft size={14} aria-hidden="true" />Back to map</Button
      ><Button disabled={!canExport} onclick={onDownloadPdf}
        >{#if exporting}<LoaderCircle
            size={15}
            class="proposal-review-spinner"
            aria-hidden="true"
          />{:else}<ArrowDownToLine size={15} aria-hidden="true" />{/if}{exporting
          ? 'Generating PDF…'
          : 'Download proposal PDF'}</Button
      ></Dialog.Footer
    >
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.proposal-review-dialog) {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: min(62rem, calc(100vw - 2rem));
    max-width: min(62rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-family: var(--mobility-font-body);
    color-scheme: light;
    box-shadow: var(--mobility-shadow-panel);
  }
  :global(.proposal-review-header) {
    flex: 0 0 auto;
    gap: 0.5rem;
    padding: 1.6rem 2rem 1.3rem;
    border-bottom: 1px solid var(--mobility-border);
    background: var(--mobility-surface);
    text-align: left;
  }
  :global(.proposal-review-dialog [data-slot='badge']) {
    color: var(--mobility-muted);
    background: var(--mobility-surface-muted);
    border-color: var(--mobility-border);
    border-radius: var(--mobility-radius-small);
  }
  .proposal-review-eyebrow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .proposal-review-eyebrow :global([data-slot='badge']) {
    margin-left: auto;
    margin-right: 1.5rem;
    font-size: var(--mobility-text-xs);
  }
  :global(.proposal-review-title) {
    padding-right: 1rem;
    font-family: var(--mobility-font-heading);
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-bold);
    line-height: var(--mobility-leading-tight);
    letter-spacing: -0.035em;
    overflow-wrap: anywhere;
  }
  :global(.proposal-review-description) {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-review-body {
    display: grid;
    flex: 1 1 auto;
    gap: 2rem;
    min-height: 0;
    padding: 1.6rem 2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--mobility-surface-muted);
    scrollbar-gutter: stable;
  }
  .proposal-review-section {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
  }
  .proposal-review-section-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem;
  }
  .proposal-review-section-title > span {
    display: grid;
    flex: 0 0 1.65rem;
    width: 1.65rem;
    height: 1.65rem;
    place-items: center;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface);
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .proposal-review-section-title h3 {
    margin: 0;
    font-family: var(--mobility-font-heading);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.025em;
  }
  .proposal-review-section-title :global([data-slot='badge']) {
    gap: 0.2rem;
    margin-left: auto;
    font-size: var(--mobility-text-xs);
    color: var(--mobility-accent);
    background: var(--mobility-accent-soft);
    border-color: var(--mobility-success-border);
  }
  .proposal-review-note {
    margin: 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-relaxed);
  }
  .proposal-review-warning {
    margin: 0;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--mobility-warning-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-warning-soft);
    color: var(--mobility-warning-ink);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-review-counts {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 0;
    padding: 1rem 0;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-card);
  }
  .proposal-review-counts > div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0 1rem;
  }
  .proposal-review-counts > div + div {
    border-left: 1px solid var(--mobility-border);
  }
  .proposal-review-counts strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-bold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.04em;
    overflow-wrap: anywhere;
  }
  .proposal-review-counts strong span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-normal);
  }
  .proposal-review-counts > div > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-review-table-wrap {
    margin-top: 0.75rem;
    overflow-x: auto;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: var(--mobility-text-sm);
    font-variant-numeric: tabular-nums;
  }
  caption {
    padding: 0.7rem;
    color: var(--mobility-muted);
    background: var(--mobility-surface-muted);
    text-align: left;
    font-size: var(--mobility-text-xs);
  }
  th,
  td {
    padding: 0.7rem;
    border-top: 1px solid var(--mobility-border);
  }
  thead th {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
  }
  tbody th {
    font-weight: var(--mobility-font-weight-semibold);
  }
  tbody th span {
    display: block;
    margin-top: 0.15rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  td {
    text-align: right;
  }
  .proposal-review-details {
    padding: 0.25rem 0.875rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
  }
  .proposal-review-details summary {
    cursor: pointer;
    padding: 0.625rem 0;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    transition: color var(--mobility-duration-fast) var(--mobility-ease);
  }
  .proposal-review-details summary::marker {
    color: var(--mobility-accent);
  }
  .proposal-review-details summary:focus-visible {
    outline: 2px solid var(--mobility-accent);
    outline-offset: 3px;
    border-radius: var(--mobility-radius-small);
  }
  .proposal-review-details[open] {
    padding-bottom: 0.875rem;
  }
  .proposal-review-details[open] summary {
    border-bottom: 1px solid var(--mobility-border);
    color: var(--mobility-accent);
  }
  .proposal-review-pressure {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    padding-top: 0.75rem;
  }
  .proposal-review-pressure h4 {
    margin: 0 0 0.4rem;
    font-size: var(--mobility-text-sm);
  }
  .proposal-review-pressure p {
    margin: 0.2rem 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-review-items {
    display: grid;
    gap: 0.7rem;
    margin: 0;
    padding-left: 1.4rem;
  }
  .proposal-review-items li {
    padding-left: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
  }
  .proposal-review-items li > div {
    display: inline-block;
    width: calc(100% - 2.5rem);
    vertical-align: top;
  }
  .proposal-review-items h4 {
    margin: 0;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-bold);
  }
  .proposal-review-items p {
    margin: 0.25rem 0 0;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-review-items .proposal-review-item-basis {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .proposal-review-source-ids {
    display: block;
    margin-top: 0.3rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    overflow-wrap: anywhere;
  }
  .proposal-review-source-ids a,
  .proposal-review-source-ids > span {
    display: block;
    margin-top: 0.2rem;
  }
  .proposal-review-source-ids a,
  .proposal-review-source-list a {
    color: var(--mobility-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .proposal-review-transport-plans {
    display: grid;
    gap: 0.75rem;
  }
  .proposal-review-transport-plans article {
    padding: 1rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-card);
  }
  .proposal-review-transport-plans h4 {
    margin: 0 0 0.7rem;
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-bold);
  }
  .proposal-review-transport-plans dl {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }
  .proposal-review-transport-plans dl > div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.2rem 1rem;
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-normal);
  }
  .proposal-review-transport-plans dt {
    color: var(--mobility-muted);
  }
  .proposal-review-transport-plans dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .proposal-review-source-list {
    display: grid;
    gap: 0.7rem;
    margin: 0.8rem 0 0;
    padding-left: 1rem;
    font-size: var(--mobility-text-xs);
    line-height: var(--mobility-leading-relaxed);
  }
  .proposal-review-source-list p {
    margin: 0.2rem 0 0;
    color: var(--mobility-muted);
  }
  .proposal-review-limitations {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding-left: 1rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: var(--mobility-leading-relaxed);
  }
  :global(.proposal-review-stale [data-slot='alert-description']) {
    display: grid;
    gap: 0.6rem;
    font-size: var(--mobility-text-sm);
  }
  :global(.proposal-review-stale [data-slot='button']) {
    justify-self: start;
  }
  :global(.proposal-review-footer) {
    display: flex;
    flex: 0 0 auto;
    margin: 0;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 1rem 2rem;
    border-top: 1px solid var(--mobility-border);
    background: var(--mobility-surface);
  }
  :global(.proposal-review-footer [data-slot='button']) {
    font-size: var(--mobility-text-sm);
    min-height: 2.5rem;
  }
  @media (hover: hover) and (pointer: fine) {
    .proposal-review-details summary:hover {
      color: var(--mobility-accent);
    }
    .proposal-review-source-ids a:hover,
    .proposal-review-source-list a:hover {
      color: var(--mobility-accent-hover);
    }
  }
  :global(.proposal-review-spinner) {
    animation: proposal-review-spin 0.8s linear infinite;
  }
  @keyframes proposal-review-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 640px) {
    :global(.proposal-review-dialog) {
      width: calc(100vw - 1rem);
      max-width: calc(100vw - 1rem);
      max-height: calc(100dvh - 1rem);
    }
    :global(.proposal-review-header) {
      padding: 1.2rem 1rem 1rem;
    }
    .proposal-review-body {
      gap: 1.4rem;
      padding: 1.1rem 1rem;
    }
    .proposal-review-pressure {
      grid-template-columns: 1fr;
    }
    .proposal-review-counts > div {
      padding: 0 0.75rem;
    }
    .proposal-review-counts strong {
      font-size: var(--mobility-text-lg);
    }
    th,
    td {
      padding: 0.55rem;
    }
    :global(.proposal-review-footer) {
      flex-wrap: wrap;
      padding: 0.8rem 1rem;
    }
    :global(.proposal-review-footer [data-slot='button']) {
      flex: 1 0 auto;
      min-height: 2.75rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .proposal-review-details summary {
      transition: none;
    }
    :global(.proposal-review-spinner) {
      animation: none;
    }
  }
</style>
