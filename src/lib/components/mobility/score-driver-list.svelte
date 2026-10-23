<script lang="ts">
  import { Skeleton } from '$components/ui/skeleton';
  import * as Table from '$components/ui/table';

  import { scoreColor, scorePercentage } from './score-presentation';

  export type ScoreDriver = {
    key: string;
    label: string;
    score: number | null | undefined;
    higherIsWorse?: boolean;
  };

  type Props = {
    drivers: readonly ScoreDriver[];
    loading?: boolean;
  };

  let { drivers, loading = false }: Props = $props();

  let driverSkeletons = $derived(Array.from({ length: drivers.length || 5 }, (_, index) => index));

  function driverColor(driver: ScoreDriver): string {
    return scoreColor(driver.score, { higherIsWorse: driver.higherIsWorse });
  }
</script>

<section class="score-drivers" aria-label="Score drivers">
  <Table.Root class="driver-table" aria-label="Score drivers" aria-busy={loading}>
    <Table.Caption class="sr-only">Score drivers</Table.Caption>
    <Table.Header class="sr-only">
      <Table.Row>
        <Table.Head>Driver</Table.Head>
        <Table.Head>Score</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if loading}
        {#each driverSkeletons as row (row)}
          <Table.Row class="driver-table-row" aria-hidden="true">
            <Table.Cell class="driver-table-cell">
              <Skeleton class="driver-label-skeleton" />
            </Table.Cell>
            <Table.Cell class="driver-table-cell driver-score-cell">
              <Skeleton class="driver-score-skeleton" />
            </Table.Cell>
          </Table.Row>
        {/each}
      {:else}
        {#each drivers as driver (driver.key)}
          {@const color = driverColor(driver)}
          <Table.Row class="driver-table-row">
            <Table.Cell class="driver-table-cell driver-label">{driver.label}</Table.Cell>
            <Table.Cell class="driver-table-cell driver-score-cell">
              <strong class="driver-score" style={`color: ${color}`}>{scorePercentage(driver.score)}</strong>
            </Table.Cell>
          </Table.Row>
        {:else}
          <Table.Row class="driver-table-row">
            <Table.Cell class="driver-table-cell" colspan={2}>
              <p class="driver-empty">Score drivers are unavailable.</p>
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</section>

<style>
  .score-drivers {
    margin-top: 0.35rem;
    padding-top: 0.35rem;
  }
  :global(.driver-table) {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    color: var(--mobility-text, #09090b);
  }
  :global(.driver-table-row) {
    border-color: var(--mobility-border, #e4e4e7);
  }
  :global(.driver-table-row:hover) {
    background: var(--mobility-surface-soft, #fafafa);
  }
  :global(.driver-table-row:last-child) {
    border-bottom: 0;
  }
  :global(.driver-table-cell) {
    padding: 0.42rem 0.4rem;
    vertical-align: middle;
    white-space: normal;
  }
  :global(.driver-label) {
    min-width: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.68rem;
    font-weight: 780;
    line-height: 1.15;
  }
  .driver-score {
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  :global(.driver-score-cell) {
    width: 5.8rem;
    padding-right: 0.45rem;
    text-align: right;
  }
  .driver-empty {
    margin: 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
  }
  :global(.driver-table [data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  :global(.driver-label-skeleton) {
    width: 7.2rem;
    height: 0.48rem;
  }
  :global(.driver-score-skeleton) {
    width: 2rem;
    height: 0.7rem;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.driver-table [data-slot='skeleton']) {
      animation: none;
    }
  }
</style>
