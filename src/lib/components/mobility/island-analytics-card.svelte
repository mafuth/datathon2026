<script lang="ts">
  import type { IslandProfile, IslandTransportDemandStop } from './island-profile';
  import type { AnalyticsIsland } from './national-analytics-card.svelte';
  import type { SustainabilityFactorKey, SustainabilityScore } from './sustainability-types';
  import type { ConnectionNetworkResponse } from '$lib/mobility/connection-network-contracts';

  import Bus from '@lucide/svelte/icons/bus';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Minimize2 from '@lucide/svelte/icons/minimize-2';
  import Plane from '@lucide/svelte/icons/plane';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { Skeleton } from '$components/ui/skeleton';
  import * as Tabs from '$components/ui/tabs';

  import ConnectionNetwork from './connection-network.svelte';
  import IslandAllocationLanes from './island-allocation-lanes.svelte';
  import { islandScoreHighlights, islandScoreMetrics } from './island-chart-data';
  import IslandContextGauge from './island-context-gauge.svelte';
  import IslandDemandFlow from './island-demand-flow.svelte';
  import IslandPopulationComposition from './island-population-composition.svelte';
  import IslandScoreComparison from './island-score-comparison.svelte';
  import { SUSTAINABILITY_FACTORS, vehicleCategoryLabel } from './sustainability-types';

  type Props = {
    open?: boolean;
    island: AnalyticsIsland | null;
    profile: IslandProfile | null;
    loading?: boolean;
    error?: string | null;
    network?: ConnectionNetworkResponse | null;
    networkLoading?: boolean;
    networkError?: string | null;
    onClose?: () => void;
    onIslandSelect?: (islandId: string) => void;
    onSimulate?: (destinationIslandId: string) => void;
    proposalMode?: boolean;
  };
  let {
    open = $bindable(false),
    island,
    profile,
    loading = false,
    error = null,
    network = null,
    networkLoading = false,
    networkError = null,
    onClose = () => (open = false),
    onIslandSelect = () => {},
    onSimulate,
    proposalMode = false
  }: Props = $props();
  let connectionNetworkFullscreen = $state(false);
  let connectionsExpanded = $state(false);

  async function simulateJourney(destinationIslandId: string): Promise<void> {
    connectionNetworkFullscreen = false;
    await tick();
    onSimulate?.(destinationIslandId);
  }

  function closeAnalytics(): void {
    connectionNetworkFullscreen = false;
    onClose();
  }
  let inboundDemandExpanded = $state(false);
  let scoreMetrics = $derived(islandScoreMetrics(island));
  let scoreHighlights = $derived(islandScoreHighlights(scoreMetrics));
  let currentProfile = $derived(profile?.island.id === island?.id ? profile : null);
  let inboundSources = $derived(currentProfile?.demand.inboundSources ?? island?.demand.inboundSources ?? []);
  let allocationRows = $derived.by(() => {
    if (!currentProfile) return [];

    const hospitalDemand = currentProfile.demand.health.hospitalDemand;
    const hasHospital = currentProfile.services
      .find((group) => group.key === 'health')
      ?.items.some((item) => item.key === 'hospital' && item.count > 0);
    const healthMetric =
      hospitalDemand && !hasHospital && currentProfile.demand.health.elderlyPopulation !== null
        ? {
            ...hospitalDemand,
            outbound: Math.max(0, hospitalDemand.outbound - currentProfile.demand.health.elderlyPopulation),
            unserved: currentProfile.demand.health.elderlyPopulation
          }
        : (hospitalDemand ?? currentProfile.demand.health.demand);

    return [
      {
        key: 'health',
        label: hospitalDemand ? 'Hospital' : 'Health',
        metric: healthMetric,
        inboundDemand: currentProfile.demand.health.demand.inbound
      },
      {
        key: 'education',
        label: 'Education',
        metric: currentProfile.demand.education.demand,
        inboundDemand: currentProfile.demand.education.demand.inbound
      }
    ];
  });
  let accessModes = $derived(
    currentProfile
      ? [
          { key: 'bus', label: 'Land', score: currentProfile.transportAccess.land.score },
          { key: 'ferry', label: 'Marine', score: currentProfile.transportAccess.marine.score },
          { key: 'air', label: 'Air', score: currentProfile.transportAccess.air.score }
        ]
      : []
  );
  const transportModes = ['land', 'marine', 'air'] as const;
  let transportStopGroups = $derived(
    currentProfile
      ? transportModes
          .map((mode) => ({ mode, stops: currentProfile.demand.transport.stops.filter((stop) => stop.mode === mode) }))
          .filter(
            (group): group is { mode: (typeof transportModes)[number]; stops: IslandTransportDemandStop[] } =>
              group.stops.length > 0
          )
      : []
  );
  const allocationLaneSkeletons = Array.from({ length: 2 }, (_, index) => index);
  const accessModeSkeletons = Array.from({ length: 3 }, (_, index) => index);
  const networkNodeSkeletons = Array.from({ length: 5 }, (_, index) => index);

  function percentage(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : `${Math.round(value)}%`;
  }
  function accessColor(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '#71717a';
    const normalized = Math.min(100, Math.max(0, value));
    return `hsl(${Math.round((normalized / 100) * 120)} 68% 40%)`;
  }
  function number(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : Math.round(value).toLocaleString();
  }
  function decimal(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : value.toFixed(2);
  }
  function titleCase(value: string): string {
    return value
      .replaceAll('_', ' ')
      .replaceAll(':', ' / ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
  function categoryShare(count: number, total: number): number {
    return total > 0 ? Math.min(100, (count / total) * 100) : 0;
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

  function connectionIcon(type: string) {
    if (type === 'air') return Plane;
    if (type === 'bus') return Bus;
    if (type === 'ferry') return Ship;
    return Route;
  }
</script>

{#if open}
  <div
    class={`island-analytics-layer${proposalMode ? ' proposal-mode-right' : ''}${connectionNetworkFullscreen ? ' connection-network-layer-fullscreen' : ''}`}
    aria-hidden={proposalMode}
    in:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 260 }}
    out:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 200 }}
  >
    <Card.Root
      class="island-analytics-card"
      role="dialog"
      aria-label="Island score analytics"
      data-presentation-target="island-analytics"
    >
      <div class="analytics-scroll">
        <div class="analytics-heading">
          <div>
            {#if loading}
              <div class="island-loading-title-wrap" aria-label="Loading island score">
                <Skeleton class="island-loading-title" />
              </div>
            {:else}
              <h2>
                {#if island?.overall.score === null || island?.overall.score === undefined}
                  Why is this score unavailable?
                {:else}
                  Why {percentage(island.overall.score)}?
                {/if}
              </h2>
            {/if}
          </div>
          <Button
            class="close-button"
            data-presentation-target="island-analytics-close"
            variant="ghost"
            size="icon"
            aria-label="Close island analytics"
            onclick={closeAnalytics}><X size={18} strokeWidth={2.2} /></Button
          >
        </div>

        {#if loading}
          <div class="island-loading-content" role="status" aria-label="Loading island analytics">
            <div class="island-loading-tabs" aria-hidden="true">
              <Skeleton class="island-loading-tab island-loading-tab-active" />
              <Skeleton class="island-loading-tab" />
              <Skeleton class="island-loading-tab" />
            </div>

            <Card.Root class="insight-card access-overview island-loading-card" size="sm">
              <div class="card-heading">
                <Skeleton class="island-loading-panel-heading island-loading-panel-heading-wide" />
              </div>
              <div class="island-loading-allocation-lanes">
                {#each allocationLaneSkeletons as lane (lane)}
                  <div class="island-loading-allocation-lane">
                    <div>
                      <Skeleton class="island-loading-lane-icon" /><Skeleton class="island-loading-lane-label" />
                    </div>
                    <Skeleton class="island-loading-lane-track" />
                    <div>
                      <Skeleton class="island-loading-lane-caption" /><Skeleton class="island-loading-lane-value" />
                    </div>
                  </div>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="insight-card connection-network-card island-loading-card" size="sm">
              <div class="card-heading">
                <Skeleton class="island-loading-panel-heading island-loading-panel-heading-wide" />
                <Skeleton class="island-loading-network-toggle" />
              </div>
              <div class="island-loading-network" aria-hidden="true">
                <Skeleton class="island-loading-network-line island-loading-network-line-one" />
                <Skeleton class="island-loading-network-line island-loading-network-line-two" />
                {#each networkNodeSkeletons as node (node)}
                  <Skeleton class={`island-loading-network-node island-loading-network-node-${node + 1}`} />
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="insight-card transport-access-overview island-loading-card" size="sm">
              <div class="card-heading"><Skeleton class="island-loading-panel-heading" /></div>
              <div class="access-mode-grid">
                {#each accessModeSkeletons as mode (mode)}
                  <div>
                    <div class="access-mode-heading">
                      <Skeleton class="island-loading-access-icon" /><Skeleton class="island-loading-access-label" />
                    </div>
                    <Skeleton class="island-loading-access-score" />
                  </div>
                {/each}
              </div>
            </Card.Root>
          </div>
        {:else if error}
          <p class="analytics-state" role="alert">{error}</p>
        {:else if island}
          {#key island.id}
            <Tabs.Root value="accessibility" class="island-analytics-tabs">
              <Tabs.List class="analytics-tab-list" aria-label="Island analytics sections">
                <Tabs.Trigger value="accessibility">Access</Tabs.Trigger>
                <Tabs.Trigger value="people">People &amp; services</Tabs.Trigger>
                <Tabs.Trigger value="network" data-presentation-target="island-details-tab">Model detail</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="accessibility" class="analytics-tab-panel">
                {#if currentProfile}
                  <Card.Root class="insight-card access-overview" size="sm">
                    <div class="card-heading"><h3>Where connections matter most</h3></div>
                    {#if !currentProfile.demand.health.hospitalDemand}
                      <p class="chart-note health-fallback-note">
                        Health includes all recorded care needs; a hospital-only breakdown is unavailable.
                      </p>
                    {/if}
                    <IslandAllocationLanes rows={allocationRows} />
                  </Card.Root>

                  <Card.Root
                    class={`insight-card connection-network-card${connectionNetworkFullscreen ? ' connection-network-fullscreen' : ''}`}
                    size="sm"
                  >
                    <div class="card-heading">
                      {#if !connectionNetworkFullscreen}
                        <h3>Connection network</h3>
                      {/if}
                      <Button
                        class="connection-network-toggle"
                        data-presentation-target="connection-network-fullscreen"
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label={connectionNetworkFullscreen
                          ? 'Exit full screen connection network'
                          : 'Open connection network full screen'}
                        title={connectionNetworkFullscreen ? 'Exit full screen' : 'Open full screen'}
                        onclick={() => (connectionNetworkFullscreen = !connectionNetworkFullscreen)}
                      >
                        {#if connectionNetworkFullscreen}
                          <Minimize2 size={16} strokeWidth={2.1} />
                        {:else}
                          <Maximize2 size={16} strokeWidth={2.1} />
                        {/if}
                      </Button>
                    </div>
                    <ConnectionNetwork
                      profile={currentProfile}
                      {network}
                      {networkLoading}
                      {networkError}
                      selectedIslandId={currentProfile.island.id}
                      view={connectionNetworkFullscreen ? 'fullscreen' : 'sidebar'}
                      {onIslandSelect}
                      onSimulate={simulateJourney}
                    />
                  </Card.Root>
                  <Card.Root class="insight-card transport-access-overview" size="sm">
                    <div class="card-heading">
                      <h3>Transport Demand</h3>
                    </div>
                    <div class="access-mode-grid">
                      {#each accessModes as mode (mode.key)}
                        {@const Icon = connectionIcon(mode.key)}
                        <div
                          role="img"
                          style:--access-color={accessColor(mode.score)}
                          aria-label={`${mode.label} access index ${percentage(mode.score)}`}
                        >
                          <div class="access-mode-heading">
                            <span class="access-mode-icon" aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>
                            <span class="access-mode-label">{mode.label}</span>
                          </div>
                          <strong>{percentage(mode.score)}</strong>
                        </div>
                      {/each}
                    </div>
                  </Card.Root>
                {:else}
                  <p class="analytics-state" role="status">Island details are unavailable.</p>
                {/if}
              </Tabs.Content>

              <Tabs.Content value="people" class="analytics-tab-panel">
                {#if profile}
                  <Card.Root class="insight-card population-panel" size="sm">
                    <div class="card-heading">
                      <div>
                        <h3>Population</h3>
                      </div>
                      <strong class="people-total">{number(profile.population.total)}</strong>
                    </div>
                    <IslandPopulationComposition bands={profile.population.bands} total={profile.population.total} />
                    <div class="population-list">
                      {#each profile.population.bands as band (band.key)}
                        <div class={['population-row', { 'population-overlap': band.overlapping }]}>
                          <div class="population-topline">
                            <span>{band.label}</span><b>{number(band.amount)}</b>
                          </div>
                          <Progress value={band.share ?? 0} max={100} aria-label={`${band.label} population`} />
                          {#if band.overlapping}<small>Overlapping age range</small>{/if}
                        </div>
                      {:else}
                        <p class="empty-state">No population breakdown is available.</p>
                      {/each}
                    </div>
                  </Card.Root>

                  <Card.Root class="insight-card employment-card" size="sm">
                    <div class="card-heading">
                      <div>
                        <h3>Workplace breakdown</h3>
                      </div>
                      <strong class="employment-heading-total">{number(profile.employment.jobLocationCount)}</strong>
                    </div>
                    <div class="employment-breakdown">
                      {#each profile.employment.categories as category (category.key)}
                        <div class="employment-category">
                          <div class="employment-category-heading">
                            <span>{titleCase(category.label)}</span>
                            <strong>{number(category.count)}</strong>
                          </div>
                          <Progress
                            value={categoryShare(category.count, profile.employment.jobLocationCount)}
                            max={100}
                            aria-label={`${titleCase(category.label)} workplace share`}
                          />
                          <div class="employment-subcategory-list">
                            {#each category.subcategories as subcategory (subcategory.key)}
                              <span
                                ><b>{titleCase(subcategory.label)}</b><strong>{number(subcategory.count)}</strong></span
                              >
                            {/each}
                          </div>
                        </div>
                      {:else}
                        <span class="empty-inline">No workplace categories are available.</span>
                      {/each}
                    </div>
                  </Card.Root>

                  <Card.Root class="insight-card sustainability-card" size="sm">
                    <div class="card-heading">
                      <div>
                        <h3>Pollution pressure</h3>
                      </div>
                      <strong class="card-heading-score">{percentage(profile.sustainability.score)}</strong>
                    </div>
                    <div class="sustainability-metrics">
                      <span>Vehicles <b>{number(profile.sustainability.vehicleTotal)}</b></span>
                    </div>
                    <div class="sustainability-factors">
                      <div class="sustainability-factor sustainability-benefit-factor">
                        <div class="sustainability-factor-heading">
                          <span>Public transport benefit</span>
                          <strong>{signedPercentage(publicTransportBenefitPercent(profile.sustainability))}</strong>
                        </div>
                        <Progress
                          value={publicTransportBenefitProgress(profile.sustainability)}
                          max={100}
                          aria-label="Public transport benefit relative to private vehicle pressure"
                        />
                        <small class="sustainability-factor-note"
                          >{decimal(profile.sustainability.publicTransportBenefit)} pressure units avoided</small
                        >
                      </div>
                      {#each SUSTAINABILITY_FACTORS as factor (factor.key)}
                        <div class="sustainability-factor">
                          <div class="sustainability-factor-heading">
                            <span>{factor.label}</span>
                            <strong>{signedPercentage(factorContribution(profile.sustainability, factor.key))}</strong>
                          </div>
                          <Progress
                            value={factorProgress(profile.sustainability, factor.key)}
                            max={100}
                            aria-label={`${factor.label} net pressure effect`}
                          />
                        </div>
                      {/each}
                    </div>
                    <div class="vehicle-category-list">
                      {#each profile.sustainability.vehicleCategoryBreakdown.slice(0, 6) as category (category.category)}
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
                        <p class="empty-inline">No vehicle-category rows are available.</p>
                      {/each}
                    </div>
                  </Card.Root>

                  <div class="detail-grid">
                    <Card.Root class="insight-card" size="sm">
                      <div class="card-heading">
                        <div>
                          <h3>Services</h3>
                        </div>
                      </div>
                      <div class="service-groups">
                        {#each profile.services as group (group.key)}
                          <div class="service-group">
                            <div class="service-group-title"><span>{group.label}</span><b>{group.total}</b></div>
                            <div class="service-items">
                              {#each group.items as item (item.key)}
                                <span class="service-item" title={item.names.join(', ') || item.label}
                                  ><b>{item.count}</b> {item.label}</span
                                >
                              {:else}
                                <span class="empty-inline">Not recorded</span>
                              {/each}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </Card.Root>

                    <Card.Root class="insight-card" size="sm">
                      <div class="card-heading">
                        <div>
                          <h3>Transport Demand</h3>
                        </div>
                      </div>
                      <div class="stat-list">
                        <span>Land access <b>{percentage(profile.transportAccess.land.score)}</b></span><span
                          >Marine access <b>{percentage(profile.transportAccess.marine.score)}</b></span
                        ><span>Air access <b>{percentage(profile.transportAccess.air.score)}</b></span>
                      </div>
                    </Card.Root>
                  </div>
                {:else}
                  <p class="analytics-state" role="status">Population and service details are unavailable.</p>
                {/if}
              </Tabs.Content>

              <Tabs.Content value="network" class="analytics-tab-panel">
                {#if profile}
                  <Card.Root class="insight-card score-comparison-panel" size="sm">
                    <div class="card-heading"><div><h3>Category profile</h3></div></div>
                    <IslandScoreComparison metrics={scoreMetrics} overall={island.overall.score} />
                    {#if scoreHighlights.strongest && scoreHighlights.weakest}
                      <div class="score-highlights">
                        <div>
                          <span>Highest category</span><strong>{scoreHighlights.strongest.label}</strong><b
                            >{percentage(scoreHighlights.strongest.value)}</b
                          >
                        </div>
                        <div>
                          <span>Lowest category</span><strong>{scoreHighlights.weakest.label}</strong><b
                            >{percentage(scoreHighlights.weakest.value)}</b
                          >
                        </div>
                      </div>
                    {/if}
                    <p class="chart-note">
                      Five equally weighted categories, using available data. These are index scores, not shares of
                      residents served.
                    </p>
                  </Card.Root>

                  <Card.Root class="insight-card" size="sm">
                    <div class="card-heading"><div><h3>Pressure and balance</h3></div></div>
                    <div class="context-metrics">
                      <IslandContextGauge
                        label="Crowding pressure"
                        value={island.crowdedness.score}
                        note="Higher means more density pressure"
                      />
                      <IslandContextGauge
                        label="Service demand balance"
                        value={island.demand.score}
                        note="Higher means less modeled demand pressure"
                      />
                    </div>
                    <p class="chart-note">Context measures are separate from the five-category index.</p>
                  </Card.Root>

                  <Card.Root class="insight-card connections-panel" size="sm">
                    <div class="card-heading">
                      <div>
                        <h3>Available connections</h3>
                      </div>
                      {#if profile.connections.direct.length > 2}
                        <div class="card-heading-actions">
                          <Badge variant="outline">{profile.connections.direct.length}</Badge>
                          <Button
                            class="view-more-button"
                            variant="ghost"
                            size="xs"
                            type="button"
                            aria-expanded={connectionsExpanded}
                            aria-controls="island-connections-details"
                            onclick={() => (connectionsExpanded = !connectionsExpanded)}
                          >
                            {connectionsExpanded ? 'View less' : 'View more'}
                          </Button>
                        </div>
                      {/if}
                    </div>
                    <div id="island-connections-details">
                      {#if connectionsExpanded || profile.connections.direct.length <= 2}
                        <div class="connection-modes">
                          {#each profile.connections.byType as connection (connection.type)}
                            {@const Icon = connectionIcon(connection.type)}
                            <div class="connection-mode">
                              <span class="connection-mode-icon"><Icon size={15} strokeWidth={2.2} /></span>
                              <strong>{connection.count}</strong>
                              <span>{titleCase(connection.type)}</span>
                            </div>
                          {/each}
                        </div>
                        <div class="connection-list">
                          {#each profile.connections.direct as connection (connection.id)}
                            {@const Icon = connectionIcon(connection.type)}
                            <div class="connection-row">
                              <span class="connection-row-icon"><Icon size={15} strokeWidth={2.2} /></span>
                              <div class="connection-copy">
                                <b>{connection.neighbor?.name ?? 'Unknown island'}</b>
                                <span
                                  >{titleCase(connection.type)}{connection.routeName
                                    ? ` · ${connection.routeName}`
                                    : ''}</span
                                >
                              </div>
                            </div>
                          {:else}
                            <p class="empty-state">No mapped transport connections.</p>
                          {/each}
                        </div>
                      {:else}
                        <div class="connection-list collapsed-connection-list">
                          {#each profile.connections.direct.slice(0, 2) as connection (connection.id)}
                            <div class="connection-row collapsed-connection-row">
                              <div class="connection-copy">
                                <b>{connection.neighbor?.name ?? 'Unknown island'}</b>
                                <span
                                  >{titleCase(connection.type)}{connection.routeName
                                    ? ` · ${connection.routeName}`
                                    : ''}</span
                                >
                              </div>
                            </div>
                          {:else}
                            <p class="empty-state">No mapped transport connections.</p>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </Card.Root>

                  <div class="demand-grid">
                    <Card.Root class="insight-card demand-card" size="sm" data-presentation-target="health-demand-card">
                      <div class="card-heading demand-heading">
                        <div>
                          <h3>Health demand</h3>
                        </div>
                        <strong class="demand-percentage" data-presentation-target="health-demand-percent"
                          >{percentage(profile.demand.health.demand.demandPercent)}</strong
                        >
                      </div>
                      <IslandDemandFlow metric={profile.demand.health.demand} label="Health" />
                      <div class="demand-metrics">
                        <span>Local demand <b>{number(profile.demand.health.demand.local)}</b></span><span
                          >Inbound demand <b>{number(profile.demand.health.demand.inbound)}</b></span
                        ><span>Outbound demand <b>{number(profile.demand.health.demand.outbound)}</b></span><span
                          >Non-elderly baseline <b>{number(profile.demand.health.allAgeDemand?.combined)}</b></span
                        ><span
                          >Hospital demand <b
                            >{percentage(profile.demand.health.hospitalDemand?.demandPercent ?? null)}</b
                          ></span
                        ><span
                          >Children/adolescent demand <b>{number(profile.demand.health.youngerCareDemand?.combined)}</b
                          ></span
                        ><span
                          >Elderly hospital outbound <b>{number(profile.demand.health.elderlyCareDemand?.outbound)}</b
                          ></span
                        ><span>Population basis <b>{number(profile.demand.health.populationBasis)}</b></span>
                      </div>
                      <Progress
                        value={profile.demand.health.demand.demandPercent ?? 0}
                        max={100}
                        aria-label="Health service demand percentage"
                      />
                    </Card.Root>

                    <Card.Root class="insight-card demand-card" size="sm">
                      <div class="card-heading demand-heading">
                        <div>
                          <h3>Education demand</h3>
                        </div>
                        <strong class="demand-percentage"
                          >{percentage(profile.demand.education.demand.demandPercent)}</strong
                        >
                      </div>
                      <IslandDemandFlow metric={profile.demand.education.demand} label="Education" />
                      <div class="demand-metrics">
                        <span>Local demand <b>{number(profile.demand.education.demand.local)}</b></span><span
                          >Inbound demand <b>{number(profile.demand.education.demand.inbound)}</b></span
                        ><span>Outbound demand <b>{number(profile.demand.education.demand.outbound)}</b></span><span
                          >Children <b>{number(profile.demand.education.childPopulation)}</b></span
                        ><span>Adolescents <b>{number(profile.demand.education.adolescentPopulation)}</b></span><span
                          >Youth <b>{number(profile.demand.education.youthPopulation)}</b></span
                        >
                      </div>
                      <Progress
                        value={profile.demand.education.demand.demandPercent ?? 0}
                        max={100}
                        aria-label="Education service demand percentage"
                      />
                    </Card.Root>

                    <Card.Root class="insight-card demand-card employment-balance-card" size="sm">
                      <div class="card-heading">
                        <div>
                          <h3>Employment balance</h3>
                        </div>
                        <strong class="card-heading-score">{percentage(profile.employment.score)}</strong>
                      </div>
                      <div class="demand-metrics">
                        <span>Foreign residents <b>{number(profile.employment.foreignPopulation)}</b></span>
                        <span>Working age 15-64 <b>{number(profile.employment.workingAgePopulation)}</b></span>
                        <span
                          >Foreign / working age <b
                            >{percentage(
                              profile.employment.foreignPerWorkingAge === null
                                ? null
                                : profile.employment.foreignPerWorkingAge * 100
                            )}</b
                          ></span
                        >
                        <span
                          >Workplaces / 1,000 working age <b
                            >{decimal(profile.employment.jobLocationsPerThousandWorkingAge)}</b
                          ></span
                        >
                        <span>Foreign / workplace <b>{decimal(profile.employment.foreignPerJobLocation)}</b></span>
                      </div>
                      <div class="employment-balance-bars">
                        <div>
                          <span>Demand balance <b>{percentage(profile.employment.pressureScore)}</b></span>
                          <Progress
                            value={profile.employment.pressureScore ?? 0}
                            max={100}
                            aria-label="Job demand balance score"
                          />
                        </div>
                        <div>
                          <span>Supply balance <b>{percentage(profile.employment.supplyScore)}</b></span>
                          <Progress
                            value={profile.employment.supplyScore ?? 0}
                            max={100}
                            aria-label="Job supply balance score"
                          />
                        </div>
                      </div>
                      {#if profile.employment.foreignPopulationSource === 'assumed_zero'}
                        <p class="employment-assumption">Missing `foregner` row treated as zero.</p>
                      {/if}
                    </Card.Root>

                    <Card.Root class="insight-card demand-card transport-demand-card" size="sm">
                      <div class="card-heading">
                        <div>
                          <h3>Transport stops</h3>
                        </div>
                      </div>
                      <div id="island-transport-stop-details">
                        <div class="demand-metrics transport-demand-metrics">
                          <span>Resident population <b>{number(profile.demand.transport.residentPopulation)}</b></span
                          ><span
                            >Inbound care + education
                            <b
                              >{number(
                                profile.demand.transport.careTransferDemand +
                                  profile.demand.transport.educationTransferDemand
                              )}</b
                            ></span
                          ><span>Outbound load <b>{number(profile.demand.transport.outboundPopulation)}</b></span><span
                            >Working demand <b>{number(profile.demand.transport.workingDemand)}</b></span
                          ><span>Student demand <b>{number(profile.demand.transport.studentDemand)}</b></span><span
                            >Elderly demand <b>{number(profile.demand.transport.elderlyDemand)}</b></span
                          ><span>Care transfers <b>{number(profile.demand.transport.careTransferDemand)}</b></span><span
                            >Education transfers <b>{number(profile.demand.transport.educationTransferDemand)}</b></span
                          ><span>Average stop load <b>{percentage(profile.demand.transport.averageLoad)}</b></span><span
                            >Transport score <b>{percentage(profile.demand.transport.score)}</b></span
                          ><span
                            >Marine load <b>{percentage(profile.demand.transport.modes.marine.averageLoad)}</b></span
                          ><span>Air load <b>{percentage(profile.demand.transport.modes.air.averageLoad)}</b></span
                          ><span>Stops <b>{profile.demand.transport.stops.length}</b></span>
                        </div>
                        <div class="hub-list">
                          {#each transportStopGroups as group (group.mode)}
                            <div class="transport-stop-group">
                              <div class="transport-stop-group-heading">
                                <strong>{titleCase(group.mode)} stops</strong>
                                <span>{group.stops.length}</span>
                              </div>
                              {#each group.stops as stop (stop.stopId)}
                                {@const Icon = connectionIcon(stop.mode === 'marine' ? 'ferry' : stop.mode)}
                                {@const routedDemand = stop.localDemand + stop.connectedDemand}
                                {@const localShare = routedDemand > 0 ? (stop.localDemand / routedDemand) * 100 : 0}
                                {@const loadPercent = Math.min(100, Math.max(0, stop.loadRatio * 100))}
                                <div class="hub-row">
                                  <div class="hub-row-main">
                                    <div class="hub-row-heading">
                                      <span class="hub-mode-icon" aria-hidden="true"
                                        ><Icon size={13} strokeWidth={2.2} /></span
                                      >
                                      <span class="hub-row-copy">
                                        <b>{stop.stopName ?? titleCase(stop.subtype)}</b>
                                        <small>{titleCase(stop.mode)} · {stop.connectedIslandIds.length} islands</small>
                                      </span>
                                    </div>
                                    <div
                                      class="hub-load-bar"
                                      role="img"
                                      aria-label={`${percentage(loadPercent)} capacity load with ${number(stop.localDemand)} local demand and ${number(stop.connectedDemand)} linked demand`}
                                    >
                                      <div class="hub-load-fill" style={`width: ${loadPercent}%`}>
                                        <span class="hub-load-local" style={`width: ${localShare}%`}></span>
                                        <span class="hub-load-linked" style={`width: ${100 - localShare}%`}></span>
                                      </div>
                                    </div>
                                    <div class="hub-load-legend">
                                      <span><i class="hub-dot hub-dot-local"></i>{number(stop.localDemand)} local</span>
                                      <span
                                        ><i class="hub-dot hub-dot-linked"></i>{number(stop.connectedDemand)} linked</span
                                      >
                                      {#if stop.careTransferDemand > 0}
                                        <span
                                          ><i class="hub-dot hub-dot-care"></i>{number(stop.careTransferDemand)} care</span
                                        >
                                      {/if}
                                      {#if stop.educationTransferDemand > 0}
                                        <span
                                          ><i class="hub-dot hub-dot-education"></i>{number(
                                            stop.educationTransferDemand
                                          )} student transfers</span
                                        >
                                      {/if}
                                    </div>
                                  </div>
                                  <div class="hub-row-values" aria-label={`${percentage(loadPercent)} capacity load`}>
                                    <strong>{percentage(loadPercent)}</strong>
                                  </div>
                                </div>
                              {/each}
                            </div>
                          {/each}
                        </div>
                        {#if transportStopGroups.length === 0}
                          <p class="empty-state">No transport stops are available.</p>
                        {/if}
                      </div>
                    </Card.Root>
                  </div>

                  <Card.Root class="insight-card inbound-sources-card" size="sm">
                    <div class="card-heading">
                      <div>
                        <h3>Highest inbound demand from</h3>
                      </div>
                      {#if inboundSources.length > 2}
                        <div class="card-heading-actions">
                          <Badge variant="outline">{inboundSources.length}</Badge>
                          <Button
                            class="view-more-button"
                            variant="ghost"
                            size="xs"
                            type="button"
                            aria-expanded={inboundDemandExpanded}
                            aria-controls="island-inbound-demand-details"
                            onclick={() => (inboundDemandExpanded = !inboundDemandExpanded)}
                          >
                            {inboundDemandExpanded ? 'View less' : 'View more'}
                          </Button>
                        </div>
                      {/if}
                    </div>
                    <div id="island-inbound-demand-details" class="inbound-source-list">
                      {#each inboundDemandExpanded ? inboundSources : inboundSources.slice(0, 2) as source (source.originIslandId)}
                        <div class="inbound-source-row">
                          <span>
                            <b>{source.originAtollName} {source.originName}</b>
                            <small>Health {number(source.health)} · Education {number(source.education)}</small>
                          </span>
                          <strong>{number(source.total)}</strong>
                        </div>
                      {:else}
                        <p class="empty-state">No inbound demand from other islands.</p>
                      {/each}
                    </div>
                  </Card.Root>
                {:else}
                  <p class="analytics-state" role="status">Island details are unavailable.</p>
                {/if}
              </Tabs.Content>
            </Tabs.Root>
          {/key}
        {/if}
      </div>
    </Card.Root>
  </div>
{/if}

<style>
  .island-analytics-layer {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
  }

  .connection-network-layer-fullscreen {
    z-index: 1000;
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
  :global(.island-analytics-card) {
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
    box-shadow: 0 0.7rem 2.2rem rgb(16 24 32 / 16%);
    pointer-events: auto;
  }
  .analytics-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
  }
  :global(.island-analytics-tabs) {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-top: 0.8rem;
  }
  :global(.island-analytics-tabs .analytics-tab-list) {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    margin: 0;
    border: 1px solid var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface-muted, #f4f4f5);
  }
  :global(.analytics-tab-list [data-slot='tabs-trigger']) {
    min-width: 0;
    padding: 0.3rem 0.2rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.58rem;
  }
  :global(.analytics-tab-list [data-slot='tabs-trigger']:hover),
  :global(.analytics-tab-list [data-slot='tabs-trigger']:focus-visible) {
    color: var(--mobility-accent, #09090b);
  }
  :global(.analytics-tab-list [data-slot='tabs-trigger'][data-state='active']),
  :global(.analytics-tab-list [data-slot='tabs-trigger'][data-active]) {
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
    box-shadow: 0 1px 2px rgb(16 24 32 / 8%);
  }
  :global(.island-analytics-tabs .analytics-tab-panel) {
    min-width: 0;
  }
  :global(.analytics-tab-panel > .insight-card:first-child) {
    margin-top: 0.05rem;
  }
  .score-highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
    margin-top: 0.8rem;
    padding-top: 0.65rem;
    border-top: 1px solid #e4e4e7;
  }
  .score-highlights > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.2rem 0.35rem;
  }
  .score-highlights span {
    grid-column: 1 / -1;
    color: #71717a;
    font-size: 0.55rem;
  }
  .score-highlights strong {
    overflow-wrap: anywhere;
    font-size: 0.58rem;
    font-weight: 700;
  }
  .score-highlights b {
    font-size: 0.64rem;
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }
  .health-fallback-note {
    margin-top: 0.55rem;
  }
  :global(.transport-access-overview .card-heading) {
    align-items: baseline;
  }
  .access-mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    margin-top: 0.8rem;
  }
  .access-mode-grid > div {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.9rem;
    min-height: 5.2rem;
  }
  .access-mode-grid > div + div {
    padding-left: 0.65rem;
    border-left: 1px solid #e4e4e7;
  }
  .access-mode-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: #09090b;
  }
  .access-mode-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
    background: var(--mobility-surface-muted, #f4f4f5);
    color: #09090b;
  }
  .access-mode-label {
    color: #09090b;
    font-size: 0.75rem;
    font-weight: 750;
  }
  .access-mode-grid strong {
    color: var(--access-color, #09090b);
    font-size: 1.45rem;
    line-height: 1;
    letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
  }
  :global(.island-analytics-card.connection-network-fullscreen) {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: 100vw !important;
    height: 100dvh !important;
    max-height: none;
    margin: 0 !important;
    padding: 1rem !important;
    overflow: hidden;
    box-sizing: border-box;
    border-radius: 0;
    box-shadow: 0 1rem 3rem rgb(16 24 32 / 24%);
  }
  :global(.connection-network-toggle) {
    flex: 0 0 auto;
    width: 2rem;
    height: 2rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.4rem;
    background: #ffffff;
    color: #27272a;
  }
  :global(.connection-network-toggle:hover),
  :global(.connection-network-toggle:focus-visible) {
    border-color: #a1a1aa;
    background: #f4f4f5;
    color: #09090b;
  }

  :global(.connection-network-card.connection-network-fullscreen > .card-heading) {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    z-index: 30;
    height: 0;
    min-height: 0;
    pointer-events: none;
  }

  :global(.connection-network-card.connection-network-fullscreen .connection-network-toggle) {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    margin: 0;
    pointer-events: auto;
  }

  :global(.connection-network-card.connection-network-fullscreen .connection-network) {
    position: static;
    padding-top: 0;
  }

  :global(.connection-network-card.connection-network-fullscreen .connection-destination-search) {
    position: absolute;
    top: 1.5rem;
    left: 1.5rem;
    width: min(22rem, calc(100vw - 6rem));
    margin: 0;
  }
  .chart-note {
    margin: 0.7rem 0 0;
    color: #71717a;
    font-size: 0.56rem;
    line-height: 1.45;
  }
  .context-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    margin-top: 0.7rem;
  }
  .analytics-heading,
  .card-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
  }
  .card-heading-actions {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 0.35rem;
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
  .collapsed-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.75rem;
    margin-top: 0.7rem;
    color: #71717a;
    font-size: 0.56rem;
  }
  .collapsed-summary span {
    display: inline-flex;
    align-items: baseline;
    gap: 0.22rem;
  }
  .collapsed-summary b {
    color: #09090b;
    font-variant-numeric: tabular-nums;
  }
  .collapsed-connection-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .collapsed-hub-list {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.6rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e4e4e7;
  }
  .collapsed-hub-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
  }
  .collapsed-hub-copy {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
  }
  .collapsed-hub-copy b {
    overflow: hidden;
    color: #09090b;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collapsed-hub-copy small {
    color: #71717a;
    font-size: 0.54rem;
  }
  h2 {
    margin: 0;
    font-size: clamp(1.7rem, 3vw, 2.15rem);
    font-weight: 950;
    letter-spacing: -0.045em;
    line-height: 0.98;
  }
  :global(.close-button) {
    display: grid;
    place-items: center;
    width: 2.45rem;
    height: 2.45rem;
    border: 1px solid #d4d4d8;
    border-radius: 0.8rem;
    color: #27272a;
  }
  :global(.insight-card) {
    margin-top: 0.8rem;
    padding: 0.72rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.42rem;
    background: #fff;
    color: #09090b;
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
  }
  h3 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 800;
  }
  :global(.island-analytics-card [data-slot='badge']) {
    border-color: #d4d4d8;
    background: #fafafa;
    color: #27272a;
    box-shadow: none;
    font-size: 0.56rem;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
  }
  .people-total {
    display: block;
    margin: 0;
    font-size: 1.25rem;
    letter-spacing: -0.04em;
  }
  .employment-heading-total {
    color: #09090b;
    font-size: 1.2rem;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .employment-scoreline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.72rem;
  }
  .employment-scoreline strong {
    color: #09090b;
    font-size: 1.35rem;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .employment-scoreline span,
  .employment-assumption {
    color: #71717a;
    font-size: 0.56rem;
  }
  .employment-breakdown {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.7rem;
    color: #71717a;
    font-size: 0.57rem;
  }
  .employment-category {
    display: grid;
    gap: 0.3rem;
  }
  .employment-category-heading,
  .employment-subcategory-list span,
  .employment-balance-bars span {
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
  .employment-subcategory-list strong,
  .employment-balance-bars b {
    color: #09090b;
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
  .employment-balance-bars {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.7rem;
    padding-top: 0.6rem;
    border-top: 1px solid #e4e4e7;
    color: #71717a;
    font-size: 0.57rem;
  }
  :global(.employment-balance-bars [data-slot='progress']) {
    height: 0.3rem;
    margin-top: 0.25rem;
    background: #e4e4e7;
  }
  :global(.employment-balance-bars [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  .employment-assumption {
    margin: 0.65rem 0 0;
  }
  :global(.sustainability-card) {
    border-color: var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface, #ffffff);
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
  .sustainability-metrics {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.7rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--mobility-border, #e4e4e7);
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
  }
  .sustainability-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .sustainability-metrics b {
    color: var(--mobility-text, #09090b);
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
  .population-list {
    display: grid;
    gap: 0.72rem;
    margin-top: 0.8rem;
  }
  .population-row {
    display: grid;
    gap: 0.3rem;
  }
  .population-topline,
  .service-group-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .population-topline span,
  .service-group-title span {
    font-size: 0.66rem;
    font-weight: 700;
  }
  .population-topline b,
  .service-group-title b {
    color: #09090b;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }
  :global(.population-row [data-slot='progress']) {
    height: 0.34rem;
    background: #e4e4e7;
  }
  :global(.population-row [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  :global(.population-overlap [data-slot='progress']) {
    background: #f4f4f5;
  }
  :global(.population-overlap [data-slot='progress-indicator']) {
    background: #a1a1aa;
  }
  .population-row small {
    color: #71717a;
    font-size: 0.54rem;
  }
  .stat-list {
    display: grid;
    gap: 0.48rem;
    margin-top: 0.7rem;
    color: #71717a;
    font-size: 0.59rem;
  }
  .stat-list span {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .stat-list b {
    color: #09090b;
  }
  .service-groups {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.7rem;
  }
  .service-group {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.45rem;
    border-top: 1px solid #e4e4e7;
  }
  .service-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .service-item {
    padding: 0.3rem 0.4rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.35rem;
    background: #fff;
    color: #52525b;
    font-size: 0.56rem;
  }
  .service-item b {
    color: #09090b;
  }
  .empty-inline,
  .empty-state {
    color: #71717a;
    font-size: 0.6rem;
  }
  .empty-state {
    margin: 0;
  }
  :global(.connections-panel) {
    width: 100%;
  }
  .connection-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.7rem;
  }
  .connection-mode {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    column-gap: 0.3rem;
    min-width: 4.2rem;
    padding: 0.35rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.35rem;
    background: #fafafa;
  }
  .connection-mode-icon,
  .connection-row-icon {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 0.35rem;
    background: #f4f4f5;
    color: #09090b;
  }
  .connection-mode-icon {
    grid-row: span 2;
  }
  .connection-mode strong {
    color: #09090b;
    font-size: 0.72rem;
    line-height: 1;
  }
  .connection-mode > span:last-child {
    color: #52525b;
    font-size: 0.52rem;
  }
  .connection-list {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e4e4e7;
  }
  .connection-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.65rem;
  }
  .connection-row-icon {
    flex: 0 0 auto;
  }
  .connection-copy {
    display: grid;
    min-width: 0;
    gap: 0.1rem;
  }
  .connection-copy b {
    overflow: hidden;
    color: #09090b;
    font-size: 0.64rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .connection-copy span {
    color: #71717a;
    font-size: 0.55rem;
  }
  .demand-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }
  :global(.demand-card) {
    min-width: 0;
  }
  :global(.transport-demand-card) {
    grid-column: 1 / -1;
  }
  .demand-heading {
    align-items: baseline;
  }
  .demand-percentage {
    color: #09090b;
    font-size: 1.35rem;
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .demand-metrics {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
    color: #71717a;
    font-size: 0.58rem;
  }
  .demand-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .demand-metrics b {
    color: #09090b;
    font-variant-numeric: tabular-nums;
  }
  :global(.demand-card [data-slot='progress']) {
    height: 0.34rem;
    margin-top: 0.7rem;
    background: #e4e4e7;
  }
  :global(.demand-card [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }
  .hub-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e4e4e7;
  }
  .transport-stop-group {
    display: grid;
    gap: 0.25rem;
    padding-top: 0.45rem;
    border-top: 1px solid #f4f4f5;
  }
  .transport-stop-group:first-of-type {
    padding-top: 0;
    border-top: 0;
  }
  .transport-stop-group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    color: #71717a;
    font-size: 0.55rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .transport-stop-group-heading strong {
    color: #3f3f46;
    font-weight: 800;
  }
  .transport-stop-group-heading span {
    display: grid;
    min-width: 1.2rem;
    height: 1.2rem;
    place-items: center;
    border: 1px solid #e4e4e7;
    border-radius: 999px;
    color: #52525b;
    font-size: 0.52rem;
    font-variant-numeric: tabular-nums;
  }
  .inbound-source-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e4e4e7;
  }
  .inbound-source-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
  }
  .inbound-source-row > span {
    display: grid;
    min-width: 0;
    gap: 0.12rem;
  }
  .inbound-source-row b {
    overflow: hidden;
    color: #09090b;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbound-source-row small {
    color: #71717a;
    font-size: 0.54rem;
  }
  .inbound-source-row > strong {
    color: #09090b;
    font-size: 0.65rem;
    font-variant-numeric: tabular-nums;
  }
  .hub-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.2rem 0;
  }
  .hub-row-main {
    display: grid;
    min-width: 0;
    gap: 0.28rem;
  }
  .hub-row-heading {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 0.4rem;
  }
  .hub-mode-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 0.35rem;
    background: #f4f4f5;
    color: #3f3f46;
  }
  .hub-row-copy {
    display: grid;
    min-width: 0;
    gap: 0.08rem;
  }
  .hub-row b {
    overflow: hidden;
    color: #09090b;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hub-row-copy small,
  .hub-load-legend {
    color: #71717a;
    font-size: 0.54rem;
  }
  .hub-load-bar {
    display: flex;
    overflow: hidden;
    width: 100%;
    height: 0.32rem;
    border-radius: 999px;
    background: #e4e4e7;
  }
  .hub-load-fill {
    display: flex;
    min-width: 0;
    height: 100%;
  }
  .hub-load-fill > span {
    display: block;
    min-width: 0;
    height: 100%;
  }
  .hub-load-local {
    background: var(--mobility-accent, #09090b);
  }
  .hub-load-linked {
    background: #a1a1aa;
  }
  .hub-load-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.55rem;
    line-height: 1;
  }
  .hub-load-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
  }
  .hub-dot {
    display: inline-block;
    width: 0.35rem;
    height: 0.35rem;
    border-radius: 999px;
  }
  .hub-dot-local {
    background: var(--mobility-accent, #09090b);
  }
  .hub-dot-linked {
    background: #a1a1aa;
  }
  .hub-dot-care {
    background: #c69a5c;
  }
  .hub-dot-education {
    background: #6b8eaf;
  }
  .hub-row-values {
    display: grid;
    justify-items: end;
    gap: 0.05rem;
    min-width: 3.2rem;
  }
  .hub-row-values strong {
    color: #09090b;
    font-size: 1rem;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .analytics-state {
    color: #71717a;
    font-size: 0.65rem;
  }
  .island-loading-content {
    margin-top: 0.8rem;
  }
  .island-loading-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.25rem;
    padding: 0.2rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.4rem;
    background: #f4f4f5;
  }
  :global(.island-loading-tab) {
    width: 100%;
    height: 1.65rem;
    border-radius: 0.3rem;
  }
  :global(.island-loading-tab-active) {
    background-color: #fff !important;
  }
  :global(.island-loading-title) {
    width: 8rem;
    height: 1.35rem;
  }
  .island-loading-title-wrap {
    height: 1.35rem;
  }
  :global(.island-loading-panel-heading) {
    width: 6.2rem;
    height: 0.68rem;
    border-radius: 999px;
  }
  :global(.island-loading-panel-heading-wide) {
    width: 10rem;
  }
  .island-loading-allocation-lanes {
    display: grid;
    gap: 0.75rem;
    margin-top: 0.8rem;
  }
  .island-loading-allocation-lane {
    display: grid;
    gap: 0.35rem;
    padding: 0.65rem;
    border: 1px solid #e4e4e7;
    border-radius: 0.4rem;
  }
  .island-loading-allocation-lane > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  :global(.island-loading-lane-icon) {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.5rem;
  }
  :global(.island-loading-lane-label) {
    width: 7.5rem;
    height: 0.55rem;
    margin-right: auto;
    border-radius: 999px;
  }
  :global(.island-loading-lane-track) {
    width: 100%;
    height: 0.4rem;
    border-radius: 999px;
  }
  :global(.island-loading-lane-caption) {
    width: 9rem;
    height: 0.45rem;
    border-radius: 999px;
  }
  :global(.island-loading-lane-value) {
    width: 2.4rem;
    height: 0.55rem;
    border-radius: 999px;
  }
  :global(.island-loading-network-toggle) {
    width: 2rem;
    height: 2rem;
    border-radius: 0.35rem;
  }
  .island-loading-network {
    position: relative;
    height: 14rem;
    margin-top: 0.8rem;
    overflow: hidden;
    border: 1px solid #e4e4e7;
    border-radius: 0.45rem;
    background: #fafafa;
  }
  :global(.island-loading-network-node) {
    position: absolute;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: 50%;
  }
  :global(.island-loading-network-node-1) {
    top: 42%;
    left: 42%;
  }
  :global(.island-loading-network-node-2) {
    top: 14%;
    left: 14%;
  }
  :global(.island-loading-network-node-3) {
    top: 16%;
    right: 14%;
  }
  :global(.island-loading-network-node-4) {
    bottom: 12%;
    left: 18%;
  }
  :global(.island-loading-network-node-5) {
    right: 18%;
    bottom: 14%;
  }
  :global(.island-loading-network-line) {
    position: absolute;
    top: 49%;
    left: 18%;
    width: 64%;
    height: 0.25rem;
    border-radius: 999px;
    transform: rotate(22deg);
  }
  :global(.island-loading-network-line-two) {
    transform: rotate(-25deg);
  }
  :global(.island-loading-access-icon) {
    width: 2rem;
    height: 2rem;
    border-radius: 0.6rem;
  }
  :global(.island-loading-access-label) {
    width: 3rem;
    height: 0.55rem;
    border-radius: 999px;
  }
  :global(.island-loading-access-score) {
    width: 3.3rem;
    height: 1.45rem;
    border-radius: 0.3rem;
  }
  :global(.island-analytics-card [data-slot='skeleton']) {
    background-color: #f4f4f5;
    background-image: linear-gradient(90deg, #f4f4f5 0%, #fafafa 50%, #f4f4f5 100%);
    background-size: 200% 100%;
  }
  @media (max-width: 640px) {
    .island-analytics-layer {
      align-items: flex-end;
    }
    :global(.island-analytics-card) {
      width: calc(100vw - 1rem);
      height: auto;
      max-height: calc(100dvh - 1rem);
      align-self: flex-end;
      margin: 0.5rem;
    }
    :global(.island-analytics-card.connection-network-fullscreen) {
      inset: 0;
      width: 100vw;
      height: 100dvh;
      padding: 0.75rem !important;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
    .demand-grid {
      grid-template-columns: 1fr;
    }
    :global(.analytics-tab-list [data-slot='tabs-trigger']) {
      padding-inline: 0.2rem;
      font-size: 0.54rem;
    }
    .context-metrics {
      grid-template-columns: 1fr;
    }
  }

  :global(.island-analytics-card) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    color-scheme: light;
    box-shadow: 0 0.7rem 2.2rem rgb(16 24 32 / 12%);
  }

  :global(.island-analytics-card .insight-card) {
    border-color: var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-text, #09090b);
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 4%);
  }

  :global(.island-analytics-card h2),
  :global(.island-analytics-card h3),
  :global(.island-analytics-card .people-total),
  :global(.island-analytics-card .population-topline b),
  :global(.island-analytics-card .service-group-title b),
  :global(.island-analytics-card .stat-list b),
  :global(.island-analytics-card .service-item b),
  :global(.island-analytics-card .connection-copy b),
  :global(.island-analytics-card .demand-percentage),
  :global(.island-analytics-card .demand-metrics b),
  :global(.island-analytics-card .inbound-source-row b),
  :global(.island-analytics-card .inbound-source-row > strong),
  :global(.island-analytics-card .hub-row b),
  :global(.island-analytics-card .hub-row-values strong) {
    color: var(--mobility-text, #09090b);
  }

  :global(.island-analytics-card .card-heading > div > p),
  :global(.island-analytics-card .population-row small),
  :global(.island-analytics-card .stat-list),
  :global(.island-analytics-card .service-item),
  :global(.island-analytics-card .empty-inline),
  :global(.island-analytics-card .empty-state),
  :global(.island-analytics-card .connection-copy span),
  :global(.island-analytics-card .demand-metrics),
  :global(.island-analytics-card .inbound-source-row small),
  :global(.island-analytics-card .hub-row-copy small),
  :global(.island-analytics-card .hub-load-legend),
  :global(.island-analytics-card .hub-row-values small),
  :global(.island-analytics-card .analytics-state) {
    color: var(--mobility-muted, #71717a);
  }

  :global(.island-analytics-card .close-button) {
    border-color: var(--mobility-border-strong, #d4d4d8);
    background: var(--mobility-surface, #ffffff);
    color: var(--mobility-accent, #09090b);
  }

  :global(.island-analytics-card .close-button:hover),
  :global(.island-analytics-card .close-button:focus-visible) {
    border-color: var(--mobility-focus, #3f3f46);
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  :global(.island-analytics-card [data-slot='progress']) {
    background: var(--mobility-surface-muted, #f4f4f5);
  }

  :global(.island-analytics-card [data-slot='progress-indicator']) {
    background: var(--mobility-accent, #09090b);
  }

  :global(.island-analytics-card .service-group),
  :global(.island-analytics-card .connection-list),
  :global(.island-analytics-card .hub-list),
  :global(.island-analytics-card .inbound-source-list) {
    border-color: var(--mobility-border, #e4e4e7);
  }

  :global(.island-analytics-card .service-item),
  :global(.island-analytics-card .connection-mode) {
    border-color: var(--mobility-border, #e4e4e7);
    background: var(--mobility-surface-soft, #fafafa);
  }

  :global(.island-analytics-card .connection-mode-icon),
  :global(.island-analytics-card .connection-row-icon),
  :global(.island-analytics-card .hub-mode-icon) {
    background: var(--mobility-accent-soft, #f4f4f5);
    color: var(--mobility-accent, #09090b);
  }

  :global(.island-analytics-card .hub-load-bar) {
    background: var(--mobility-surface-muted, #f4f4f5);
  }

  :global(.island-analytics-card .hub-load-local),
  :global(.island-analytics-card .hub-dot-local) {
    background: var(--mobility-accent, #09090b);
  }

  :global(.connection-network-fullscreen) {
    position: fixed !important;
    inset: 0 !important;
    z-index: 1000 !important;
    width: 100vw !important;
    height: 100dvh !important;
    max-height: none !important;
    margin: 0 !important;
    padding: 1rem !important;
    box-sizing: border-box !important;
    border-radius: 0 !important;
  }
</style>
