<script lang="ts">
  import type { IslandMapService, IslandServiceDemand, ServiceDemandCategory } from './island-services';

  import X from '@lucide/svelte/icons/x';

  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';

  type Props = {
    service: IslandMapService;
    onClose?: () => void;
  };

  type DemandRow = {
    key: ServiceDemandCategory;
    label: string;
  };

  let { service, onClose = () => {} }: Props = $props();

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
</script>

<Card.Root class="service-details-popup" size="sm">
  <Card.Header class="service-popup-header">
    <div class="service-popup-title-group">
      <h2>{serviceName()}</h2>
      {#if service.name}<p>{serviceTypeLabel()}</p>{/if}
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

  <Card.Content class="service-popup-content">
    {#if availableDemandRows.length > 0}
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
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.maplibregl-popup-content .service-details-popup) {
    width: min(20rem, calc(100vw - 1rem));
    max-height: min(28rem, calc(100vh - 4rem));
    overflow-y: auto;
    gap: 0;
    padding-block: 0;
    border: 1px solid #d7d7d7;
    background: #ffffff;
    color: #111111;
    box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 16%);
  }

  :global(.service-popup-header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    min-height: 4.1rem;
    padding: 0.75rem 0.75rem 0.7rem 0.9rem;
    border-bottom: 1px solid #eeeeee;
  }

  :global(.service-popup-content) {
    padding: 0;
  }

  .service-popup-title-group {
    flex: 1 1 auto;
    min-width: 0;
    padding-top: 0.1rem;
  }

  :global(.service-popup-header h2) {
    margin: 0;
    color: #111111;
    font-size: 1.08rem;
    font-weight: 750;
    letter-spacing: -0.025em;
    line-height: 1.08;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  :global(.service-popup-header p) {
    margin: 0.2rem 0 0;
    color: #6a6a6a;
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
    border-color: #c8d1cd;
    border-radius: 0.65rem;
    background: #f8faf9;
    color: #263139;
    box-shadow: 0 0.1rem 0.25rem rgb(16 24 32 / 5%);
  }

  :global(.service-popup-close:hover) {
    border-color: #8da79d;
    background: #eef5f1;
    color: #19332f;
  }

  :global(.service-popup-close:focus-visible) {
    border-color: #66827c;
    box-shadow: 0 0 0 3px rgb(102 130 124 / 18%);
  }

  .metric-card dt {
    color: #666666;
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
    border: 1px solid #d7d7d7;
    border-radius: 0.6rem;
    background: #ffffff;
    box-shadow: 0 0.15rem 0.4rem rgb(0 0 0 / 4%);
  }

  .demand-card-heading {
    display: block;
  }

  .demand-card-heading h4 {
    margin: 0;
    color: #111111;
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
    border: 1px solid #e1e1e1;
    border-radius: 0.42rem;
    background: #fafafa;
  }

  .metric-card dd {
    margin: 0;
    color: #111111;
    font-size: 0.76rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  :global(.maplibregl-popup-content) {
    padding: 0;
    border: 0;
    border-radius: 1rem;
    background: #ffffff;
    box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 16%);
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
