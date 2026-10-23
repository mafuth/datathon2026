<script lang="ts">
  import type { ProposalCosts, ProposalImpact, ProposalSettings } from '$lib/mobility/proposal-planning';

  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import X from '@lucide/svelte/icons/x';

  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import * as Field from '$components/ui/field';
  import { Input } from '$components/ui/input';

  let {
    settings,
    costs,
    impact,
    disabled = false,
    pending = false,
    exporting = false,
    error = null,
    onSettingsChange = () => {},
    onDownload = () => {},
    onClose = () => {}
  }: {
    settings: ProposalSettings;
    costs: ProposalCosts | null;
    impact: ProposalImpact | null;
    disabled?: boolean;
    pending?: boolean;
    exporting?: boolean;
    error?: string | null;
    onSettingsChange?: (settings: ProposalSettings) => void;
    onDownload?: () => void;
    onClose?: () => void;
  } = $props();

  const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const namedChanges = $derived(costs?.items ?? []);
  const changedCategories = $derived(
    (impact?.categories ?? []).filter((category) => category.beforeServiceCount !== category.afterServiceCount)
  );
  const costHorizon = $derived([
    { label: '1 yr', value: costs?.oneYear ?? null },
    { label: '5 yrs', value: costs?.fiveYear ?? null },
    { label: '10 yrs', value: costs?.tenYear ?? null }
  ]);
  const maximumCost = $derived(Math.max(1, ...costHorizon.map((item) => finite(item.value))));
  const composition = $derived(
    (costs?.items ?? [])
      .filter((item) => item.costAvailable && finite(item.capital + item.annual * 10) > 0)
      .map((item) => ({ id: item.operationId, label: item.label, value: item.capital + item.annual * 10 }))
      .sort((left, right) => right.value - left.value)
  );
  const compositionMaximum = $derived(Math.max(1, ...composition.map((item) => finite(item.value))));
  const budgetRows = $derived([
    { label: 'Upfront', value: costs?.capital ?? 0, limit: settings.capitalLimit },
    { label: 'Annual', value: costs?.annual ?? 0, limit: settings.annualLimit }
  ]);
  const downloadMessage = $derived(
    pending
      ? 'Waiting for the current proposal calculation.'
      : !costs || !impact
        ? 'Add or calculate a proposal before downloading.'
        : !costs.complete
          ? 'The PDF will mark unpriced changes as incomplete.'
          : !costs.withinBudget
            ? 'The PDF will mark this draft as over budget.'
            : null
  );
  const downloadBlocked = $derived(pending || !costs || !impact);

  function finite(value: number | null | undefined): number {
    return value != null && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function formatMoney(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? 'Unavailable' : `MVR ${money.format(value)}`;
  }

  function percent(value: number, limit: number): number {
    if (limit <= 0) return value > 0 ? 100 : 0;
    return Math.min(100, Math.max(0, (value / limit) * 100));
  }

  function changeBudget(field: 'capitalLimit' | 'annualLimit', input: HTMLInputElement): void {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) return;
    onSettingsChange({ ...settings, [field]: value });
  }
</script>

<Card.Root class="proposal-financial-panel" aria-label="Proposal summary" aria-busy={pending}>
  <Card.Header class="proposal-financial-header">
    <div data-presentation-target="proposal-title">
      <Card.Title>{settings.name || 'Island access proposal'}</Card.Title>
    </div>
    <div class="proposal-financial-header-actions">
      <Button
        class="close-button"
        variant="ghost"
        size="icon"
        aria-label="Close proposal"
        title="Close proposal"
        onclick={onClose}
      >
        <X size={18} strokeWidth={2.2} aria-hidden="true" />
      </Button>
    </div>
  </Card.Header>
  <Card.Content class="proposal-financial-content">
    {#if error}<p class="proposal-summary-error" role="alert">{error}</p>{/if}
    {#if pending}<p class="proposal-summary-status" role="status">Recalculating proposal…</p>{/if}

    <section class="proposal-summary-section" aria-label="Proposal costs">
      <div class="proposal-summary-heading">
        <h3>Cost</h3>
        {#if costs?.withinBudget}<span class="proposal-summary-badge">Within budget</span>{/if}
      </div>
      <div class="proposal-summary-grid">
        <div><span>Upfront</span><strong>{formatMoney(costs?.capital)}</strong></div>
        <div><span>Annual</span><strong>{formatMoney(costs?.annual)}</strong></div>
        <div><span>1 year</span><strong>{formatMoney(costs?.oneYear)}</strong></div>
        <div><span>5 years</span><strong>{formatMoney(costs?.fiveYear)}</strong></div>
        <div><span>10 years</span><strong>{formatMoney(costs?.tenYear)}</strong></div>
      </div>
      {#if costs && !costs.complete}<p class="proposal-summary-note">
          Some accepted changes need a scoped cost estimate.
        </p>{:else if costs && !costs.withinBudget}<p class="proposal-summary-note">
          The proposal exceeds one or more budget limits.
        </p>{/if}
      <figure class="proposal-mini-chart" aria-label="Cost projection chart">
        <figcaption>Cost horizon</figcaption>
        <div class="proposal-cost-bars">
          {#each costHorizon as item (item.label)}
            <div class="proposal-cost-bar">
              <span class="proposal-cost-track"
                ><i style:height={`${Math.max(3, (finite(item.value) / maximumCost) * 100)}%`}></i></span
              >
              <strong>{item.label}</strong>
              <small>{formatMoney(item.value)}</small>
            </div>
          {/each}
        </div>
      </figure>
      <div class="proposal-budget-settings" aria-label="Budget settings">
        <Field.Field>
          <Field.Label for="proposal-capital-limit">Upfront budget (MVR)</Field.Label>
          <Input
            id="proposal-capital-limit"
            type="number"
            min="0"
            max="1000000000000"
            step="100000"
            value={settings.capitalLimit}
            {disabled}
            onchange={(event) => changeBudget('capitalLimit', event.currentTarget)}
          />
        </Field.Field>
        <Field.Field>
          <Field.Label for="proposal-annual-limit">Annual budget (MVR)</Field.Label>
          <Input
            id="proposal-annual-limit"
            type="number"
            min="0"
            max="1000000000000"
            step="100000"
            value={settings.annualLimit}
            {disabled}
            onchange={(event) => changeBudget('annualLimit', event.currentTarget)}
          />
        </Field.Field>
      </div>
      <div class="proposal-budget-bars" aria-label="Budget usage chart">
        {#each budgetRows as item (item.label)}
          <div>
            <p><span>{item.label}</span><strong>{Math.round(percent(item.value, item.limit))}% used</strong></p>
            <span class="proposal-budget-track"><i style:width={`${percent(item.value, item.limit)}%`}></i></span>
            <small
              >{item.value > item.limit
                ? `${formatMoney(item.value - item.limit)} over`
                : `${formatMoney(item.limit - item.value)} remaining`}</small
            >
          </div>
        {/each}
      </div>
    </section>

    <section class="proposal-summary-section" aria-label="Proposal benefits">
      <div class="proposal-summary-heading"><h3>Modeled benefit</h3></div>
      {#if impact}
        <div class="proposal-summary-impact-grid">
          <div><strong>{impact.changedServiceCount}</strong><span>changed</span></div>
          <div><strong>{impact.addedServiceCount}</strong><span>added</span></div>
          <div><strong>{impact.removedServiceCount}</strong><span>removed</span></div>
        </div>
        <p class="proposal-summary-note">
          Modeled service allocation and facility changes, not guaranteed residents reached or travel-time savings.
        </p>
        <div class="proposal-impact-bars" aria-label="Facility comparison chart">
          {#each impact.categories as category (category.category)}
            {@const maximum = Math.max(1, category.beforeServiceCount, category.afterServiceCount)}
            <div>
              <p>
                <span>{category.label}</span><strong
                  >{category.beforeServiceCount} → {category.afterServiceCount}</strong
                >
              </p>
              <span class="proposal-impact-track before"
                ><i style:width={`${(category.beforeServiceCount / maximum) * 100}%`}></i></span
              >
              <span class="proposal-impact-track after"
                ><i style:width={`${(category.afterServiceCount / maximum) * 100}%`}></i></span
              >
            </div>
          {/each}
        </div>
        {#if changedCategories.length}<ul class="proposal-summary-categories">
            {#each changedCategories as category (category.category)}<li>
                <span>{category.label}</span><strong
                  >{category.beforeServiceCount} → {category.afterServiceCount}</strong
                >
              </li>{/each}
          </ul>{/if}
      {:else}<p class="proposal-summary-note">A current impact calculation is not available.</p>{/if}
    </section>

    <section class="proposal-summary-section" aria-label="Named proposal changes">
      <div class="proposal-summary-heading">
        <h3>Changes</h3>
        <span>{namedChanges.length}</span>
      </div>
      {#if namedChanges.length}<ul class="proposal-summary-changes">
          {#each namedChanges as item (item.operationId)}<li>
              <span>{item.label}</span><small
                >{item.costAvailable
                  ? `${formatMoney(item.capital)} capital · ${formatMoney(item.annual)} annual`
                  : 'Unpriced · scoped estimate required'}</small
              >
            </li>{/each}
        </ul>{:else}<p class="proposal-summary-note">No changes accepted yet.</p>{/if}
      <figure class="proposal-composition" aria-label="Ten-year cost composition chart">
        <figcaption>10-year cost composition</figcaption>
        {#each composition as item (item.id)}
          <div>
            <p><span>{item.label}</span><strong>{formatMoney(item.value)}</strong></p>
            <span><i style:width={`${(finite(item.value) / compositionMaximum) * 100}%`}></i></span>
          </div>
        {:else}
          <p class="proposal-summary-note">No priced improvements to compare yet.</p>
        {/each}
      </figure>
    </section>

    <div class="proposal-download-wrap">
      <Button
        class="proposal-download"
        data-presentation-target="download-proposal"
        disabled={exporting || downloadBlocked}
        onclick={onDownload}
      >
        {#if exporting}<LoaderCircle class="proposal-summary-spinner" aria-hidden="true" />Generating PDF…{:else}<Download
            aria-hidden="true"
          />Download proposal PDF{/if}
      </Button>
      {#if downloadMessage}<p class="proposal-download-message" role="status">{downloadMessage}</p>{/if}
    </div>
  </Card.Content>
</Card.Root>

<style>
  :global(.proposal-financial-panel) {
    grid-column: 3;
    grid-row: 1;
    width: min(32rem, 100%);
    max-width: 100%;
    min-width: 0;
    max-height: 100%;
    overflow: hidden;
    color: #09090b;
    background: #ffffff;
    border: 1px solid #d4d4d8;
    box-shadow: 0 0.8rem 2rem rgb(16 24 32 / 12%);
    color-scheme: light;
  }
  :global(.proposal-financial-header) {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.9rem;
    border-bottom: 1px solid #e4e4e7;
    background: #ffffff;
  }
  .proposal-financial-header-actions {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }
  :global(.proposal-financial-header [data-slot='card-title']) {
    color: #09090b;
    font-size: 1.15rem;
    font-weight: 850;
  }
  :global(.proposal-financial-header .close-button) {
    display: grid;
    width: 2.45rem;
    height: 2.45rem;
    place-items: center;
    border: 1px solid #d4d4d8;
    border-radius: 0.8rem;
    color: #09090b;
    background: #ffffff;
  }
  :global(.proposal-financial-header .close-button:hover),
  :global(.proposal-financial-header .close-button:focus-visible) {
    border-color: #3f3f46;
    color: #09090b;
    background: #f4f4f5;
  }
  :global(.proposal-financial-content) {
    display: grid;
    gap: 0.75rem;
    min-height: 0;
    padding: 0.85rem;
    overflow-y: auto;
    background: #ffffff;
  }
  .proposal-summary-section {
    display: grid;
    gap: 0.5rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid #e4e4e7;
  }
  .proposal-summary-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .proposal-summary-heading h3 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 800;
  }
  .proposal-summary-heading > span:last-child {
    color: #71717a;
    font-size: 0.72rem;
  }
  .proposal-summary-badge {
    padding: 0.2rem 0.4rem;
    border: 1px solid #a1a1aa;
    border-radius: 999px;
    color: #18181b;
    background: #f4f4f5;
    font-size: 0.62rem;
    font-weight: 700;
  }
  .proposal-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .proposal-summary-grid > div {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.45rem;
    background: #fafafa;
  }
  .proposal-summary-grid span,
  .proposal-summary-impact-grid span {
    color: #71717a;
    font-size: 0.62rem;
  }
  .proposal-summary-grid strong {
    font-size: 0.77rem;
  }
  .proposal-summary-impact-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .proposal-summary-impact-grid > div {
    display: grid;
    gap: 0.15rem;
    padding: 0.5rem;
    border-radius: 0.45rem;
    background: #f4f4f5;
    text-align: center;
  }
  .proposal-summary-impact-grid strong {
    font-size: 1rem;
  }
  .proposal-summary-note {
    margin: 0;
    color: #71717a;
    font-size: 0.66rem;
    line-height: 1.45;
  }
  .proposal-summary-categories,
  .proposal-summary-changes {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .proposal-summary-categories li,
  .proposal-summary-changes li {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    color: #27272a;
    font-size: 0.7rem;
  }
  .proposal-summary-categories strong,
  .proposal-summary-changes small {
    color: #52525b;
    font-size: 0.65rem;
  }
  .proposal-mini-chart {
    margin: 0;
    padding: 0.55rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.45rem;
    background: #fafafa;
  }
  .proposal-mini-chart figcaption {
    margin-bottom: 0.4rem;
    color: #52525b;
    font-size: 0.65rem;
    font-weight: 700;
  }
  .proposal-cost-bars {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
    gap: 0.45rem;
    height: 7rem;
  }
  .proposal-cost-bar {
    display: grid;
    grid-template-rows: 1fr auto auto;
    gap: 0.16rem;
    height: 100%;
    text-align: center;
  }
  .proposal-cost-track {
    display: flex;
    align-items: end;
    justify-content: center;
    min-height: 0;
    border-radius: 0.3rem;
    background: #e4e4e7;
    overflow: hidden;
  }
  .proposal-cost-track i {
    display: block;
    width: 100%;
    background: #27272a;
  }
  .proposal-cost-bar strong {
    font-size: 0.62rem;
  }
  .proposal-cost-bar small {
    color: #71717a;
    font-size: 0.56rem;
  }
  .proposal-budget-settings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }
  .proposal-budget-settings :global([data-slot='field']) {
    display: grid;
    gap: 0.25rem;
    color: var(--muted-foreground);
    font-size: 0.62rem;
    font-weight: 650;
  }
  .proposal-budget-settings :global(input) {
    height: 2rem;
    color: #09090b;
    background: #ffffff;
    border-color: #d4d4d8;
    font-size: 0.68rem;
  }
  .proposal-budget-bars,
  .proposal-impact-bars {
    display: grid;
    gap: 0.5rem;
  }
  .proposal-budget-bars p,
  .proposal-impact-bars p {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.2rem;
    color: #52525b;
    font-size: 0.62rem;
  }
  .proposal-budget-track,
  .proposal-impact-track {
    display: block;
    height: 0.38rem;
    overflow: hidden;
    border-radius: 999px;
    background: #e4e4e7;
  }
  .proposal-budget-track i,
  .proposal-impact-track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #27272a;
  }
  .proposal-budget-bars small {
    display: block;
    margin-top: 0.2rem;
    color: #71717a;
    font-size: 0.58rem;
  }
  .proposal-impact-track + .proposal-impact-track {
    margin-top: 0.18rem;
  }
  .proposal-impact-track.before i {
    background: #a1a1aa;
  }
  .proposal-impact-track.after i {
    background: #27272a;
  }
  .proposal-composition {
    display: grid;
    gap: 0.45rem;
    margin: 0;
    padding: 0.55rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.45rem;
    background: #fafafa;
  }
  .proposal-composition figcaption {
    color: #52525b;
    font-size: 0.65rem;
    font-weight: 700;
  }
  .proposal-composition p {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0 0.18rem;
    font-size: 0.62rem;
  }
  .proposal-composition p span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .proposal-composition p strong {
    flex: 0 0 auto;
  }
  .proposal-composition div > span {
    display: block;
    height: 0.35rem;
    overflow: hidden;
    border-radius: 999px;
    background: #e4e4e7;
  }
  .proposal-composition i {
    display: block;
    height: 100%;
    background: #27272a;
  }
  .proposal-summary-error {
    margin: 0;
    padding: 0.5rem;
    border: 1px solid #fecaca;
    border-radius: 0.4rem;
    color: #991b1b;
    background: #fef2f2;
    font-size: 0.7rem;
  }
  .proposal-summary-status {
    margin: 0;
    color: #52525b;
    font-size: 0.7rem;
  }
  .proposal-download-wrap {
    display: grid;
    gap: 0.35rem;
  }
  .proposal-download-message {
    margin: 0;
    color: #71717a;
    font-size: 0.62rem;
    line-height: 1.4;
    text-align: center;
  }
  :global(.proposal-download) {
    width: 100%;
    min-height: 3.25rem;
    padding-inline: 1.25rem;
    color: #ffffff;
    background: #09090b;
    border-color: #09090b;
    font-size: 0.9rem;
    font-weight: 750;
  }
  :global(.proposal-download:hover) {
    color: #ffffff;
    background: #27272a;
    border-color: #27272a;
  }
  :global(.proposal-download:disabled) {
    color: #ffffff;
    background: #09090b;
    border-color: #09090b;
    opacity: 0.45;
  }
  :global(.proposal-summary-spinner) {
    animation: proposal-spin 0.9s linear infinite;
  }
  @keyframes proposal-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 64rem) {
    :global(.proposal-financial-panel) {
      grid-column: 1;
      grid-row: 1;
    }
  }

  :global(.proposal-financial-panel) {
    border-color: var(--border);
    border-radius: 0.55rem;
    background: var(--card);
    color: var(--card-foreground);
    box-shadow: 0 0.7rem 2.2rem rgb(24 24 27 / 10%);
  }
  :global(.proposal-financial-header),
  :global(.proposal-financial-content) {
    background: var(--card);
  }
  :global(.proposal-financial-header) {
    border-color: var(--border);
  }
  .proposal-summary-section {
    border-color: var(--border);
  }
  .proposal-summary-grid > div,
  .proposal-mini-chart,
  .proposal-composition {
    border-color: var(--border);
    background: var(--background);
  }
  .proposal-summary-impact-grid > div {
    border: 1px solid var(--border);
    background: var(--muted);
  }
  .proposal-summary-note,
  .proposal-summary-grid span,
  .proposal-summary-impact-grid span {
    color: var(--muted-foreground);
  }
  :global(.proposal-download) {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }
  :global(.proposal-download:hover) {
    background: var(--foreground);
    color: var(--background);
    border-color: var(--foreground);
  }
  :global(.proposal-financial-panel) {
    width: min(32rem, 100%);
    max-width: 100%;
  }
</style>
