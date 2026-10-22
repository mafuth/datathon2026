<script lang="ts">
  import type { IslandPopulationBand } from './island-profile';

  import { populationComposition, populationWaffle } from './island-chart-data';

  let { bands, total }: { bands: readonly IslandPopulationBand[]; total: number | null } = $props();
  let parts = $derived(populationComposition(bands, total));
  let cells = $derived(parts ? populationWaffle(parts) : []);
</script>

{#if parts}
  <div class="population-composition" data-testid="island-population-composition">
    <div class="waffle" aria-hidden="true">
      {#each cells as key, index (`${key}-${index}`)}
        <span class={`cell part-${parts.findIndex((part) => part.key === key)}`}></span>
      {/each}
    </div>
    <div class="population-key">
      <dl aria-label="Population age composition">
        {#each parts as part, index (part.key)}
          <div>
            <dt><i class={`part-${index}`} aria-hidden="true"></i>{part.label}</dt>
            <dd>{Math.round(part.amount).toLocaleString()} <span>{Math.round(part.share)}%</span></dd>
          </div>
        {/each}
      </dl>
      <p>Each square ≈ 1% of residents. Rounded to 100 squares; exact counts shown.</p>
    </div>
  </div>
{/if}

<style>
  .population-composition {
    display: grid;
    grid-template-columns: 7.3rem minmax(0, 1fr);
    align-items: start;
    gap: 1rem;
    margin: 0.85rem 0 0.95rem;
  }
  .waffle {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 3px;
    aspect-ratio: 1;
  }
  .cell {
    display: block;
    border-radius: 2px;
  }
  .part-0 {
    background: var(--mobility-chart-children);
  }
  .part-1 {
    background: var(--mobility-chart-working-age);
  }
  .part-2 {
    background: var(--mobility-chart-older);
  }
  .part-3 {
    background: var(--mobility-chart-unclassified);
  }
  .population-key {
    min-width: 0;
  }
  dl {
    display: grid;
    gap: 0.65rem;
    margin: 0;
  }
  dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.25rem 0.5rem;
  }
  dt {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  dt i {
    width: 0.4rem;
    height: 0.4rem;
    flex: 0 0 auto;
    border-radius: 1px;
  }
  dd {
    margin: 0;
    text-align: right;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  dd span {
    display: block;
    margin-top: 0.15rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  p {
    margin: 0.75rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.5;
  }
  @container (max-width: 330px) {
    .population-composition {
      grid-template-columns: 6.3rem minmax(0, 1fr);
      gap: 0.65rem;
    }
  }
  @media (max-width: 420px) {
    .population-composition {
      grid-template-columns: 6.3rem minmax(0, 1fr);
      gap: 0.65rem;
    }
  }
</style>
