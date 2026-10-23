<script lang="ts">
  import type { SustainabilityFactorKey, SustainabilityScore } from './sustainability-types';

  import Briefcase from '@lucide/svelte/icons/briefcase';
  import Car from '@lucide/svelte/icons/car';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { Skeleton } from '$components/ui/skeleton';

  import AccessLandscapeChart from './access-landscape-chart.svelte';
  import { SUSTAINABILITY_FACTORS, vehicleCategoryLabel } from './sustainability-types';

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
    allAge: DemandMetric | null;
    younger: DemandMetric | null;
    children: DemandMetric | null;
    emergency: DemandMetric | null;
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

  type AnalyticsRank = {
    id: string;
    value: number;
  };

  type RankingEntry = string | AnalyticsRank;
  type RankingKey =
    | 'demand'
    | 'outbound'
    | 'underserved'
    | 'overall'
    | 'health'
    | 'education'
    | 'transport'
    | 'employment'
    | 'jobRichLowPopulation'
    | 'jobDemandGaps'
    | 'highestPollution';

  type RankedIsland = {
    island: AnalyticsIsland;
    value: number;
  };

  type EmploymentScore = ComponentScore & {
    foreignPopulation: number;
    foreignPopulationSource: 'observed' | 'assumed_zero';
    workingAgePopulation: number | null;
    jobLocationCount: number;
    foreignPerWorkingAge: number | null;
    foreignPerJobLocation: number | null;
    jobLocationsPerThousandWorkingAge: number | null;
    pressureScore: number | null;
    supplyScore: number | null;
    categories: EmploymentCategory[];
  };

  type EmploymentCategory = {
    key: string;
    label: string;
    count: number;
    subcategories: Array<{ key: string; label: string; count: number }>;
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
    educationTransferDemand: number;
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
    educationTransferDemand: number;
    totalDemand: number;
    averageLoad: number | null;
    score: number | null;
    modes: Record<
      string,
      {
        stopCount: number;
        totalDemand: number;
        careTransferDemand: number;
        educationTransferDemand: number;
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
    employment: EmploymentScore;
    sustainability: SustainabilityScore;
    pollutionPressure: number | null;
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
      employment: EmploymentScore;
      sustainability: SustainabilityScore;
      pollutionPressure: number | null;
    };
    population: { total: number; children: number; adolescents: number; youth: number; elderly: number };
    islands: AnalyticsIsland[];
    rankings: Record<RankingKey, RankingEntry[]>;
    rankingValues?: Partial<Record<RankingKey, Record<string, number>>>;
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
  let selectedCategory = $state<'overall' | 'health' | 'education' | 'transport' | 'employment'>('overall');

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
    { key: 'transport', label: 'Transport' },
    { key: 'employment', label: 'Employment' }
  ] as const;
  const threeRowSkeletons = [0, 1, 2] as const;
  const fourRowSkeletons = [0, 1, 2, 3] as const;
  const demandSummarySkeletons = Array.from({ length: 11 }, (_, index) => index);
  const employmentMetricSkeletons = Array.from({ length: 7 }, (_, index) => index);
  const employmentCategorySkeletons = Array.from({ length: 3 }, (_, index) => index);
  const pollutionFactorSkeletons = Array.from({ length: 5 }, (_, index) => index);
  const vehicleCategorySkeletons = Array.from({ length: 8 }, (_, index) => index);

  function percentile(value: number, values: number[]): number {
    if (values.length <= 1) return 50;
    const less = values.filter((candidate) => candidate < value).length;
    const equal = values.filter((candidate) => candidate === value).length;
    return ((less + Math.max(0, equal - 1) / 2) / (values.length - 1)) * 100;
  }

  function fallbackRankingValue(key: RankingKey, island: AnalyticsIsland): number | null {
    if (key === 'demand') return island.demand.inboundTotal;
    if (key === 'outbound') return island.demand.outboundTotal;
    if (key === 'overall' || key === 'health' || key === 'education' || key === 'transport' || key === 'employment') {
      return island[key].score;
    }
    if (key === 'jobRichLowPopulation') return island.employment.jobLocationsPerThousandWorkingAge;
    if (key === 'highestPollution') return island.pollutionPressure;
    if (key === 'underserved' && island.overall.score !== null) {
      const pressures = [island.demand.healthPressure, island.demand.educationPressure].filter(
        (value): value is number => value !== null && Number.isFinite(value)
      );
      return (100 - island.overall.score) * (1 + (pressures.length > 0 ? Math.max(...pressures) : 0));
    }
    if (
      key === 'jobDemandGaps' &&
      island.employment.foreignPerWorkingAge !== null &&
      island.employment.jobLocationsPerThousandWorkingAge !== null
    ) {
      const eligible = data?.islands.filter(
        (candidate) =>
          candidate.employment.foreignPerWorkingAge !== null &&
          candidate.employment.jobLocationsPerThousandWorkingAge !== null
      );
      if (!eligible) return null;
      const demandValues = eligible.map((candidate) => candidate.employment.foreignPerWorkingAge as number);
      const supplyValues = eligible.map(
        (candidate) => candidate.employment.jobLocationsPerThousandWorkingAge as number
      );
      return (
        (percentile(island.employment.foreignPerWorkingAge, demandValues) +
          (100 - percentile(island.employment.jobLocationsPerThousandWorkingAge, supplyValues))) /
        2
      );
    }
    return null;
  }

  function rankedIslands(key: RankingKey): RankedIsland[] {
    return (data?.rankings[key] ?? []).flatMap((entry) => {
      const id = typeof entry === 'string' ? entry : entry.id;
      const island = data?.islands.find((candidate) => candidate.id === id);
      if (!island) return [];
      const value =
        (typeof entry === 'string' ? data?.rankingValues?.[key]?.[id] : entry.value) ??
        fallbackRankingValue(key, island);
      return value === null || !Number.isFinite(value) ? [] : [{ island, value }];
    });
  }

  let categoryIslands = $derived(rankedIslands(selectedCategory));
  let demandIslands = $derived(rankedIslands('demand'));
  let inboundSources = $derived(
    (data?.national.demand.inboundSources ?? [])
      .filter((source) => sourceIsland(source) !== null)
      .sort(
        (left, right) =>
          right.total - left.total ||
          `${left.originAtollName} ${left.originName}`.localeCompare(`${right.originAtollName} ${right.originName}`) ||
          left.originIslandId.localeCompare(right.originIslandId)
      )
      .slice(0, 3)
  );
  let underservedIslands = $derived(rankedIslands('underserved'));
  let jobRichIslands = $derived(rankedIslands('jobRichLowPopulation').slice(0, 3));
  let jobDemandGapIslands = $derived(rankedIslands('jobDemandGaps').slice(0, 3));
  let highestPollutionIslands = $derived(rankedIslands('highestPollution'));

  function percentage(value: number | null): string {
    return value === null ? 'N/A' : `${Math.round(value)}%`;
  }

  function number(value: number | null): string {
    return value === null ? 'N/A' : Math.round(value).toLocaleString();
  }

  function decimal(value: number | null): string {
    return value === null ? 'N/A' : value.toFixed(2);
  }

  function titleCase(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll(':', ' / ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function factorContribution(score: SustainabilityScore, key: SustainabilityFactorKey): number | null {
    return score.pollutionFactors[key].contributionPercent;
  }

  function signedPercentage(value: number | null): string {
    return value === null ? 'N/A' : `${value > 0 ? '+' : ''}${Math.round(value)}%`;
  }

  function factorProgress(score: SustainabilityScore, key: SustainabilityFactorKey): number {
    const contribution = factorContribution(score, key);
    return contribution === null ? 0 : Math.min(100, Math.abs(contribution));
  }

  function publicTransportBenefitPercent(score: SustainabilityScore): number | null {
    if (
      score.publicTransportBenefit === null ||
      score.privateVehiclePollution === null ||
      score.privateVehiclePollution <= 0
    ) {
      return null;
    }
    return -(score.publicTransportBenefit / score.privateVehiclePollution) * 100;
  }

  function publicTransportBenefitProgress(score: SustainabilityScore): number {
    const benefitPercent = publicTransportBenefitPercent(score);
    return benefitPercent === null ? 0 : Math.min(100, Math.abs(benefitPercent));
  }

  function pollutionPressure(value: number | null): string {
    return value === null ? 'N/A' : value.toFixed(2);
  }

  function categoryShare(count: number, total: number): number {
    return total > 0 ? Math.min(100, (count / total) * 100) : 0;
  }

  function outboundShare(island: AnalyticsIsland): number | null {
    if (island.population === null || island.population <= 0) return null;
    return Math.min(100, (island.demand.outboundTotal / island.population) * 100);
  }

  function islandLabel(island: AnalyticsIsland): string {
    return `${island.atollName} ${island.name}`;
  }

  function sourceIsland(source: DemandSource): AnalyticsIsland | null {
    return data?.islands.find((island) => island.id === source.originIslandId) ?? null;
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
    <Card.Root class="analytics-card" role="dialog" aria-label="National accessibility analytics">
      <div class="analytics-scroll">
        <div class="analytics-heading">
          <div>
            {#if loading}
              <div class="loading-title-wrap" aria-label="Loading national score">
                <Skeleton class="loading-title" />
              </div>
            {:else}
              <h2>
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

        <AccessLandscapeChart islands={data?.islands ?? []} {loading} {onIslandSelect} />

        {#if loading}
          <div class="detail-grid" aria-hidden="true">
            <Card.Root class="insight-card loading-insight-card" size="sm">
              <div class="card-heading"><Skeleton class="loading-panel-heading" /></div>
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
              <div class="loading-summary-list">
                {#each demandSummarySkeletons as row (row)}
                  <div><Skeleton class="loading-summary-label" /><Skeleton class="loading-summary-value" /></div>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="insight-card loading-insight-card" size="sm">
              <div class="card-heading"><Skeleton class="loading-panel-heading loading-wide-heading" /></div>
              <div class="mini-list">
                {#each threeRowSkeletons as row (row)}
                  <div class="loading-mini-row">
                    <span class="loading-row-copy"
                      ><Skeleton class="loading-row-title" /><Skeleton class="loading-row-caption" /></span
                    >
                  </div>
                {/each}
              </div>
            </Card.Root>
          </div>

          <Card.Root class="insight-card employment-card loading-insight-card" size="sm" aria-hidden="true">
            <div class="card-heading">
              <Skeleton class="loading-panel-heading loading-wide-heading" />
              <Skeleton class="loading-heading-score" />
            </div>
            <div class="loading-summary-list loading-employment-metrics">
              {#each employmentMetricSkeletons as row (row)}
                <div><Skeleton class="loading-summary-label" /><Skeleton class="loading-summary-value" /></div>
              {/each}
            </div>
            <div class="loading-employment-breakdown">
              {#each employmentCategorySkeletons as category (category)}
                <div class="loading-employment-category">
                  <div><Skeleton class="loading-category-label" /><Skeleton class="loading-summary-value" /></div>
                  <Skeleton class="loading-category-progress" />
                  <div class="loading-subcategories">
                    <Skeleton class="loading-subcategory" /><Skeleton
                      class="loading-subcategory loading-subcategory-short"
                    />
                  </div>
                </div>
              {/each}
            </div>
          </Card.Root>

          <div class="sustainability-grid" aria-hidden="true">
            <Card.Root class="insight-card sustainability-card loading-insight-card" size="sm">
              <div class="card-heading">
                <Skeleton class="loading-panel-heading loading-wide-heading" /><Skeleton
                  class="loading-heading-score"
                />
              </div>
              <div class="loading-sustainability-factors">
                {#each pollutionFactorSkeletons as row (row)}
                  <div class="loading-factor-row">
                    <div><Skeleton class="loading-factor-label" /><Skeleton class="loading-summary-value" /></div>
                    <Skeleton class="loading-category-progress" />
                  </div>
                {/each}
              </div>
            </Card.Root>
            <Card.Root class="insight-card sustainability-card loading-insight-card" size="sm">
              <div class="card-heading">
                <Skeleton class="loading-panel-heading" /><Skeleton class="loading-heading-score" />
              </div>
              <div class="loading-sustainability-factors">
                {#each vehicleCategorySkeletons as row (row)}
                  <div class="loading-factor-row">
                    <div><Skeleton class="loading-factor-label" /><Skeleton class="loading-summary-value" /></div>
                    <Skeleton class="loading-category-progress" />
                  </div>
                {/each}
              </div>
            </Card.Root>
          </div>

          {#each [fourRowSkeletons, threeRowSkeletons, threeRowSkeletons, threeRowSkeletons, fourRowSkeletons] as rows, card (card)}
            <Card.Root class="insight-card ranking-card loading-insight-card" size="sm" aria-hidden="true">
              <div class="card-heading"><Skeleton class="loading-panel-heading loading-wide-heading" /></div>
              {#if card === 1 || card === 2}<Skeleton class="loading-ranking-description" />{/if}
              <div class="ranking-list">
                {#each rows as row (row)}
                  <div class="loading-ranking-row">
                    <span class="loading-row-copy"
                      ><Skeleton class="loading-ranking-title" /><Skeleton class="loading-ranking-caption" /></span
                    ><Skeleton class="loading-ranking-score" />
                  </div>
                {/each}
              </div>
            </Card.Root>
          {/each}

          <Card.Root class="insight-card ranking-card loading-insight-card" size="sm" aria-hidden="true">
            <div class="card-heading"><Skeleton class="loading-panel-heading loading-wide-heading" /></div>
            <div class="loading-category-tabs">
              {#each categoryTabs as category (category.key)}<Skeleton class="loading-category-tab" />{/each}
            </div>
            <div class="ranking-list">
              {#each fourRowSkeletons as row (row)}
                <div class="loading-ranking-row">
                  <Skeleton class="loading-ranking-title loading-single-ranking-title" /><Skeleton
                    class="loading-ranking-score"
                  />
                </div>
              {/each}
            </div>
          </Card.Root>
        {:else if data && !error}
          <div class="detail-grid">
            <Card.Root class="insight-card" size="sm">
              <div class="card-heading">
                <div>
                  <h3>People & needs</h3>
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
                  >Non-elderly health demand <strong
                    >{number(data.national.demand.healthCareDemand.allAge?.combined ?? 0)}</strong
                  ></span
                >
                <span
                  >Children/adolescent demand <strong
                    >{number(data.national.demand.healthCareDemand.younger?.combined ?? 0)}</strong
                  ></span
                >
                <span
                  >Hospital emergency demand <strong
                    >{number(data.national.demand.healthCareDemand.emergency?.combined ?? 0)}</strong
                  ></span
                >
                <span
                  >Elderly hospital outbound <strong
                    >{number(data.national.demand.healthCareDemand.elderly?.outbound ?? 0)}</strong
                  ></span
                >
                <span>Care transfers <strong>{number(data.national.transportDemand.careTransferDemand)}</strong></span>
                <span
                  >Education transfers <strong>{number(data.national.transportDemand.educationTransferDemand)}</strong
                  ></span
                >
                <span
                  >Average transport load <strong>{percentage(data.national.transportDemand.averageLoad)}</strong></span
                >
                <span>Transport demand score <strong>{percentage(data.national.transportDemand.score)}</strong></span>
              </div>
            </Card.Root>

            <Card.Root class="insight-card" size="sm">
              <div class="card-heading">
                <div>
                  <h3>External demand hotspots</h3>
                </div>
                <Ship size={17} strokeWidth={2.2} />
              </div>
              <div class="mini-list">
                {#each demandIslands as ranked (ranked.island.id)}
                  <Button class="mini-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}
                    ><span
                      ><strong>{islandLabel(ranked.island)}</strong><small
                        >{number(ranked.value)} inbound age-cohort demand</small
                      ></span
                    ></Button
                  >
                {/each}
              </div>
            </Card.Root>
          </div>

          <Card.Root class="insight-card employment-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Employment balance</h3>
              </div>
              <strong class="card-heading-score">{percentage(data.national.employment.score)}</strong>
            </div>
            <div class="employment-metrics">
              <span>Foreign residents <strong>{number(data.national.employment.foreignPopulation)}</strong></span>
              <span>Working age 15-64 <strong>{number(data.national.employment.workingAgePopulation)}</strong></span>
              <span
                >Foreign / working age <strong
                  >{percentage(
                    data.national.employment.foreignPerWorkingAge === null
                      ? null
                      : data.national.employment.foreignPerWorkingAge * 100
                  )}</strong
                ></span
              >
              <span>Foreign / workplace <strong>{decimal(data.national.employment.foreignPerJobLocation)}</strong></span
              >
              <span
                >Workplaces / 1,000 working age <strong
                  >{decimal(data.national.employment.jobLocationsPerThousandWorkingAge)}</strong
                ></span
              >
              <span>Pressure balance <strong>{percentage(data.national.employment.pressureScore)}</strong></span>
              <span>Supply balance <strong>{percentage(data.national.employment.supplyScore)}</strong></span>
            </div>
            <div class="employment-breakdown">
              {#each data.national.employment.categories as category (category.key)}
                <div class="employment-category">
                  <div class="employment-category-heading">
                    <span>{titleCase(category.label)}</span>
                    <strong>{category.count.toLocaleString()}</strong>
                  </div>
                  <Progress
                    value={categoryShare(category.count, data.national.employment.jobLocationCount)}
                    max={100}
                    aria-label={`${titleCase(category.label)} workplace share`}
                  />
                  <div class="employment-subcategory-list">
                    {#each category.subcategories.slice(0, 4) as subcategory (subcategory.key)}
                      <span
                        ><b>{titleCase(subcategory.label)}</b><strong>{subcategory.count.toLocaleString()}</strong
                        ></span
                      >
                    {/each}
                    {#if category.subcategories.length > 4}
                      <small>{category.subcategories.length - 4} more subcategories</small>
                    {/if}
                  </div>
                </div>
              {:else}
                <span class="analytics-state">No workplace categories are available.</span>
              {/each}
            </div>
            {#if data.national.employment.foreignPopulationSource === 'assumed_zero'}
              <p class="analytics-state">Missing `foregner` population rows were treated as zero.</p>
            {/if}
          </Card.Root>

          <div class="sustainability-grid">
            <Card.Root class="insight-card sustainability-card" size="sm">
              <div class="card-heading">
                <div>
                  <h3>Pollution pressure</h3>
                </div>
                <strong class="card-heading-score">{percentage(data.national.sustainability.score)}</strong>
              </div>
              <div class="sustainability-factors">
                <div class="sustainability-factor sustainability-benefit-factor">
                  <div class="sustainability-factor-heading">
                    <span>Public transport benefit</span>
                    <strong>{signedPercentage(publicTransportBenefitPercent(data.national.sustainability))}</strong>
                  </div>
                  <Progress
                    value={publicTransportBenefitProgress(data.national.sustainability)}
                    max={100}
                    aria-label="Public transport benefit relative to private vehicle pressure"
                  />
                  <small class="sustainability-factor-note"
                    >{decimal(data.national.sustainability.publicTransportBenefit)} pressure units avoided</small
                  >
                </div>
                {#each SUSTAINABILITY_FACTORS as factor (factor.key)}
                  <div class="sustainability-factor">
                    <div class="sustainability-factor-heading">
                      <span>{factor.label}</span>
                      <strong>{signedPercentage(factorContribution(data.national.sustainability, factor.key))}</strong>
                    </div>
                    <Progress
                      value={factorProgress(data.national.sustainability, factor.key)}
                      max={100}
                      aria-label={`${factor.label} net pressure effect`}
                    />
                  </div>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="insight-card sustainability-card" size="sm">
              <div class="card-heading">
                <div>
                  <h3>Vehicle mix</h3>
                </div>
                <strong class="card-heading-score">{number(data.national.sustainability.vehicleTotal)}</strong>
              </div>
              <div class="vehicle-category-list">
                {#each data.national.sustainability.vehicleCategoryBreakdown.slice(0, 8) as category (category.category)}
                  <div class="vehicle-category-row">
                    <div class="vehicle-category-heading">
                      <span>{vehicleCategoryLabel(category.category)}</span>
                      <strong>{number(category.total)}</strong>
                    </div>
                    <Progress
                      value={category.sharePercent}
                      max={100}
                      aria-label={`${vehicleCategoryLabel(category.category)} vehicle share`}
                    />
                  </div>
                {:else}
                  <p class="analytics-state">No vehicle-category rows are available.</p>
                {/each}
              </div>
            </Card.Root>
          </div>

          <Card.Root class="insight-card ranking-card sustainability-ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Highest pollution pressure</h3>
                <p>Click an island to open its full breakdown.</p>
              </div>
              <Car size={17} strokeWidth={2.2} />
            </div>
            <div class="ranking-list">
              {#each highestPollutionIslands as ranked (ranked.island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}>
                  <span>
                    <strong>{islandLabel(ranked.island)}</strong>
                    <small>{number(ranked.island.sustainability.vehicleTotal)} vehicles</small>
                  </span>
                  <b>{pollutionPressure(ranked.value)}</b>
                </Button>
              {:else}
                <p class="analytics-state">No pollution ranking is available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card employment-ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Highest workplace density</h3>
              </div>
              <Briefcase size={17} strokeWidth={2.2} />
            </div>
            <p class="ranking-description">Recorded workplaces per 1,000 working-age residents.</p>
            <div class="ranking-list">
              {#each jobRichIslands as ranked (ranked.island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}>
                  <span>
                    <strong>{islandLabel(ranked.island)}</strong>
                    <small
                      >{number(ranked.island.employment.jobLocationCount)} workplaces · {number(
                        ranked.island.employment.workingAgePopulation
                      )} working age</small
                    >
                  </span>
                  <b>{decimal(ranked.value)}</b>
                </Button>
              {:else}
                <p class="analytics-state">No workplace-density ranking is available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card employment-ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>High demand, low workplace supply</h3>
              </div>
              <Briefcase size={17} strokeWidth={2.2} />
            </div>
            <p class="ranking-description">Foreign residents are used as an estimated job-demand proxy.</p>
            <div class="ranking-list">
              {#each jobDemandGapIslands as ranked (ranked.island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}>
                  <span>
                    <strong>{islandLabel(ranked.island)}</strong>
                    <small
                      >{percentage(
                        ranked.island.employment.foreignPerWorkingAge === null
                          ? null
                          : ranked.island.employment.foreignPerWorkingAge * 100
                      )} foreign / working age · {decimal(ranked.island.employment.jobLocationsPerThousandWorkingAge)} workplaces
                      / 1,000</small
                    >
                  </span>
                  <b>{percentage(ranked.value)}</b>
                </Button>
              {:else}
                <p class="analytics-state">No job-demand gap ranking is available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>High inbound demand origins</h3>
              </div>
              <Route size={17} strokeWidth={2.2} />
            </div>
            <div class="ranking-list">
              {#each inboundSources as source (source.originIslandId)}
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
                  <b>{number(source.total)}</b>
                </Button>
              {:else}
                <p class="analytics-state">No inbound demand origins are available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Most inaccessible islands</h3>
              </div>
            </div>
            <div class="ranking-list">
              {#each underservedIslands as ranked (ranked.island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}>
                  <span
                    ><strong>{islandLabel(ranked.island)}</strong><small
                      >Overall {percentage(ranked.island.overall.score)} - inbound {number(
                        ranked.island.demand.inboundTotal
                      )} · outbound {percentage(outboundShare(ranked.island))}</small
                    ></span
                  >
                  <b>{decimal(ranked.value)}</b>
                </Button>
              {:else}
                <p class="analytics-state">No accessibility-need ranking is available.</p>
              {/each}
            </div>
          </Card.Root>

          <Card.Root class="insight-card ranking-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Lowest by category</h3>
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
              {#each categoryIslands as ranked (ranked.island.id)}
                <Button class="ranking-row" variant="ghost" type="button" onclick={() => onIslandSelect(ranked.island)}
                  ><strong>{islandLabel(ranked.island)}</strong><b>{percentage(ranked.value)}</b></Button
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
    height: auto;
    max-height: calc(100dvh - 2rem);
    align-self: flex-start;
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
    padding: 1rem;
    scrollbar-color: #a1a1aa transparent;
  }
  .analytics-heading,
  .card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }
  .analytics-heading h2 {
    max-width: 22rem;
    margin: 0;
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
  .card-heading h3 {
    margin: 0;
    color: #09090b;
    font-size: 0.78rem;
    font-weight: 850;
    letter-spacing: -0.01em;
  }
  :global(.card-heading > svg) {
    flex: 0 0 auto;
    color: #09090b;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.55rem;
  }
  :global(.insight-card) {
    min-width: 0;
    margin-top: 0.8rem;
    padding: 0.72rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.42rem;
    background: #fff;
    color: #09090b;
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
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
  .employment-metrics,
  .employment-breakdown {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.72rem;
    color: #71717a;
    font-size: 0.57rem;
  }
  .employment-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .employment-metrics strong {
    color: #09090b;
    font-variant-numeric: tabular-nums;
  }
  .employment-breakdown {
    padding-top: 0.62rem;
    border-top: 1px solid #e4e4e7;
  }
  .employment-category {
    display: grid;
    gap: 0.3rem;
  }
  .employment-category-heading,
  .employment-subcategory-list span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .employment-category-heading {
    color: #09090b;
    font-size: 0.6rem;
    font-weight: 700;
  }
  .employment-category-heading strong,
  .employment-subcategory-list strong {
    font-variant-numeric: tabular-nums;
  }
  :global(.employment-category [data-slot='progress']) {
    height: 0.3rem;
    background: #e4e4e7;
  }
  :global(.employment-category [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  .employment-subcategory-list {
    display: grid;
    gap: 0.2rem;
    padding-left: 0.5rem;
    color: #71717a;
    font-size: 0.54rem;
  }
  .employment-subcategory-list small,
  .ranking-description {
    color: #71717a;
    font-size: 0.54rem;
  }
  .sustainability-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }
  .card-heading-score {
    align-self: center;
    color: var(--mobility-text, #09090b);
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .sustainability-factors,
  .vehicle-category-list {
    display: grid;
    gap: 0.58rem;
    margin-top: 0.72rem;
  }
  .sustainability-factor,
  .vehicle-category-row {
    display: grid;
    gap: 0.25rem;
  }
  .sustainability-factor-heading,
  .vehicle-category-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.58rem;
    font-weight: 750;
  }
  .sustainability-factor-heading strong,
  .vehicle-category-heading strong {
    color: var(--mobility-text, #09090b);
    font-variant-numeric: tabular-nums;
  }
  .sustainability-factor-note {
    color: var(--mobility-muted, #71717a);
    font-size: 0.52rem;
  }
  :global(.sustainability-card [data-slot='progress']) {
    height: 0.32rem;
    background: var(--mobility-surface-muted, #f4f4f5);
  }
  :global(.sustainability-card .sustainability-factor [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  :global(.sustainability-card .vehicle-category-row [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  .loading-sustainability-factors {
    display: grid;
    gap: 0.58rem;
    margin-top: 0.72rem;
  }
  .loading-factor-row,
  .loading-employment-category {
    display: grid;
    gap: 0.25rem;
  }
  .loading-factor-row > div,
  .loading-employment-category > div:first-child,
  .loading-summary-list > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .ranking-description {
    margin: 0.55rem 0 0;
    line-height: 1.35;
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
  :global(.loading-panel-heading) {
    width: 6.2rem;
    height: 0.68rem;
    border-radius: 999px;
  }
  :global(.loading-wide-heading) {
    width: 8.2rem;
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
  .loading-summary-list {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.72rem;
    padding-top: 0.62rem;
    border-top: 1px solid #e4e4e7;
  }
  .loading-employment-metrics {
    padding-top: 0;
    border-top: 0;
  }
  .loading-employment-breakdown {
    display: grid;
    gap: 0.6rem;
    margin-top: 0.72rem;
    padding-top: 0.62rem;
    border-top: 1px solid #e4e4e7;
  }
  .loading-subcategories {
    display: grid;
    gap: 0.2rem;
    padding-left: 0.5rem;
  }
  :global(.loading-heading-score) {
    width: 2.8rem;
    height: 1rem;
    border-radius: 0.25rem;
  }
  :global(.loading-summary-label) {
    width: 8.5rem;
    height: 0.46rem;
    border-radius: 999px;
  }
  :global(.loading-summary-value) {
    width: 2.4rem;
    height: 0.46rem;
    border-radius: 999px;
  }
  :global(.loading-category-label),
  :global(.loading-factor-label) {
    width: 6.5rem;
    height: 0.5rem;
    border-radius: 999px;
  }
  :global(.loading-category-progress) {
    width: 100%;
    height: 0.3rem;
    border-radius: 999px;
  }
  :global(.loading-subcategory) {
    width: 70%;
    height: 0.42rem;
    border-radius: 999px;
  }
  :global(.loading-subcategory-short) {
    width: 55%;
  }
  :global(.loading-ranking-description) {
    width: 13rem;
    height: 0.46rem;
    margin-top: 0.55rem;
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
  @media (max-width: 640px) {
    :global(.analytics-card-layer) {
      align-items: flex-end;
    }
    :global(.analytics-card) {
      width: calc(100vw - 1rem);
      height: auto;
      max-height: calc(100dvh - 1rem);
      align-self: flex-end;
      margin: 0.5rem;
      border-radius: 0.55rem;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
    .sustainability-grid {
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

  :global(.analytics-card .insight-card) {
    border-color: var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 4%);
  }

  :global(.analytics-card h2),
  :global(.analytics-card h3),
  :global(.analytics-card .people-total),
  :global(.analytics-card .age-row strong),
  :global(.analytics-card .demand-summary strong),
  :global(.analytics-card .mini-row strong),
  :global(.analytics-card .ranking-row strong),
  :global(.analytics-card .mini-row b),
  :global(.analytics-card .ranking-row b) {
    color: var(--mobility-text, #09090b);
  }

  :global(.analytics-card .age-row > div:first-child),
  :global(.analytics-card .demand-summary),
  :global(.analytics-card .mini-row small),
  :global(.analytics-card .ranking-row small),
  :global(.analytics-card .analytics-state) {
    color: var(--mobility-muted, #71717a);
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

  :global(.analytics-card .age-track) {
    background: var(--mobility-surface-muted, #f4f4f5);
  }

  :global(.analytics-card .age-track span) {
    background: var(--mobility-accent, #09090b);
  }

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
