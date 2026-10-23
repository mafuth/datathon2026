<script lang="ts">
  import type { IslandPopulationBand } from './island-profile';

  import { populationComposition, populationWaffle } from './island-chart-data';

  let { bands, total }: { bands: readonly IslandPopulationBand[]; total: number | null } = $props();
  let parts = $derived(populationComposition(bands, total));
  let cells = $derived(parts ? populationWaffle(parts) : []);
</script>

{#if parts}
  <div class="population-composition">
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
      <p>Each square is about 1% of residents. Exact counts are shown.</p>
    </div>
  </div>
{/if}

<style>
  .population-composition {
    display: grid;
    grid-template-columns: 6.8rem minmax(0, 1fr);
    align-items: start;
    gap: 0.8rem;
    margin: 0.8rem 0 0.9rem;
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
    background: var(--mobility-accent, #09090b);
  }
  .part-1 {
    background: var(--mobility-muted, #71717a);
  }
  .part-2 {
    background: #a1a1aa;
  }
  .part-3 {
    background: var(--mobility-border-strong, #d4d4d8);
  }
  .population-key {
    min-width: 0;
  }
  dl {
    display: grid;
    gap: 0.55rem;
    margin: 0;
  }
  dl > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.25rem 0.4rem;
  }
  dt {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
    line-height: 1.4;
  }
  dt i {
    width: 0.38rem;
    height: 0.38rem;
    flex: 0 0 auto;
    border-radius: 1px;
  }
  dd {
    margin: 0;
    text-align: right;
    color: var(--mobility-text, #09090b);
    font-size: 0.62rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  dd span {
    display: block;
    margin-top: 0.12rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.54rem;
    font-weight: 500;
  }
  p {
    margin: 0.65rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.54rem;
    line-height: 1.45;
  }
  @media (max-width: 420px) {
    .population-composition {
      grid-template-columns: 6.1rem minmax(0, 1fr);
      gap: 0.6rem;
    }
  }
</style>
