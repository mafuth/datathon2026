<script lang="ts">
  import type { ConnectionNetworkView } from './connection-network';
  import type { IslandProfile } from './island-profile';
  import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';

  import { Input } from '$components/ui/input';

  import ConnectionNetworkCanvas from './connection-network-canvas.svelte';

  type Props = {
    profile: IslandProfile | null;
    network: ConnectionNetworkResponse | null;
    networkLoading?: boolean;
    networkError?: string | null;
    selectedIslandId: string | null;
    view?: ConnectionNetworkView;
    onIslandSelect?: (islandId: string) => void;
    onSimulate?: (destinationIslandId: string) => void;
  };

  let {
    profile,
    network,
    networkLoading = false,
    networkError = null,
    selectedIslandId,
    view = 'sidebar',
    onIslandSelect = () => {},
    onSimulate
  }: Props = $props();

  let destinationSearch = $state('');
  let destinationSearchOpen = $state(false);
  let destinationIslandId = $state<string | null>(null);
  let destinationSourceId = $state<string | null>(null);
  let destinationOptions = $derived(
    (network?.islandDirectory ?? network?.islands ?? [])
      .filter((island) =>
        `${island.atollName} ${island.name}`.toLowerCase().includes(destinationSearch.trim().toLowerCase())
      )
      .slice(0, 8)
  );

  function selectDestination(island: { id: string; name: string; atollName: string }): void {
    destinationSearch = `${island.atollName} ${island.name}`;
    destinationIslandId = island.id;
    destinationSearchOpen = false;
  }

  function selectFirstDestination(): void {
    const island = destinationOptions[0];
    if (island) selectDestination(island);
  }

  $effect(() => {
    if (destinationSourceId === selectedIslandId) return;
    destinationSourceId = selectedIslandId;
    destinationSearch = '';
    destinationIslandId = null;
    destinationSearchOpen = false;
  });
</script>

<div class={['connection-network', { 'connection-network-fullscreen-shell': view === 'fullscreen' }]}>
  {#if networkError && !network}
    <div class="connection-network-status connection-network-error" role="alert">{networkError}</div>
  {:else if networkLoading && !network}
    <div class="connection-network-status connection-network-loading" role="status" aria-live="polite">
      <span>Loading connection network…</span>
    </div>
  {:else if view === 'fullscreen' && network && network.islands.length === 0}
    <div class="connection-network-status" role="status">No mapped Maldives connection data is available.</div>
  {:else if profile || (view === 'fullscreen' && network)}
    {#if view === 'fullscreen'}
      <div class="connection-destination-search">
        <Input
          class="connection-destination-input"
          bind:value={destinationSearch}
          placeholder="Search destination island..."
          aria-label="Search destination island"
          autocomplete="off"
          onfocus={() => (destinationSearchOpen = true)}
          oninput={() => (destinationSearchOpen = true)}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              selectFirstDestination();
            }
          }}
          onblur={() => setTimeout(() => (destinationSearchOpen = false), 120)}
        />
        {#if destinationSearchOpen && destinationSearch.trim()}
          <div class="connection-destination-suggestions" role="listbox" aria-label="Destination islands">
            {#if destinationOptions.length === 0}
              <p>No islands found</p>
            {:else}
              {#each destinationOptions as island (island.id)}
                <button
                  type="button"
                  role="option"
                  aria-selected={destinationIslandId === island.id}
                  onpointerdown={(event) => {
                    event.preventDefault();
                    selectDestination(island);
                  }}
                >
                  {island.atollName}
                  {island.name}
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    {#key `${view}:${selectedIslandId ?? profile?.island.id ?? ''}:${destinationIslandId ?? ''}`}
      <ConnectionNetworkCanvas
        {profile}
        {network}
        {selectedIslandId}
        targetIslandId={destinationIslandId}
        {view}
        {onIslandSelect}
        {onSimulate}
      />
    {/key}
  {:else}
    <div class="connection-network-status" role="status">No mapped connection network is available.</div>
  {/if}
</div>

<style>
  .connection-network {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    flex-direction: column;
    margin-top: 0.8rem;
  }

  .connection-network-fullscreen-shell {
    height: 100%;
    margin-top: 0;
  }

  .connection-destination-search {
    position: relative;
    z-index: 20;
    width: min(22rem, calc(100vw - 2rem));
    margin: 0 auto 0.65rem;
    color-scheme: light;
  }

  :global(.connection-destination-input) {
    height: 2.25rem;
    border: 1px solid #d4d4d8 !important;
    border-radius: 0.5rem;
    background: #ffffff !important;
    color: #18181b !important;
    color-scheme: light;
    box-shadow: 0 1px 2px rgb(24 24 27 / 5%);
    font-size: 0.8rem;
  }

  :global(.connection-destination-input::placeholder) {
    color: #a1a1aa !important;
  }

  :global(.connection-destination-input:focus-visible) {
    border-color: #71717a !important;
    outline: none;
    box-shadow: 0 0 0 3px rgb(24 24 27 / 12%);
  }

  :global(.connection-destination-input:disabled) {
    background: #f4f4f5 !important;
    color: #71717a !important;
  }

  .connection-destination-suggestions {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    left: 0;
    display: grid;
    max-height: 16rem;
    overflow: auto;
    padding: 0.3rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 0.6rem 1.4rem rgb(24 24 27 / 14%);
  }

  .connection-destination-suggestions button {
    min-height: 2.1rem;
    padding: 0.45rem 0.65rem;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    color: #18181b;
    text-align: left;
  }

  .connection-destination-suggestions button:hover,
  .connection-destination-suggestions button:focus-visible {
    background: #f4f4f5;
    outline: none;
  }

  .connection-destination-suggestions p {
    margin: 0;
    padding: 0.5rem;
    color: #71717a;
    font-size: 0.75rem;
  }

  .connection-network-status {
    display: grid;
    min-height: 16rem;
    place-items: center;
    padding: 2rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.7rem;
    background: #fafafa;
    color: #71717a;
    font-size: 0.68rem;
    text-align: center;
  }

  .connection-network-loading {
    display: flex;
    min-height: 16rem;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }
</style>
