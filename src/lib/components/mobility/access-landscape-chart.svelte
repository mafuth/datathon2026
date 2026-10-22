<script lang="ts">
  import type { AnalyticsIsland } from './national-analytics-card.svelte';

  import { Circle, Points, ScatterChart } from 'layerchart';

  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Input } from '$components/ui/input';
  import { Skeleton } from '$components/ui/skeleton';

  import { scorePercentage } from './score-presentation';

  type Props = {
    islands: readonly AnalyticsIsland[];
    loading?: boolean;
    onIslandSelect: (island: AnalyticsIsland) => void;
  };

  type AccessPoint = {
    island: AnalyticsIsland;
    label: string;
    health: number;
    education: number;
    transport: number | null;
  };

  let { islands, loading = false, onIslandSelect }: Props = $props();
  let query = $state('');
  let selectedId = $state<string | null>(null);
  let suggestionsOpen = $state(false);
  let activeIndex = $state(0);

  let points = $derived(
    islands.flatMap((island): AccessPoint[] => {
      const health = island.health.score;
      const education = island.education.score;
      if (!validScore(health) || !validScore(education)) return [];

      return [
        {
          island,
          label: islandLabel(island),
          health,
          education,
          transport: validScore(island.transport.score) ? island.transport.score : null
        }
      ];
    })
  );
  let availablePoints = $derived(points.filter((point) => point.transport !== null));
  let unavailablePoints = $derived(points.filter((point) => point.transport === null));
  let filteredIslands = $derived(
    islands.filter((island) => islandLabel(island).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  );
  let activeIsland = $derived(filteredIslands[activeIndex] ?? filteredIslands[0] ?? null);
  let selectedIsland = $derived(islands.find((island) => island.id === selectedId) ?? null);

  function validScore(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function islandLabel(island: AnalyticsIsland): string {
    return `${island.atollName} ${island.name}`;
  }

  function inspectIsland(island: AnalyticsIsland): void {
    selectedId = island.id;
    query = islandLabel(island);
    suggestionsOpen = false;
    activeIndex = 0;
  }

  function selectActiveIsland(): void {
    if (activeIsland) inspectIsland(activeIsland);
  }

  function handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      suggestionsOpen = true;
      activeIndex = filteredIslands.length ? (activeIndex + 1) % filteredIslands.length : 0;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      suggestionsOpen = true;
      activeIndex = filteredIslands.length ? (activeIndex - 1 + filteredIslands.length) % filteredIslands.length : 0;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectActiveIsland();
    } else if (event.key === 'Escape') {
      suggestionsOpen = false;
      activeIndex = 0;
    }
  }

  function dotColor(value: number | null): string {
    if (value === null) return '#a1a1aa';

    const score = Math.max(0, Math.min(100, value));
    if (score < 50) return mix('#dc2626', '#d97706', score / 50);
    return mix('#d97706', '#16a34a', (score - 50) / 50);
  }

  function accessFill(point: AccessPoint): string {
    return dotColor(point.transport);
  }

  function mix(start: string, end: string, amount: number): string {
    const startRgb = hexRgb(start);
    const endRgb = hexRgb(end);
    const channels = startRgb.map((channel, index) =>
      Math.round(channel + ((endRgb[index] ?? channel) - channel) * amount)
    );
    return `rgb(${channels.join(', ')})`;
  }

  function hexRgb(value: string): number[] {
    return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset + 1, offset + 3), 16));
  }
</script>

<Card.Root class="insight-card access-landscape-card" size="sm">
  <Card.Header class="access-landscape-header">
    <Card.Title>Access across islands</Card.Title>
  </Card.Header>

  <Card.Content class="access-landscape-content">
    {#if loading}
      <div class="chart-loading" role="status" aria-label="Loading access across islands">
        <Skeleton class="chart-loading-main" />
        <Skeleton class="chart-loading-line" />
      </div>
    {:else if points.length === 0}
      <p class="chart-empty" role="status">No paired health and education access scores are available.</p>
    {:else}
      <div
        class="chart-frame"
        role="img"
        aria-label="Health and education access by island, coloured by transport access"
      >
        <ScatterChart
          data={points}
          x="health"
          y="education"
          xDomain={[0, 100]}
          yDomain={[0, 100]}
          xNice={false}
          yNice={false}
          height={245}
          padding={{ top: 16, right: 12, bottom: 34, left: 42 }}
          tooltipContext={false}
          highlight={false}
          series={[
            {
              key: 'available',
              data: availablePoints
            },
            {
              key: 'unavailable',
              data: unavailablePoints
            }
          ]}
          props={{
            xAxis: { format: 'none', label: 'Health access (%)' },
            yAxis: { format: 'none', label: 'Education access (%)' },
            tooltip: { root: { class: 'access-landscape-tooltip-hidden' } }
          }}
        >
          {#snippet marks({ context })}
            {#each context.series.visibleSeries as series (series.key)}
              <Points seriesKey={series.key}>
                {#snippet children({ points: chartPoints })}
                  {#each chartPoints as point (point.data.island.id)}
                    {@const pointData = point.data as AccessPoint}
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={6}
                      fill={pointData.transport === null ? '#a1a1aa' : accessFill(pointData)}
                      stroke={pointData.transport === null ? '#52525b' : '#ffffff'}
                      strokeWidth={1.5}
                      fillOpacity={1}
                      onpointerenter={() => inspectIsland(pointData.island)}
                    />
                  {/each}
                {/snippet}
              </Points>
            {/each}
          {/snippet}
        </ScatterChart>
      </div>

      <div class="chart-legend" aria-label="Transport access legend">
        <span>low</span>
        <span class="legend-scale" aria-hidden="true"></span>
        <span>high</span>
        <span class="legend-unavailable"><i></i>No data</span>
      </div>

      <div class="inspect-block">
        <div class="search-control">
          <Input
            class="island-search-input"
            bind:value={query}
            placeholder="Inspect an island..."
            aria-label="Search for an island"
            aria-controls="access-island-suggestions"
            aria-expanded={suggestionsOpen && query.trim().length > 0}
            autocomplete="off"
            role="combobox"
            onfocus={() => (suggestionsOpen = query.trim().length > 0)}
            oninput={() => {
              activeIndex = 0;
              suggestionsOpen = true;
            }}
            onkeydown={handleSearchKeydown}
            onblur={() => setTimeout(() => (suggestionsOpen = false), 120)}
          />
          {#if suggestionsOpen && query.trim()}
            <div
              id="access-island-suggestions"
              class="search-suggestions"
              role="listbox"
              aria-label="Island suggestions"
            >
              {#if filteredIslands.length === 0}
                <p class="search-empty">No islands found</p>
              {:else}
                {#each filteredIslands as island, index (island.id)}
                  <Button
                    class="search-suggestion"
                    variant="ghost"
                    size="sm"
                    type="button"
                    role="option"
                    aria-selected={activeIsland?.id === island.id}
                    onpointerdown={(event) => {
                      event.preventDefault();
                      inspectIsland(island);
                    }}
                    onmouseenter={() => (activeIndex = index)}
                  >
                    <span>{islandLabel(island)}</span>
                    <strong>{scorePercentage(island.overall.score)}</strong>
                  </Button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="inspection" aria-live="polite">
        {#if selectedIsland}
          <div class="inspection-heading">
            <div>
              <strong>{islandLabel(selectedIsland)}</strong>
              <span>Selection updates this detail only.</span>
            </div>
            <Button
              class="view-more-button"
              variant="ghost"
              size="xs"
              type="button"
              onclick={() => onIslandSelect(selectedIsland)}
            >
              View more
            </Button>
          </div>
          <dl class="inspection-metrics">
            <div>
              <dt>Health</dt>
              <dd>{scorePercentage(selectedIsland.health.score)}</dd>
            </div>
            <div>
              <dt>Education</dt>
              <dd>{scorePercentage(selectedIsland.education.score)}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>{scorePercentage(selectedIsland.transport.score)}</dd>
            </div>
          </dl>
        {:else}
          <div class="inspection-empty-state">Select an island</div>
        {/if}
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  :global(.access-landscape-card) {
    --access-bad: #dc2626;
    --access-mid: #d97706;
    --access-good: #16a34a;
    min-width: 0;
    margin-top: 0.8rem;
    padding: 0.72rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    border-radius: 0.42rem;
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
  }

  :global(.access-landscape-header) {
    gap: 0.22rem;
  }

  :global(.access-landscape-header [data-slot='card-title']) {
    color: var(--mobility-text, #09090b);
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: -0.02em;
  }

  :global(.access-landscape-content) {
    min-width: 0;
    padding-top: 0;
  }

  .chart-frame {
    min-width: 0;
    margin: 0 -0.35rem;
  }

  :global(.chart-frame .lc-root-container) {
    color: var(--mobility-muted, #71717a);
    font-size: 0.55rem;
  }

  :global(.chart-frame .lc-root-container text) {
    fill: var(--mobility-muted, #71717a);
  }

  :global(.chart-frame .lc-root-container path),
  :global(.chart-frame .lc-root-container line) {
    stroke: var(--mobility-border, #e4e4e7);
  }

  :global(.access-landscape-tooltip-hidden) {
    display: none !important;
  }

  .chart-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.65rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
  }

  .legend-scale {
    display: block;
    width: 7rem;
    height: 0.45rem;
    overflow: hidden;
    border: 1px solid var(--mobility-border-strong, #d4d4d8);
    border-radius: 999px;
    background: linear-gradient(90deg, var(--access-bad) 0%, var(--access-mid) 50%, var(--access-good) 100%);
  }

  .legend-unavailable {
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    margin-left: auto;
  }

  .legend-unavailable i {
    width: 0.42rem;
    height: 0.42rem;
    border: 1px solid #52525b;
    border-radius: 50%;
    background: #a1a1aa;
  }

  .inspect-block {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.75rem;
  }

  .search-control {
    position: relative;
  }

  :global(.island-search-input) {
    width: 100%;
    height: 2rem;
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
    font-size: 0.68rem;
    font-weight: 650;
  }

  :global(.island-search-input::placeholder) {
    color: var(--mobility-muted, #71717a);
  }

  .search-suggestions {
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
    background: var(--mobility-surface, #ffffff);
    box-shadow: 0 0.45rem 1.1rem rgb(16 24 32 / 12%);
  }

  :global(.search-suggestion) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: 0;
    padding: 0.48rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    color: var(--mobility-text, #09090b);
    font-size: 0.68rem;
    text-align: left;
  }

  :global(.search-suggestion:hover),
  :global(.search-suggestion:focus-visible),
  :global(.search-suggestion[aria-selected='true']) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
    color: var(--mobility-text, #09090b);
    outline: none;
  }

  :global(.search-suggestion span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.search-suggestion strong) {
    flex: 0 0 auto;
    color: var(--mobility-text, #09090b);
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }

  .search-empty,
  .chart-empty {
    margin: 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.62rem;
    line-height: 1.45;
  }

  .search-empty {
    padding: 0.5rem;
  }

  .chart-empty {
    padding: 1rem 0;
  }

  .chart-loading {
    display: grid;
    gap: 0.55rem;
    padding: 0.35rem 0 0.2rem;
  }

  :global(.chart-loading-main) {
    width: 100%;
    height: 15rem;
    border-radius: 0.4rem;
  }

  :global(.chart-loading-line) {
    width: 65%;
    height: 0.5rem;
    border-radius: 999px;
  }

  .inspection {
    min-height: 4.4rem;
    margin-top: 0.7rem;
    padding: 0.65rem 0.7rem;
    border: 1px solid var(--mobility-border, #e4e4e7);
    border-radius: 0.42rem;
    background: var(--mobility-surface-soft, #fafafa);
  }

  .inspection-empty-state {
    display: grid;
    min-height: 3.1rem;
    place-items: center;
    color: var(--mobility-muted, #71717a);
    font-size: 0.65rem;
    font-weight: 700;
  }

  .inspection-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .inspection-heading > div {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .inspection-heading strong {
    overflow: hidden;
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspection-heading span {
    color: var(--mobility-muted, #71717a);
    font-size: 0.55rem;
  }

  :global(.view-more-button) {
    border-color: var(--mobility-accent, #09090b);
    background: var(--mobility-accent, #09090b);
    color: #ffffff;
    font-size: 0.56rem;
  }

  :global(.view-more-button:hover),
  :global(.view-more-button:focus-visible) {
    border-color: var(--mobility-focus, #27272a);
    background: var(--mobility-focus, #27272a);
    color: #ffffff;
  }

  .inspection-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    margin: 0.65rem 0 0;
  }

  .inspection-metrics div {
    display: grid;
    gap: 0.1rem;
  }

  .inspection-metrics dt {
    color: var(--mobility-muted, #71717a);
    font-size: 0.52rem;
  }

  .inspection-metrics dd {
    margin: 0;
    color: var(--mobility-text, #09090b);
    font-size: 0.72rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 480px) {
    .inspection-heading {
      display: grid;
    }

    .legend-unavailable {
      margin-left: 0;
    }
  }
</style>
