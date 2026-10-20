<script lang="ts">
  import Hospital from '@lucide/svelte/icons/hospital';
  import Route from '@lucide/svelte/icons/route';
  import School from '@lucide/svelte/icons/school';
  import Ship from '@lucide/svelte/icons/ship';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { Skeleton } from '$components/ui/skeleton';

  type ComponentScore = {
    score: number | null;
    coverageRatio: number;
    status: string;
    denominatorPopulation: number | null;
    numericPopulation: number | null;
    evidenceCount: number;
    limitations: string[];
  };

  type DemandMetric = {
    local: number;
    inbound: number;
    outbound: number;
    unserved: number;
    combined: number;
    demandPercent: number | null;
    outboundPercent: number | null;
  };

  type HealthCareDemand = {
    children: DemandMetric | null;
    elderly: DemandMetric | null;
  };

  type DemandSummary = {
    population: number | null;
    health: DemandMetric;
    education: DemandMetric;
    healthCareDemand: HealthCareDemand;
    healthByNeed: Record<string, DemandMetric>;
    educationByNeed: Record<string, DemandMetric>;
    localTotal: number;
    inboundTotal: number;
    outboundTotal: number;
    unservedTotal: number;
    combinedTotal: number;
    inboundSources: DemandSource[];
  };

  type DemandSource = {
    originIslandId: string;
    originName: string;
    originAtollName: string;
    health: number;
    education: number;
    total: number;
  };

  type TransportDemandStop = {
    stopId: string;
    stopName: string | null;
    subtype: string;
    mode: 'land' | 'marine' | 'air';
    connectedIslandIds: string[];
    localDemand: number;
    connectedDemand: number;
    workingDemand: number;
    studentDemand: number;
    elderlyDemand: number;
    careTransferDemand: number;
    totalDemand: number;
    capacity: number;
    loadRatio: number;
    score: number;
  };

  type TransportDemandSummary = {
    workingDemand: number;
    studentDemand: number;
    elderlyDemand: number;
    careTransferDemand: number;
    totalDemand: number;
    averageLoad: number | null;
    score: number | null;
    modes: Record<
      string,
      {
        stopCount: number;
        totalDemand: number;
        careTransferDemand: number;
        averageLoad: number | null;
        score: number | null;
      }
    >;
  };

  export type AnalyticsIsland = {
    id: string;
    name: string;
    atollName: string;
    centroid?: [number, number];
    population: number | null;
    overall: ComponentScore;
    health: ComponentScore;
    education: ComponentScore;
    transport: ComponentScore;
    crowdedness: {
      score: number | null;
      population: number | null;
      pressure: number | null;
      populationDensity: number | null;
      landAreaKm2: number | null;
    };
    transportModes: {
      land: ComponentScore;
      marine: ComponentScore;
      air: ComponentScore;
    };
    transportDemand: TransportDemandSummary & { stops: TransportDemandStop[] };
    demand: {
      score: number | null;
      status: string;
      coverageRatio: number;
      population: number | null;
      health: DemandMetric;
      education: DemandMetric;
      healthCareDemand: HealthCareDemand;
      healthByNeed: Record<string, DemandMetric>;
      educationByNeed: Record<string, DemandMetric>;
      localTotal: number;
      inboundTotal: number;
      outboundTotal: number;
      unservedTotal: number;
      combinedTotal: number;
      inboundSources: DemandSource[];
      inboundHealthPressure: number | null;
      inboundEducationPressure: number | null;
      healthPressure: number | null;
      educationPressure: number | null;
    };
    evidence: {
      populationRows: number;
      healthServices: number;
      educationServices: number;
      transportServices: number;
      transportConnections: number;
    };
    limitations: string[];
  };

  export type AnalyticsData = {
    national: {
      score: number | null;
      status: string;
      islandCount: number;
      inhabitedIslandCount: number;
      scoredIslandCount: number;
      partialIslandCount: number;
      unavailableIslandCount: number;
      categories: Record<string, ComponentScore>;
      limitations: string[];
      demand: DemandSummary;
      transportDemand: TransportDemandSummary;
    };
    population: { total: number; children: number; adolescents: number; youth: number; elderly: number };
    islands: AnalyticsIsland[];
    rankings: {
      demand: string[];
      outbound: string[];
      underserved: string[];
      overall: string[];
      health: string[];
      education: string[];
      transport: string[];
    };
  };

  type Driver = {
    key: string;
    label: string;
    score: number | null;
    status: string;
    coverage: number;
    note: string;
  };

  type Props = {
    open?: boolean;
    data: AnalyticsData | null;
    loading?: boolean;
    error?: string | null;
    onIslandSelect: (island: AnalyticsIsland) => void;
    proposalMode?: boolean;
  };

  let {
    open = $bindable(false),
    data,
    loading = false,
    error = null,
    onIslandSelect,
    proposalMode = false
  }: Props = $props();
  let closeButton = $state<HTMLButtonElement | HTMLAnchorElement | null>(null);
  let selectedCategory = $state<'overall' | 'health' | 'education' | 'transport'>('overall');

  const populationGroups = [
    { label: 'Children', key: 'children' },
    { label: 'Adolescents', key: 'adolescents' },
    { label: 'Youth', key: 'youth' },
    { label: 'Elderly', key: 'elderly' }
  ] as const;
  const categoryTabs = [
    { key: 'overall', label: 'Overall' },
    { key: 'health', label: 'Health' },
    { key: 'education', label: 'Education' },
    { key: 'transport', label: 'Transport' }
  ] as const;
  const driverSkeletons = ['Health', 'Education', 'Transport', 'Crowdedness', 'External demand'] as const;
  const hotspotSkeletons = ['one', 'two', 'three'] as const;
  const rankingSkeletons = [0, 1, 2, 3] as const;

  let drivers = $derived.by((): Driver[] => {
    if (!data) return [];
    const category = data.national.categories;
    return [
      {
        key: 'health',
        label: 'Health',
        score: category.health?.score ?? null,
        status: category.health?.status ?? 'unavailable',
        coverage: category.health?.coverageRatio ?? 0,
        note: 'Population-weighted health access'
      },
      {
        key: 'education',
        label: 'Education',
        score: category.education?.score ?? null,
        status: category.education?.status ?? 'unavailable',
        coverage: category.education?.coverageRatio ?? 0,
        note: 'Population-weighted school access'
      },
      {
        key: 'transport',
        label: 'Transport',
        score: category.transport?.score ?? null,
        status: category.transport?.status ?? 'unavailable',
        coverage: category.transport?.coverageRatio ?? 0,
        note: 'Land, marine, and air connections'
      },
      {
        key: 'crowdedness',
        label: 'Crowdedness',
        score: category.crowdedness?.score ?? null,
        status: category.crowdedness?.status ?? 'unavailable',
        coverage: category.crowdedness?.coverageRatio ?? 0,
        note: 'Population density pressure'
      },
      {
        key: 'external-demand',
        label: 'External demand',
        score: category.externalDemand?.score ?? null,
        status: category.externalDemand?.status ?? 'unavailable',
        coverage: category.externalDemand?.coverageRatio ?? 0,
        note: 'Combined local and inbound service pressure'
      }
    ];
  });

  let categoryIslands = $derived(
    (data?.rankings[selectedCategory] ?? [])
      .map((id) => data?.islands.find((island) => island.id === id))
      .filter((island): island is AnalyticsIsland => island !== undefined)
  );
  let demandIslands = $derived(
    (data?.rankings.demand ?? [])
      .map((id) => data?.islands.find((island) => island.id === id))
      .filter((island): island is AnalyticsIsland => island !== undefined)
  );
  let outboundIslands = $derived(
    (data?.rankings.outbound ?? [])
      .map((id) => data?.islands.find((island) => island.id === id))
      .filter((island): island is AnalyticsIsland => island !== undefined)
  );
  let underservedIslands = $derived(
    (data?.rankings.underserved ?? [])
      .map((id) => data?.islands.find((island) => island.id === id))
      .filter((island): island is AnalyticsIsland => island !== undefined)
  );

  function percentage(value: number | null): string {
    return value === null ? 'N/A' : `${Math.round(value)}%`;
  }

  function categoryCoverage(
    island: AnalyticsIsland,
    category: 'overall' | 'health' | 'education' | 'transport'
  ): string {
    const component = island[category];
    if (component.score !== 0) return percentage(component.score);
    return '0%';
  }

  function number(value: number | null): string {
    return value === null ? 'N/A' : Math.round(value).toLocaleString();
  }

  function outboundShare(island: AnalyticsIsland): number | null {
    if (island.population === null || island.population <= 0) return null;
    return Math.min(100, (island.demand.outboundTotal / island.population) * 100);
  }

  function driverWidth(value: number | null): number {
    return value === null ? 0 : Math.min(100, Math.max(0, value));
  }

  function islandLabel(island: AnalyticsIsland): string {
    return `${island.atollName} ${island.name}`;
  }

  function sourceIsland(source: DemandSource): AnalyticsIsland | null {
    return data?.islands.find((island) => island.id === source.originIslandId) ?? null;
  }

  function sourceShare(source: DemandSource): number | null {
    const island = sourceIsland(source);
    if (!island || island.population === null || island.population <= 0) return null;
    return Math.min(100, (source.total / island.population) * 100);
  }

  function categoryIcon(key: string) {
    if (key === 'health') return Hospital;
    if (key === 'education') return School;
    if (key === 'transport') return Ship;
    return Users;
  }

  $effect(() => {
    if (open) void tick().then(() => closeButton?.focus());
  });
</script>

{#if open}
  <div
    class={`analytics-card-layer${proposalMode ? ' proposal-mode-right' : ''}`}
    aria-hidden={proposalMode}
    in:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 260 }}
    out:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 200 }}
  >
    <Card.Root
      class="analytics-card"
      role="dialog"
      aria-label="National accessibility analytics"
      data-story-target="national-analytics"
    >
      <div class="analytics-scroll" data-story-scroll-container>
        <section class="why-score" aria-labelledby="national-why-score-heading">
          <div class="why-heading">
            <div>
              {#if loading}
                <div id="national-why-score-heading" class="loading-title-wrap" aria-label="Loading national score">
                  <Skeleton class="loading-title" />
                </div>
              {:else}
                <h2 id="national-why-score-heading">
                  {#if data?.national.score === null || data?.national.score === undefined}
                    Why is this score unavailable?
                  {:else}
                    Why {percentage(data.national.score)}?
                  {/if}
                </h2>
              {/if}
            </div>
            <Button
              bind:ref={closeButton}
              class="close-button"
              variant="ghost"
              size="icon"
              aria-label="Close analytics"
              title="Close analytics"
              onclick={() => (open = false)}
            >
              <X size={18} strokeWidth={2.2} />
            </Button>
          </div>

          <Card.Root class="insight-card score-drivers-card" size="sm">
            {#if loading}
              <div class="driver-list" role="status" aria-label="Loading national analytics">
                {#each driverSkeletons as label (label)}
                  <div class="driver-row">
                    <div class="driver-topline">
                      <Skeleton class="loading-label" /><Skeleton class="loading-badge" />
                    </div>
                    <Skeleton class="loading-progress" /><Skeleton class="loading-note" />
                  </div>
                {/each}
              </div>
            {:else if error}
              <p class="analytics-state analytics-error" role="alert">{error}</p>
            {:else if data}
              <div class="driver-heading">
                <div>
                  <h3>Score drivers</h3>
                  <p>Each factor is weighted by the population it serves.</p>
                </div>
                <Badge class="status-badge" variant="outline">{data.national.status}</Badge>
              </div>
              <div class="driver-list">
                {#each drivers as driver (driver.key)}
                  {@const Icon = categoryIcon(driver.key)}
                  <div class="driver-row">
                    <div class="driver-topline">
                      <span class="driver-label"><Icon size={15} strokeWidth={2.2} />{driver.label}</span>
                      <Badge class={`driver-badge ${driver.status}`} variant="outline">{percentage(driver.score)}</Badge
                      >
                    </div>
                    <Progress
                      class={`driver-progress ${driver.status}`}
                      value={driverWidth(driver.score)}
                      max={100}
                      aria-label={`${driver.label} score`}
                    />
                    <span class="driver-note">{driver.note} - {Math.round(driver.coverage * 100)}% coverage</span>
                  </div>
                {/each}
              </div>
            {/if}
          </Card.Root>
        </section>

        {#if loading}
          <div class="section-divider" aria-hidden="true"></div>

          <div class="detail-grid" aria-hidden="true">
            <Card.Root class="insight-card loading-insight-card" size="sm">
              <div class="panel-heading">
                <div class="loading-copy">
                  <Skeleton class="loading-panel-heading" /><Skeleton class="loading-panel-caption" />
                </div>
                <Skeleton class="loading-panel-icon" />
              </div>
              <Skeleton class="loading-people-total" />
              <div class="age-bars">
                {#each populationGroups as group (group.key)}
                  <div class="age-row">
                    <div class="loading-age-copy">
                      <Skeleton class="loading-age-label" /><Skeleton class="loading-age-value" />
                    </div>
                    <Skeleton class="loading-age-track" />
                  </div>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="insight-card loading-insight-card" size="sm">
              <div class="panel-heading">
                <div class="loading-copy">
                  <Skeleton class="loading-panel-heading" /><Skeleton class="loading-panel-caption" />
                </div>
                <Skeleton class="loading-panel-icon" />
              </div>
              <div class="mini-list">
                {#each hotspotSkeletons as hotspot (hotspot)}
                  <div class="loading-mini-row">
                    <span class="loading-row-copy"
                      ><Skeleton class="loading-row-title" /><Skeleton class="loading-row-caption" /></span
                    ><Skeleton class="loading-row-arrow" />
                  </div>
                {/each}
              </div>
            </Card.Root>
          </div>

          <Card.Root class="insight-card ranking-card loading-insight-card" size="sm" aria-hidden="true">
            <div class="panel-heading">
              <div class="loading-copy">
                <Skeleton class="loading-panel-heading loading-wide-heading" /><Skeleton
                  class="loading-panel-caption"
                />
              </div>
              <Skeleton class="loading-priority" />
            </div>
            <div class="ranking-list">
              {#each rankingSkeletons as row (row)}
                <div class="loading-ranking-row">
                  <span class="loading-row-copy"
                    ><Skeleton class="loading-ranking-title" /><Skeleton class="loading-ranking-caption" /></span
                  ><Skeleton class="loading-ranking-score" />
                </div>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card loading-insight-card" size="sm" aria-hidden="true">
            <div class="loading-copy">
              <Skeleton class="loading-panel-heading loading-wide-heading" /><Skeleton class="loading-panel-caption" />
            </div>
            <div class="loading-category-tabs">
              {#each categoryTabs as category (category.key)}
                <Skeleton class="loading-category-tab" />
              {/each}
            </div>
            <div class="ranking-list">
              {#each rankingSkeletons as row (row)}
                <div class="loading-ranking-row">
                  <Skeleton class="loading-ranking-title loading-single-ranking-title" /><Skeleton
                    class="loading-ranking-score"
                  />
                </div>
              {/each}
            </div>
          </Card.Root>
        {:else if data && !error}
          <div class="section-divider" aria-hidden="true"></div>

          <div class="detail-grid">
            <Card.Root class="insight-card" size="sm">
              <div class="panel-heading">
                <div>
                  <h3>People & needs</h3>
                  <p>Population represented</p>
                </div>
                <Users size={17} strokeWidth={2.2} />
              </div>
              <strong class="people-total">{number(data.population.total)}</strong>
              <div class="age-bars">
                {#each populationGroups as group (group.key)}
                  {@const value = data.population[group.key]}
                  <div class="age-row">
                    <div><span>{group.label}</span><strong>{number(value)}</strong></div>
                    <div class="age-track">
                      <span
                        style={`width: ${data.population.total ? Math.min(100, (value / data.population.total) * 100) : 0}%`}
                      ></span>
                    </div>
                  </div>
                {/each}
              </div>
              <div class="demand-summary">
                <span>Local age-cohort demand <strong>{number(data.national.demand.localTotal)}</strong></span>
                <span>Inbound age-cohort demand <strong>{number(data.national.demand.inboundTotal)}</strong></span>
                <span>Outbound age-cohort demand <strong>{number(data.national.demand.outboundTotal)}</strong></span>
                <span
                  >Elderly hospital outbound <strong
                    >{number(data.national.demand.healthCareDemand.elderly?.outbound ?? 0)}</strong
                  ></span
                >
                <span
                  >Elderly care unserved <strong
                    >{number(data.national.demand.healthCareDemand.elderly?.unserved ?? 0)}</strong
                  ></span
                >
                <span
                  >Average transport load <strong>{percentage(data.national.transportDemand.averageLoad)}</strong></span
                >
                <span>Transport demand score <strong>{percentage(data.national.transportDemand.score)}</strong></span>
              </div>
            </Card.Root>

            <Card.Root class="insight-card" size="sm">
              <div class="panel-heading">
                <div>
                  <h3>External demand hotspots</h3>
                  <p>Inbound estimated need from other islands</p>
                </div>
                <Ship size={17} strokeWidth={2.2} />
              </div>
              <div class="mini-list">
                {#each demandIslands as island (island.id)}
                  <Button class="mini-row" variant="ghost" type="button" onclick={() => onIslandSelect(island)}
                    ><span
                      ><strong>{islandLabel(island)}</strong><small
                        >{number(island.demand.inboundTotal)} inbound age-cohort demand</small
                      ></span
                    ><b>&gt;</b></Button
                  >
                {/each}
              </div>
            </Card.Root>
          </div>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="panel-heading">
              <div>
                <h3>Outbound service dependence</h3>
                <p>Resident demand routed to services on another island</p>
              </div>
              <Route size={17} strokeWidth={2.2} />
            </div>
            <div class="mini-list">
              {#each outboundIslands as island (island.id)}
                <Button class="mini-row" variant="ghost" type="button" onclick={() => onIslandSelect(island)}>
                  <span>
                    <strong>{islandLabel(island)}</strong>
                    <small>{number(island.demand.outboundTotal)} outbound demand</small>
                  </span>
                  <b>{percentage(outboundShare(island))}</b>
                </Button>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="panel-heading">
              <div>
                <h3>Inbound demand origins</h3>
                <p>Islands sending service demand, highest to lowest</p>
              </div>
              <Route size={17} strokeWidth={2.2} />
            </div>
            <div class="ranking-list">
              {#each data.national.demand.inboundSources as source (source.originIslandId)}
                {@const origin = sourceIsland(source)}
                <Button
                  class="ranking-row"
                  variant="ghost"
                  type="button"
                  disabled={!origin}
                  onclick={() => {
                    if (origin) onIslandSelect(origin);
                  }}
                >
                  <span>
                    <strong>{source.originAtollName} {source.originName}</strong>
                    <small>{number(source.total)} outbound service demand</small>
                  </span>
                  <b>{percentage(sourceShare(source))}</b>
                </Button>
              {:else}
                <p class="analytics-state">No inbound demand origins are available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm" data-story-target="national-focus-areas">
            <div class="panel-heading">
              <div>
                <h3>Most underserved</h3>
                <p>High demand combined with low access</p>
              </div>
              <Badge class="priority-badge" variant="outline">Priority</Badge>
            </div>
            <div class="ranking-list">
              {#each underservedIslands as island (island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(island)}>
                  <span
                    ><strong>{islandLabel(island)}</strong><small
                      >Overall {percentage(island.overall.score)} - inbound {number(island.demand.inboundTotal)} · outbound
                      {percentage(outboundShare(island))}</small
                    ></span
                  >
                  <b>{percentage(island.overall.score)}</b>
                </Button>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="panel-heading">
              <div>
                <h3>Lowest by category</h3>
                <p>Click an island to inspect it on the map</p>
              </div>
            </div>
            <div class="category-tabs" role="tablist">
              {#each categoryTabs as category (category.key)}
                <Button
                  type="button"
                  variant={selectedCategory === category.key ? 'default' : 'outline'}
                  class={`category-tab ${selectedCategory === category.key ? 'category-active' : ''}`}
                  role="tab"
                  aria-selected={selectedCategory === category.key}
                  onclick={() => (selectedCategory = category.key)}>{category.label}</Button
                >
              {/each}
            </div>
            <div class="ranking-list">
              {#each categoryIslands as island (island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(island)}
                  ><strong>{islandLabel(island)}</strong><b>{categoryCoverage(island, selectedCategory)}</b></Button
                >
              {/each}
            </div>
          </Card.Root>
        {/if}
      </div>
    </Card.Root>
  </div>
{/if}

<style>
  :global(.analytics-card-layer) {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
  }

  .proposal-mode-right {
    will-change: transform, opacity;
    backface-visibility: hidden;
    transform: translate3d(calc(100% + 2rem), 0, 0) scale(0.985);
    opacity: 0;
    transition:
      transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 340ms ease-out;
    transition-delay: 35ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .proposal-mode-right {
      transition: none;
      will-change: auto;
    }
  }
  :global(.analytics-card) {
    display: flex;
    flex-direction: column;
    width: min(31rem, calc(100vw - 2rem));
    height: min(47rem, calc(100dvh - 2rem));
    margin: 1rem;
    overflow: hidden;
    border: 1px solid rgb(16 24 32 / 14%);
    border-radius: 0.55rem;
    background: #fff;
    color: #09090b;
    color-scheme: light;
    box-shadow: 0 0.7rem 2.2rem rgb(16 24 32 / 16%);
    pointer-events: auto;
  }
  .analytics-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 0 1rem 1rem;
    scrollbar-color: #a1a1aa transparent;
  }
  .why-score {
    padding: 0.75rem 0.8rem 0.7rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.55rem;
    background: #fafafa;
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
  }
  .why-heading,
  .driver-heading,
  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }
  .why-heading {
    align-items: flex-start;
    min-height: 0;
  }
  .why-heading h2 {
    max-width: 22rem;
    margin: 0.16rem 0 0;
    color: #09090b;
    font-size: clamp(1.7rem, 3vw, 2.15rem);
    font-weight: 950;
    letter-spacing: -0.045em;
    line-height: 0.98;
  }
  :global(.close-button) {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2.45rem;
    height: 2.45rem;
    margin-bottom: 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.8rem;
    background: #fff;
    color: #27272a;
    box-shadow: none;
  }
  :global(.close-button:hover),
  :global(.close-button:focus-visible) {
    border-color: #a1a1aa;
    background: #f4f4f5;
    color: #09090b;
    outline: none;
    box-shadow: 0 0 0 3px rgb(16 24 32 / 12%);
  }
  .driver-heading {
    align-items: center;
  }
  .driver-heading h3,
  .panel-heading h3 {
    margin: 0;
    color: #09090b;
    font-size: 0.78rem;
    letter-spacing: -0.01em;
  }
  .driver-heading p,
  .panel-heading p {
    margin: 0.18rem 0 0;
    color: #71717a;
    font-size: 0.57rem;
    line-height: 1.35;
  }
  :global(.status-badge),
  :global(.driver-badge),
  :global(.priority-badge) {
    border-color: #09090b;
    background: var(--mobility-accent, #09090b);
    color: #fff;
    font-size: 0.56rem;
  }
  :global(.driver-badge.unavailable) {
    border-color: #d4d4d8;
    background: #f4f4f5;
    color: #52525b;
  }
  :global(.priority-badge) {
    background: #fff;
    color: #09090b;
  }
  .driver-list {
    display: grid;
    gap: 0.72rem;
    margin-top: 0.75rem;
  }
  .driver-row {
    display: grid;
    gap: 0.3rem;
  }
  .driver-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .driver-label {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    color: #09090b;
    font-size: 0.66rem;
    font-weight: 780;
  }
  :global(.driver-progress) {
    height: 0.38rem;
    background: #e4e4e7;
  }
  :global(.driver-progress [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  :global(.driver-progress.unavailable [data-slot='progress-indicator']) {
    background: #a1a1aa;
  }
  .driver-note {
    color: #71717a;
    font-size: 0.56rem;
    line-height: 1.25;
  }
  .section-divider {
    height: 1px;
    margin: 0;
    background: rgb(16 24 32 / 12%);
  }
  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.55rem;
    padding: 0.8rem 0;
  }
  :global(.insight-card) {
    min-width: 0;
    padding: 0.72rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.42rem;
    background: #fff;
    color: #09090b;
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
  }
  :global(.score-drivers-card) {
    margin-top: 0.75rem;
  }
  :global(.panel-heading svg) {
    flex: 0 0 auto;
    color: #09090b;
  }
  .people-total {
    display: block;
    margin: 0.72rem 0 0.7rem;
    color: #09090b;
    font-size: 1.25rem;
    letter-spacing: -0.04em;
  }
  .age-bars {
    display: grid;
    gap: 0.52rem;
  }
  .age-row {
    display: grid;
    gap: 0.2rem;
  }
  .age-row > div:first-child {
    display: flex;
    justify-content: space-between;
    color: #71717a;
    font-size: 0.57rem;
  }
  .age-row strong {
    color: #09090b;
  }
  .age-track {
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: #d4d4d8;
  }
  .age-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--mobility-accent, #09090b);
  }
  .demand-summary {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.72rem;
    padding-top: 0.62rem;
    border-top: 1px solid #e4e4e7;
    color: #71717a;
    font-size: 0.57rem;
  }
  .demand-summary span {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .demand-summary strong {
    color: #09090b;
    font-variant-numeric: tabular-nums;
  }
  .mini-list,
  .ranking-list {
    display: grid;
    gap: 0.28rem;
    margin-top: 0.7rem;
  }
  :global(.mini-row),
  :global(.ranking-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    min-height: 0;
    padding: 0.45rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.32rem;
    background: transparent;
    color: #09090b;
    text-align: left;
  }
  :global(.mini-row:hover),
  :global(.mini-row:focus-visible),
  :global(.ranking-row:hover),
  :global(.ranking-row:focus-visible) {
    border-color: #09090b;
    background: #fff;
    color: #09090b;
    outline: none;
  }
  :global(.mini-row span),
  :global(.ranking-row span) {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }
  :global(.mini-row strong),
  :global(.ranking-row strong) {
    overflow: hidden;
    color: #09090b;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.mini-row small),
  :global(.ranking-row small) {
    color: #71717a;
    font-size: 0.54rem;
  }
  :global(.mini-row b),
  :global(.ranking-row b) {
    flex: 0 0 auto;
    color: #09090b;
    font-size: 0.64rem;
  }
  :global(.ranking-card) {
    margin-bottom: 0.55rem;
  }
  .category-tabs {
    display: flex;
    gap: 0.22rem;
    margin-top: 0.68rem;
    overflow-x: auto;
  }
  :global(.category-tab) {
    height: 1.7rem;
    padding: 0 0.48rem;
    border-color: #d4d4d8;
    background: #fff;
    color: #71717a;
    font-size: 0.56rem;
  }
  :global(.category-tab.category-active),
  :global(.category-tab:hover),
  :global(.category-tab:focus-visible) {
    border-color: #09090b;
    background: var(--mobility-accent, #09090b);
    color: #fff;
    outline: none;
  }
  .analytics-state {
    padding: 1.2rem 0 0;
    color: #71717a;
    font-size: 0.72rem;
  }
  .analytics-error {
    color: #09090b;
  }
  :global(.analytics-card [data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  .loading-copy {
    display: grid;
    min-width: 0;
    gap: 0.22rem;
  }
  :global(.loading-panel-heading) {
    width: 6.2rem;
    height: 0.68rem;
    border-radius: 999px;
  }
  :global(.loading-wide-heading) {
    width: 8.2rem;
  }
  :global(.loading-panel-caption) {
    width: 8.8rem;
    height: 0.48rem;
    border-radius: 999px;
  }
  :global(.loading-panel-icon) {
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 0.3rem;
  }
  :global(.loading-people-total) {
    width: 7rem;
    height: 1.45rem;
    margin: 0.72rem 0 0.7rem;
    border-radius: 0.3rem;
  }
  .loading-age-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }
  :global(.loading-age-label) {
    width: 3.9rem;
    height: 0.48rem;
    border-radius: 999px;
  }
  :global(.loading-age-value) {
    width: 2.4rem;
    height: 0.48rem;
    border-radius: 999px;
  }
  :global(.loading-age-track) {
    width: 100%;
    height: 0.28rem;
    border-radius: 999px;
  }
  .loading-mini-row,
  .loading-ranking-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.5rem;
  }
  .loading-row-copy {
    display: grid;
    min-width: 0;
    gap: 0.18rem;
  }
  :global(.loading-row-title) {
    width: 7.2rem;
    height: 0.55rem;
    border-radius: 999px;
  }
  :global(.loading-row-caption) {
    width: 4.2rem;
    height: 0.45rem;
    border-radius: 999px;
  }
  :global(.loading-row-arrow) {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 999px;
  }
  :global(.loading-priority) {
    width: 3.4rem;
    height: 1rem;
    border-radius: 999px;
  }
  :global(.loading-ranking-title) {
    width: 8.6rem;
    height: 0.56rem;
    border-radius: 999px;
  }
  :global(.loading-single-ranking-title) {
    width: 7.6rem;
  }
  :global(.loading-ranking-caption) {
    width: 7rem;
    height: 0.45rem;
    border-radius: 999px;
  }
  :global(.loading-ranking-score) {
    width: 2.7rem;
    height: 0.7rem;
    border-radius: 999px;
  }
  .loading-category-tabs {
    display: flex;
    gap: 0.22rem;
    margin-top: 0.68rem;
    overflow: hidden;
  }
  :global(.loading-category-tab) {
    width: 3.1rem;
    height: 1.7rem;
    border-radius: 0.35rem;
  }
  :global(.loading-title) {
    width: 8rem;
    height: 1.35rem;
  }
  .loading-title-wrap {
    height: 1.35rem;
  }
  :global(.loading-label) {
    width: 6rem;
    height: 0.65rem;
  }
  :global(.loading-badge) {
    width: 3rem;
    height: 1rem;
    border-radius: 999px;
  }
  :global(.loading-progress) {
    height: 0.38rem;
  }
  :global(.loading-note) {
    width: 12rem;
    height: 0.5rem;
  }
  @media (max-width: 640px) {
    :global(.analytics-card-layer) {
      align-items: flex-end;
    }
    :global(.analytics-card) {
      width: calc(100vw - 1rem);
      height: min(42rem, calc(100dvh - 1rem));
      margin: 0.5rem;
      border-radius: 0.55rem;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }

  :global(.analytics-card) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
    box-shadow: 0 0.7rem 2.2rem rgb(16 24 32 / 12%);
  }

  :global(.analytics-card .why-score),
  :global(.analytics-card .insight-card) {
    border-color: var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 4%);
  }

  :global(.analytics-card .why-score) {
    background: var(--mobility-surface-soft, #fafafa);
  }

  :global(.analytics-card h2),
  :global(.analytics-card h3),
  :global(.analytics-card .driver-label),
  :global(.analytics-card .people-total),
  :global(.analytics-card .age-row strong),
  :global(.analytics-card .demand-summary strong),
  :global(.analytics-card .mini-row strong),
  :global(.analytics-card .ranking-row strong),
  :global(.analytics-card .mini-row b),
  :global(.analytics-card .ranking-row b) {
    color: var(--mobility-text, #09090b);
  }

  :global(.analytics-card .driver-heading p),
  :global(.analytics-card .panel-heading p),
  :global(.analytics-card .driver-note),
  :global(.analytics-card .age-row > div:first-child),
  :global(.analytics-card .demand-summary),
  :global(.analytics-card .mini-row small),
  :global(.analytics-card .ranking-row small),
  :global(.analytics-card .analytics-state) {
    color: var(--mobility-muted, #71717a);
  }

  :global(.analytics-card .status-badge),
  :global(.analytics-card .driver-badge) {
    border-color: #d4d4d8;
    background: var(--mobility-accent-soft, #f4f4f5);
    color: #3f3f46;
  }

  :global(.analytics-card .priority-badge) {
    border-color: #e1c99d;
    background: #fff8ea;
    color: #8d622c;
  }

  :global(.analytics-card .close-button) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
  }

  :global(.analytics-card .close-button:hover),
  :global(.analytics-card .close-button:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  :global(.analytics-card .driver-progress),
  :global(.analytics-card .age-track) {
    background: var(--mobility-surface-muted, #f4f4f5);
  }

  :global(.analytics-card .driver-progress [data-slot='progress-indicator']),
  :global(.analytics-card .age-track span) {
    background: var(--mobility-accent, #09090b);
  }

  :global(.analytics-card .section-divider),
  :global(.analytics-card .demand-summary) {
    border-color: var(--mobility-border, #e4e4e7);
  }

  :global(.analytics-card .mini-row:hover),
  :global(.analytics-card .mini-row:focus-visible),
  :global(.analytics-card .ranking-row:hover),
  :global(.analytics-card .ranking-row:focus-visible) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface-soft, #fafafa);
  }

  :global(.analytics-card .category-tab) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-muted, #71717a);
  }

  :global(.analytics-card .category-tab.category-active),
  :global(.analytics-card .category-tab:hover),
  :global(.analytics-card .category-tab:focus-visible) {
    border-color: var(--mobility-accent, #09090b);
    background: var(--mobility-accent, #09090b);
    color: #ffffff;
  }
</style>
