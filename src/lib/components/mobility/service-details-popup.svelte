<script lang="ts">
  import type { IslandMapService, IslandServiceDemand, ServiceDemandCategory } from './island-services';

  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Hospital from '@lucide/svelte/icons/hospital';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';

  import * as AlertDialog from '$components/ui/alert-dialog';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';

  type Props = {
    service: IslandMapService;
    onClose?: () => void;
    proposalMode?: boolean;
    onUpgrade?: (targetSubtype: string) => void;
    onDowngrade?: (targetSubtype: string) => void;
    onMove?: () => void;
    onDelete?: () => void;
  };

  type DemandRow = {
    key: ServiceDemandCategory;
    label: string;
  };

  let {
    service,
    onClose = () => {},
    proposalMode = false,
    onUpgrade = () => {},
    onDowngrade = () => {},
    onMove = () => {},
    onDelete = () => {}
  }: Props = $props();

  let deleteDialogOpen = $state(false);

  const demandRows: DemandRow[] = [
    { key: 'health', label: 'Health' },
    { key: 'education', label: 'Education' },
    { key: 'transport', label: 'Transport' }
  ];
  let availableDemandRows = $derived(demandRows.filter((row) => service.demand[row.key].status !== 'unavailable'));

  function titleCase(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function serviceName(): string {
    return service.name ?? titleCase(service.subtype);
  }

  function serviceTypeLabel(): string {
    return titleCase(service.subtype);
  }

  function demandFor(key: ServiceDemandCategory): IslandServiceDemand {
    return service.demand[key];
  }

  function value(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function score(value: number): string {
    return `${Math.round(value)}%`;
  }

  function loadRatio(value: number): string {
    return `${value.toFixed(2)}x`;
  }

  function changeLabel(): string | null {
    if (service.change === 'added') return 'Draft addition';
    if (service.change === 'upgraded') return 'Draft upgrade';
    if (service.change === 'downgraded') return 'Draft downgrade';
    if (service.change === 'moved') return 'Draft move';
    return null;
  }
</script>

<Card.Root class="service-details-popup" size="sm">
  <Card.Header class="service-popup-header">
    <div class="service-popup-heading">
      <span class={`service-popup-service-icon service-popup-service-icon-${service.serviceType}`} aria-hidden="true">
        {#if service.serviceType === 'health'}
          <Hospital size={16} strokeWidth={2.2} />
        {:else if service.serviceType === 'education'}
          <School size={16} strokeWidth={2.2} />
        {:else}
          <Route size={16} strokeWidth={2.2} />
        {/if}
      </span>
      <div class="service-popup-title-group">
        <h2>{serviceName()}</h2>
        {#if service.name}<p>{serviceTypeLabel()}</p>{/if}
        {#if changeLabel()}<span class="service-popup-change">{changeLabel()}</span>{/if}
      </div>
    </div>
    <Button
      class="service-popup-close"
      variant="ghost"
      size="icon-sm"
      aria-label="Close service details"
      onclick={onClose}
    >
      <X size={14} strokeWidth={2.4} />
    </Button>
  </Card.Header>

  {#if !proposalMode && availableDemandRows.length > 0}
    <Card.Content class="service-popup-content">
      <div class="demand-list">
        {#each availableDemandRows as row (row.key)}
          {@const demand = demandFor(row.key)}
          <section class="demand-card" aria-label={`${row.label} demand breakdown`}>
            <div class="demand-card-heading">
              <h4>Demand breakdown</h4>
            </div>
            <dl class="metric-grid">
              {#if demand.local !== null}<div class="metric-card">
                  <dt>Local</dt>
                  <dd>{value(demand.local)}</dd>
                </div>{/if}
              {#if demand.inbound !== null}<div class="metric-card">
                  <dt>Inbound</dt>
                  <dd>{value(demand.inbound)}</dd>
                </div>{/if}
              {#if demand.connected !== null}<div class="metric-card">
                  <dt>Connected</dt>
                  <dd>{value(demand.connected)}</dd>
                </div>{/if}
              {#if demand.transfer !== null}<div class="metric-card">
                  <dt>Transfer</dt>
                  <dd>{value(demand.transfer)}</dd>
                </div>{/if}
              {#if demand.careTransfer !== null}<div class="metric-card">
                  <dt>Care transfer</dt>
                  <dd>{value(demand.careTransfer)}</dd>
                </div>{/if}
              {#if demand.educationTransfer !== null}<div class="metric-card">
                  <dt>Student transfer</dt>
                  <dd>{value(demand.educationTransfer)}</dd>
                </div>{/if}
              {#if demand.score !== null}<div class="metric-card">
                  <dt>Score</dt>
                  <dd>{score(demand.score)}</dd>
                </div>{/if}
              {#if demand.loadRatio !== null}<div class="metric-card">
                  <dt>Load ratio</dt>
                  <dd>{loadRatio(demand.loadRatio)}</dd>
                </div>{/if}
            </dl>
          </section>
        {/each}
      </div>
    </Card.Content>
  {/if}

  {#if proposalMode}
    {@const upgrade = service.eligibility?.upgrades[0]}
    {@const downgrade = service.eligibility?.downgrades[0]}
    <Card.Footer class="service-popup-actions">
      <div class="service-popup-action-row">
        <Button
          class="service-popup-outline-action"
          variant="outline"
          size="sm"
          disabled={!upgrade}
          title={upgrade ? upgrade.label : 'No upgrade is available for this service'}
          onclick={() => upgrade && onUpgrade(upgrade.targetSubtype)}
        >
          <ArrowUp data-icon="inline-start" />
          {upgrade ? 'Upgrade' : 'No upgrade'}
        </Button>
        <Button
          class="service-popup-outline-action"
          variant="outline"
          size="sm"
          disabled={!downgrade}
          title={downgrade ? downgrade.label : 'No downgrade is available for this service'}
          onclick={() => downgrade && onDowngrade(downgrade.targetSubtype)}
        >
          <ArrowDown data-icon="inline-start" />
          {downgrade ? 'Downgrade' : 'No downgrade'}
        </Button>
        <Button
          class="service-popup-outline-action"
          variant="outline"
          size="sm"
          disabled={!service.eligibility?.canMove}
          onclick={onMove}
        >
          <MapPin data-icon="inline-start" />
          Move
        </Button>
        <Button
          class="service-popup-delete-action"
          variant="destructive"
          size="sm"
          disabled={!service.eligibility?.canDelete}
          onclick={() => (deleteDialogOpen = true)}
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </div>
    </Card.Footer>
  {/if}
</Card.Root>

{#if proposalMode}
  <AlertDialog.Root bind:open={deleteDialogOpen}>
    <AlertDialog.Content size="sm" class="proposal-delete-dialog">
      <AlertDialog.Header class="proposal-delete-header">
        <div class="proposal-delete-title-row">
          <span class="proposal-delete-icon" aria-hidden="true"><Trash2 size={17} strokeWidth={2.2} /></span>
          <AlertDialog.Title>Remove this service?</AlertDialog.Title>
        </div>
        <AlertDialog.Description>
          This only removes {serviceName()} from the draft. The baseline data will stay unchanged.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer class="proposal-delete-footer">
        <AlertDialog.Cancel class="proposal-delete-cancel">
          <X data-icon="inline-start" />
          Keep service
        </AlertDialog.Cancel>
        <AlertDialog.Action
          class="proposal-delete-confirm"
          variant="destructive"
          onclick={() => {
            deleteDialogOpen = false;
            onDelete();
          }}
        >
          <Trash2 data-icon="inline-start" />
          Remove from draft
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

<style>
  :global(.maplibregl-popup-content .service-details-popup) {
    width: min(20rem, calc(100vw - 1rem));
    max-height: min(28rem, calc(100vh - 4rem));
    overflow-y: auto;
    gap: 0;
    padding-block: 0;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
    box-shadow: 0 0.75rem 1.75rem rgb(16 24 32 / 12%);
  }

  :global(.proposal-delete-dialog) {
    width: min(28rem, calc(100vw - 2rem));
    max-width: min(28rem, calc(100vw - 2rem));
    height: auto !important;
    max-height: calc(100dvh - 2rem);
    min-height: 0 !important;
    align-content: start;
    align-self: center;
    overflow-y: auto;
    grid-template-rows: auto auto;
    gap: 1.1rem;
    padding: 1.2rem;
    border: 1px solid #e7c5c5;
    border-radius: 1rem;
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
    box-shadow: 0 1rem 2.5rem rgb(16 24 32 / 16%);
  }

  :global(.proposal-delete-header) {
    display: grid;
    grid-template-rows: auto;
    gap: 0.65rem;
    place-items: start;
    text-align: left;
  }

  .proposal-delete-title-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .proposal-delete-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.6rem;
    background: #fff1f2;
    color: #be123c;
  }

  :global(.proposal-delete-header [data-slot='alert-dialog-title']) {
    color: var(--mobility-text, #09090b);
    font-size: 1.08rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  :global(.proposal-delete-header [data-slot='alert-dialog-description']) {
    color: var(--mobility-muted, #71717a);
    font-size: 0.72rem;
    line-height: 1.45;
  }

  :global(.proposal-delete-footer) {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    gap: 0.55rem;
    height: auto;
    min-height: 0;
    flex: 0 0 auto;
    margin: 0;
    padding: 0.9rem 0 0;
    border-top: 1px solid #f0dada;
    border-radius: 0;
    background: transparent;
  }

  :global(.proposal-delete-footer button) {
    min-height: 2.35rem;
    font-size: 0.68rem;
  }

  :global(.proposal-delete-cancel) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
  }

  :global(.proposal-delete-confirm) {
    background: #be123c;
    color: #ffffff;
  }

  :global(.proposal-delete-confirm:hover) {
    background: #9f1239;
  }

  :global(.service-popup-header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    min-height: 4.1rem;
    padding: 0.75rem 0.75rem 0.7rem 0.9rem;
    border-bottom: 1px solid var(--mobility-border, #e4e4e7);
  }

  :global(.service-popup-content) {
    padding: 0;
  }

  :global(.service-popup-actions) {
    display: grid;
    gap: 0.45rem;
    padding: 0.7rem 0.9rem 0.85rem;
    border-top: 1px solid var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
  }

  .service-popup-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .service-popup-action-row :global(button) {
    flex: 1 1 auto;
    font-size: 0.6rem;
  }

  :global(.service-popup-outline-action) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
  }

  :global(.service-popup-outline-action:hover) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-accent-soft, #f4f4f5);
  }

  :global(.service-popup-delete-action) {
    border-color: #fecdd3;
    background: #fff1f2;
    color: #be123c;
  }

  :global(.service-popup-delete-action:hover) {
    border-color: #fda4af;
    background: #ffe4e6;
    color: #9f1239;
  }

  .service-popup-heading {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 0.55rem;
  }

  .service-popup-service-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.55rem;
  }

  .service-popup-service-icon-health {
    background: #fff0f1;
    color: #ad4b52;
  }

  .service-popup-service-icon-education {
    background: #edf2fb;
    color: #486995;
  }

  .service-popup-service-icon-transport {
    background: #fbf3e7;
    color: #a46d32;
  }

  .service-popup-change {
    display: inline-flex;
    margin-top: 0.3rem;
    padding: 0.15rem 0.35rem;
    border-radius: 999px;
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
    font-size: 0.52rem;
    font-weight: 750;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .service-popup-title-group {
    flex: 1 1 auto;
    min-width: 0;
    padding-top: 0.1rem;
  }

  :global(.service-popup-header h2) {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 1.08rem;
    font-weight: 750;
    letter-spacing: -0.025em;
    line-height: 1.08;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :global(.service-popup-header p) {
    margin: 0.2rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.68rem;
    font-weight: 650;
    letter-spacing: 0.01em;
    line-height: 1.15;
    white-space: normal;
  }

  :global(.service-popup-close) {
    flex: 0 0 auto;
    width: 1.9rem;
    height: 1.9rem;
    border-color: var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.65rem;
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
    box-shadow: 0 0.1rem 0.25rem rgb(16 24 32 / 5%);
  }

  :global(.service-popup-close:hover) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  :global(.service-popup-close:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    box-shadow: 0 0 0 3px rgb(9 9 11 / 18%);
  }

  .metric-card dt {
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1.15;
    min-height: 1.15em;
    text-transform: uppercase;
  }

  .demand-list {
    display: grid;
    gap: 0.45rem;
    padding: 0.75rem 0.9rem 0.9rem;
  }

  .demand-card {
    display: grid;
    gap: 0.45rem;
    padding: 0.6rem 0.65rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    border-radius: 0.6rem;
    background: var(--mobility-surface-soft, #fafafa);
    box-shadow: 0 0.15rem 0.4rem rgb(16 24 32 / 4%);
  }

  .demand-card-heading {
    display: block;
  }

  .demand-card-heading h4 {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.76rem;
    font-weight: 750;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    gap: 0.35rem;
    margin: 0;
  }

  .metric-card {
    display: grid;
    align-content: start;
    gap: 0.1rem;
    height: 100%;
    min-width: 0;
    min-height: 3.35rem;
    box-sizing: border-box;
    padding: 0.45rem 0.5rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    border-radius: 0.42rem;
    background: var(--mobility-surface, #ffffff);
  }

  .metric-card dd {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.76rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  :global(.maplibregl-popup-content) {
    padding: 0;
    border: 0;
    border-radius: 1rem;
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.75rem 1.75rem rgb(16 24 32 / 12%);
  }

  :global(.maplibregl-popup-tip) {
    border-color: transparent;
  }

  :global(.maplibregl-popup-anchor-top .maplibregl-popup-tip) {
    border-bottom-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip) {
    border-top-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
    border-right-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
    border-left-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-top-left .maplibregl-popup-tip) {
    border-right-color: #ffffff;
    border-bottom-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-left-color: #ffffff;
    border-bottom-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip) {
    border-right-color: #ffffff;
    border-top-color: #ffffff;
  }

  :global(.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-left-color: #ffffff;
    border-top-color: #ffffff;
  }

  @media (max-width: 480px) {
    :global(.service-details-popup) {
      width: min(20rem, calc(100vw - 1rem));
    }

    :global(.service-popup-header) {
      padding-inline: 0.75rem;
    }

    :global(.service-popup-content) {
      padding-inline: 0;
    }

    .demand-list {
      padding-inline: 0.75rem;
    }

    .metric-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
