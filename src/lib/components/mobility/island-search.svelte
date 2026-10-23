<script lang="ts">
  import { Input } from '$components/ui/input';
  import { Skeleton } from '$components/ui/skeleton';

  import { scorePercentage } from './score-presentation';

  export type IslandSearchOption = {
    id: string;
    name: string;
    atollName: string;
    centroid?: [number, number];
    score: number | null;
  };

  type Props = {
    islands: readonly IslandSearchOption[];
    onIslandSelect: (island: IslandSearchOption) => void;
    loading?: boolean;
  };

  let { islands, onIslandSelect, loading = false }: Props = $props();

  let query = $state('');
  let open = $state(false);
  let filteredIslands = $derived(
    islands
      .filter((island) => `${island.atollName} ${island.name}`.toLowerCase().includes(query.trim().toLowerCase()))
      .slice(0, 3)
  );

  function selectIsland(island: IslandSearchOption): void {
    query = `${island.atollName} ${island.name}`;
    open = false;
    onIslandSelect(island);
  }

  function selectFirstIsland(): void {
    const island = filteredIslands[0];
    if (island) selectIsland(island);
  }
</script>

<div class="island-search">
  {#if loading}
    <Skeleton class="island-search-skeleton" aria-hidden="true" />
  {:else}
    <Input
      class="island-search-input"
      bind:value={query}
      placeholder="Search island..."
      aria-label="Search for an island"
      autocomplete="off"
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          selectFirstIsland();
        }
      }}
      onblur={() => setTimeout(() => (open = false), 120)}
    />
    {#if open && query.trim()}
      <div class="island-search-suggestions" role="listbox" aria-label="Island suggestions">
        {#if filteredIslands.length === 0}
          <p class="island-search-empty">No islands found</p>
        {:else}
          {#each filteredIslands as island (island.id)}
            <button
              class="island-search-suggestion"
              type="button"
              role="option"
              aria-selected="false"
              onpointerdown={(event) => {
                event.preventDefault();
                selectIsland(island);
              }}
            >
              <span>{island.atollName} {island.name}</span>
              <strong>{scorePercentage(island.score)}</strong>
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .island-search {
    position: relative;
    width: min(19rem, calc(100vw - 2rem));
    padding: 0.6rem;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.55rem;
    background: #ffffff;
    box-shadow: 0 0.35rem 1.3rem rgb(16 24 32 / 12%);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
  }
  :global(.island-search-skeleton) {
    width: 100%;
    height: 2rem;
    border-radius: 0.38rem;
  }
  :global(.island-search-input) {
    width: 100%;
    height: 2rem;
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: #ffffff;
    color: var(--mobility-text, #09090b);
    font-size: 0.68rem;
    font-weight: 650;
  }
  :global(.island-search-input::placeholder) {
    color: #7a858a;
  }
  :global(.island-search-input:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: #ffffff;
    box-shadow: 0 0 0 3px rgb(9 9 11 / 16%);
  }
  .island-search-suggestions {
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    left: 0;
    z-index: 10;
    display: grid;
    max-height: 14rem;
    overflow-y: auto;
    padding: 0.3rem;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 0.42rem;
    background: #ffffff;
    box-shadow: 0 0.45rem 1.1rem rgb(16 24 32 / 12%);
  }
  .island-search-suggestion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.48rem 0.5rem;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: var(--mobility-text, #09090b);
    cursor: pointer;
    font-size: 0.68rem;
    text-align: left;
  }
  .island-search-suggestion:hover,
  .island-search-suggestion:focus-visible {
    background: var(--mobility-accent-soft, #f4f4f5);
    outline: none;
  }
  .island-search-suggestion span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .island-search-suggestion strong {
    flex: 0 0 auto;
    color: var(--mobility-accent, #09090b);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }
  .island-search-empty {
    margin: 0;
    padding: 0.5rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.68rem;
  }
  :global(.island-search [data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  @media (max-width: 480px) {
    .island-search {
      width: min(19rem, calc(100vw - 1.3rem));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.island-search [data-slot='skeleton']) {
      animation: none;
    }
  }
</style>
