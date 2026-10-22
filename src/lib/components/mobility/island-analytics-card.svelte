<script lang="ts">
  import type { IslandDemandMetric, IslandProfile } from './island-profile';
  import type { AnalyticsIsland } from './national-analytics-card.svelte';
  import type { SustainabilityFactorKey, SustainabilityScore } from './sustainability-types';

  import Bus from '@lucide/svelte/icons/bus';
  import Car from '@lucide/svelte/icons/car';
  import Plane from '@lucide/svelte/icons/plane';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import X from '@lucide/svelte/icons/x';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  import * as Accordion from '$components/ui/accordion';
  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { Skeleton } from '$components/ui/skeleton';
  import * as Tabs from '$components/ui/tabs';

  import IslandAllocationLanes from './island-allocation-lanes.svelte';
  import { islandScoreHighlights, islandScoreMetrics } from './island-chart-data';
  import IslandContextGauge from './island-context-gauge.svelte';
  import IslandDemandFlow from './island-demand-flow.svelte';
  import IslandPopulationComposition from './island-population-composition.svelte';
  import IslandScoreComparison from './island-score-comparison.svelte';
  import ScoreDisplay from './score-display.svelte';
  import { SUSTAINABILITY_FACTORS, vehicleCategoryLabel } from './sustainability-types';

  type Props = {
    open?: boolean;
    island: AnalyticsIsland | null;
    profile: IslandProfile | null;
    loading?: boolean;
    error?: string | null;
    onClose?: () => void;
    proposalMode?: boolean;
    autoExpandConnections?: boolean;
    connectionsOnMap?: boolean;
    onExploreConnections?: () => void;
  };
  let {
    open = $bindable(false),
    island,
    profile,
    loading = false,
    error = null,
    onClose = () => (open = false),
    proposalMode = false,
    autoExpandConnections = false,
    connectionsOnMap = false,
    onExploreConnections
  }: Props = $props();
  let connectionsExpanded = $derived(autoExpandConnections);
  let transportLoadExpanded = $state(false);
  let inboundDemandExpanded = $state(false);

  let scoreMetrics = $derived(islandScoreMetrics(island));
  let scoreHighlights = $derived(islandScoreHighlights(scoreMetrics));
  let currentProfile = $derived(profile?.island.id === island?.id ? profile : null);
  let vehicleIntensity = $derived(currentProfile ? vehicleIntensityPercent(currentProfile.sustainability) : null);

  let hospitalMetric = $derived(
    currentProfile?.demand.health.hospitalDemand ?? currentProfile?.demand.health.demand ?? null
  );
  let hospitalLabel = $derived(currentProfile?.demand.health.hospitalDemand ? 'Hospital' : 'Health');
  let allocationRows = $derived(
    currentProfile && hospitalMetric
      ? [
          { key: 'health', label: hospitalLabel, metric: hospitalMetric },
          { key: 'education', label: 'Education', metric: currentProfile.demand.education.demand }
        ]
      : []
  );
  let highlightedAllocations = $derived(
    allocationRows.map((row) => ({ ...row, headline: allocationHeadline(row.label, row.metric) }))
  );
  let accessModes = $derived(
    currentProfile
      ? [
          { key: 'bus', label: 'Land', score: currentProfile.transportAccess.land.score },
          { key: 'ferry', label: 'Marine', score: currentProfile.transportAccess.marine.score },
          { key: 'air', label: 'Air', score: currentProfile.transportAccess.air.score }
        ]
      : []
  );

  function allocationHeadline(
    label: string,
    metric: IslandDemandMetric
  ): { label: string; value: number; note: string } {
    if (metric.outbound > 0)
      return { label: `Outbound ${label.toLowerCase()}`, value: metric.outbound, note: 'Demand allocated off island' };
    if (metric.inbound > 0)
      return {
        label: `Inbound ${label.toLowerCase()}`,
        value: metric.inbound,
        note: 'Demand arriving from other islands'
      };
    if (metric.unserved > 0)
      return {
        label: `Unserved ${label.toLowerCase()}`,
        value: metric.unserved,
        note: 'Demand with no allocated service'
      };
    return { label: `Outbound ${label.toLowerCase()}`, value: metric.outbound, note: 'Demand allocated off island' };
  }

  function allocationAmount(value: number | null | undefined): string {
    return value === null || value === undefined || !Number.isFinite(value)
      ? 'N/A'
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function percentage(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : `${Math.round(value)}%`;
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

  function vehicleIntensityPercent(score: SustainabilityScore): number | null {
    if (score.publicTransportReliance === null) return null;
    return Math.min(100, Math.max(0, (1 - score.publicTransportReliance) * 100));
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

  function isAvailableFocusTarget(element: HTMLElement | null): element is HTMLElement {
    if (
      !element?.isConnected ||
      element.closest('[hidden], [inert], [aria-hidden="true"]') ||
      element.getClientRects().length === 0
    ) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function manageDrawerFocus(layer: HTMLDivElement) {
    const activeElement = document.activeElement;
    const invokingElement =
      activeElement instanceof HTMLElement && activeElement !== document.body && !layer.contains(activeElement)
        ? activeElement
        : null;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || !open || proposalMode || !isAvailableFocusTarget(layer)) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    layer.addEventListener('keydown', handleKeydown);
    const entryFrame = window.requestAnimationFrame(() => {
      if (!open || proposalMode || !isAvailableFocusTarget(layer)) return;
      const closeButton = layer.querySelector<HTMLButtonElement>('.close-button');
      if (isAvailableFocusTarget(closeButton)) closeButton.focus({ preventScroll: true });
    });

    return () => {
      layer.removeEventListener('keydown', handleKeydown);
      window.cancelAnimationFrame(entryFrame);
      window.requestAnimationFrame(() => {
        const currentFocus = document.activeElement;
        if (currentFocus && currentFocus !== document.body && !layer.contains(currentFocus)) return;
        const toggle = document.querySelector<HTMLElement>('[aria-controls="island-analytics-dialog"]');
        const target = isAvailableFocusTarget(invokingElement) ? invokingElement : toggle;
        if (isAvailableFocusTarget(target)) target.focus({ preventScroll: true });
      });
    };
  }
</script>

{#if open}
  <div
    class={`island-analytics-layer${proposalMode ? ' proposal-mode-right' : ''}`}
    aria-hidden={proposalMode}
    inert={proposalMode}
    {@attach !proposalMode && manageDrawerFocus}
    in:fly={{ x: prefersReducedMotion.current ? 0 : 12, duration: prefersReducedMotion.current ? 0 : 220 }}
    out:fly={{ x: prefersReducedMotion.current ? 0 : 8, duration: prefersReducedMotion.current ? 0 : 140 }}
  >
    <Card.Root
      id="island-analytics-dialog"
      class="island-analytics-card"
      role="dialog"
      aria-label="Island details and analytics"
      data-story-target="island-analytics"
    >
      <div class="analytics-heading">
        <div class="analytics-identity">
          <div class="analytics-identity-copy">
            <span class="analytics-eyebrow">Island analytics</span>
            <h2>{island?.name ?? 'Island details'}</h2>
            {#if island}<p>{island.atollName} · mobility index</p>{/if}
          </div>
          {#if island}<ScoreDisplay
              value={island.overall.score}
              prominent
              --score-emoji-size="4rem"
              --score-value-size="var(--mobility-text-3xl)"
            />{/if}
        </div>
        <Button class="close-button" variant="ghost" size="icon" aria-label="Close island analytics" onclick={onClose}
          ><X size={16} strokeWidth={2.2} /></Button
        >
      </div>

      {#if loading}
        <div class="analytics-loading" role="status" aria-label="Loading island analytics">
          <span class="sr-only">Loading island analytics</span>
          <Skeleton class="analytics-loading-tabs" />
          <div class="analytics-loading-stats"><Skeleton /><Skeleton /></div>
          {#each [0, 1] as row (row)}<Skeleton class="analytics-loading-chart" />{/each}
        </div>
      {:else if error}
        <p class="analytics-state" role="alert">{error}</p>
      {:else if island}
        {#key island.id}
          <Tabs.Root value="access" class="island-analytics-tabs">
            <Tabs.List class="analytics-tab-list" aria-label="Island analytics sections">
              <Tabs.Trigger value="access">Access</Tabs.Trigger>
              <Tabs.Trigger value="people">People &amp; services</Tabs.Trigger>
              <Tabs.Trigger value="model">Model detail</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="access" class="analytics-tab-panel" data-story-scroll-container>
              {#if currentProfile}
                <Card.Root class="insight-card access-overview" size="sm">
                  <div class="card-heading"><h3>Where connections matter most</h3></div>
                  <div class="access-highlights">
                    {#each highlightedAllocations as row (row.key)}
                      <div data-story-target={row.key === 'health' ? 'island-health-demand' : undefined}>
                        <span>{row.headline.label}</span><strong>{allocationAmount(row.headline.value)}</strong><small
                          >{row.headline.note}</small
                        >
                      </div>
                    {/each}
                  </div>
                  {#if !currentProfile.demand.health.hospitalDemand}
                    <p class="chart-note health-fallback-note">
                      Health includes all recorded care needs; a hospital-only breakdown is unavailable.
                    </p>
                  {/if}
                  <IslandAllocationLanes rows={allocationRows} />
                  <p class="chart-note">
                    Modeled demand allocations, not daily trips or counts of unique people. Inbound demand is separate
                    from resident demand.
                  </p>
                </Card.Root>
                <Card.Root
                  class="insight-card transport-access-overview"
                  size="sm"
                  data-story-target={connectionsOnMap ? 'island-connections' : undefined}
                >
                  <div class="card-heading">
                    <h3>Transport access</h3>
                    <span class="access-link-total">{currentProfile.connections.direct.length} direct links</span>
                  </div>
                  <div class="access-mode-grid">
                    {#each accessModes as mode (mode.key)}
                      {@const Icon = connectionIcon(mode.key)}
                      <div>
                        <span><Icon size={14} aria-hidden="true" />{mode.label}</span>
                        <strong>{percentage(mode.score)}</strong>
                        <small>access index</small>
                      </div>
                    {/each}
                  </div>
                  {#if currentProfile.connections.byType.length}
                    <p class="transport-link-summary">
                      {#each currentProfile.connections.byType as connection, index (connection.type)}{index > 0
                          ? ' · '
                          : ''}{connection.count}
                        {titleCase(connection.type)}{/each}
                    </p>
                  {/if}
                  {#if connectionsOnMap && onExploreConnections}
                    <Button class="connection-map-link" variant="outline" size="sm" onclick={onExploreConnections}
                      ><Route size={15} strokeWidth={2} />Explore connections &amp; inbound demand</Button
                    >
                  {/if}
                </Card.Root>
                {#if !connectionsOnMap}
                  <Card.Root class="insight-card connections-panel" size="sm" data-story-target="island-connections">
                    <div class="card-heading">
                      <div>
                        <h3>Available connections</h3>
                      </div>
                      {#if currentProfile.connections.direct.length > 2}
                        <div class="card-heading-actions">
                          <Badge variant="outline">{currentProfile.connections.direct.length}</Badge>
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
                      {#if connectionsExpanded || currentProfile.connections.direct.length <= 2}
                        <div class="connection-modes">
                          {#each currentProfile.connections.byType as connection (connection.type)}
                            {@const Icon = connectionIcon(connection.type)}
                            <div class="connection-mode">
                              <span class="connection-mode-icon"><Icon size={15} strokeWidth={2.2} /></span>
                              <strong>{connection.count}</strong>
                              <span>{titleCase(connection.type)}</span>
                            </div>
                          {/each}
                        </div>
                        <div class="connection-list">
                          {#each currentProfile.connections.direct as connection (connection.id)}
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
                          {#each currentProfile.connections.direct.slice(0, 2) as connection (connection.id)}
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
                {/if}
              {:else}
                <p class="analytics-state" role="status">Island details are unavailable.</p>
              {/if}
            </Tabs.Content>

            <Tabs.Content value="people" class="analytics-tab-panel" data-story-scroll-container>
              {#if currentProfile}
                <Card.Root class="insight-card population-panel" size="sm" data-story-target="island-population">
                  <div class="card-heading">
                    <div>
                      <h3>Population</h3>
                    </div>
                    <strong class="people-total">{number(currentProfile.population.total)}</strong>
                  </div>
                  <IslandPopulationComposition
                    bands={currentProfile.population.bands}
                    total={currentProfile.population.total}
                  />
                  <Accordion.Root type="single" class="analytics-disclosure-root">
                    <Accordion.Item value="age-bands" class="detail-disclosure">
                      <Accordion.Trigger class="analytics-disclosure-trigger"
                        ><span class="disclosure-copy">All age bands and overlapping groups</span></Accordion.Trigger
                      >
                      <Accordion.Content class="analytics-disclosure-content">
                        <div class="population-list">
                          {#each currentProfile.population.bands as band (band.key)}
                            <div
                              class={['population-row', { 'population-overlap': band.overlapping }]}
                              data-story-target={band.key === 'elderly_population_65_plus'
                                ? 'island-elderly-population'
                                : undefined}
                            >
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
                      </Accordion.Content>
                    </Accordion.Item>
                  </Accordion.Root>
                </Card.Root>
                <Card.Root class="insight-card" size="sm">
                  <div class="card-heading">
                    <div>
                      <h3>Services</h3>
                    </div>
                  </div>
                  <div class="service-groups">
                    {#each currentProfile.services as group (group.key)}
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
                <Card.Root class="insight-card employment-card" size="sm">
                  <div class="card-heading">
                    <div>
                      <h3>Workplace breakdown</h3>
                    </div>
                    <strong class="employment-heading-total"
                      >{number(currentProfile.employment.jobLocationCount)}</strong
                    >
                  </div>
                  <div class="employment-breakdown">
                    {#each currentProfile.employment.categories as category (category.key)}
                      <div class="employment-category">
                        <div class="employment-category-heading">
                          <span>{titleCase(category.label)}</span>
                          <strong>{number(category.count)}</strong>
                        </div>
                        <Progress
                          value={categoryShare(category.count, currentProfile.employment.jobLocationCount)}
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
              {:else}
                <p class="analytics-state" role="status">Population and service details are unavailable.</p>
              {/if}
            </Tabs.Content>

            <Tabs.Content value="model" class="analytics-tab-panel" data-story-scroll-container>
              <Card.Root class="insight-card score-comparison-panel" size="sm">
                <div class="card-heading"><div><h3>What makes up this score?</h3></div></div>
                <div class="category-chart">
                  <IslandScoreComparison metrics={scoreMetrics} overall={island.overall.score} />
                </div>
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
                  Five equally weighted categories, using available data. These are index scores, not the share of
                  residents served.
                </p>
              </Card.Root>

              <Card.Root class="insight-card" size="sm">
                <div class="card-heading"><div><h3>Pressure &amp; balance</h3></div></div>
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
                <p class="chart-note">Context measures · separate from the five-category index.</p>
              </Card.Root>
              {#if currentProfile}
                <Accordion.Root type="single" class="analytics-disclosure-root">
                  <Accordion.Item value="demand" class="model-disclosure">
                    <Accordion.Trigger class="analytics-disclosure-trigger"
                      ><span class="disclosure-copy"
                        >Health &amp; education model <span>Allocation detail and population basis</span></span
                      ></Accordion.Trigger
                    >
                    <Accordion.Content class="analytics-disclosure-content">
                      <div class="demand-grid demand-flow-grid">
                        <Card.Root class="insight-card demand-card" size="sm">
                          <div class="card-heading demand-heading">
                            <div>
                              <h3>Health demand</h3>
                            </div>
                            <strong
                              class="demand-percentage"
                              title="Modeled on-island demand / population basis, capped at 100%"
                              >{percentage(currentProfile.demand.health.demand.demandPercent)}</strong
                            >
                          </div>
                          <IslandDemandFlow metric={currentProfile.demand.health.demand} label="Health" />
                          <div class="demand-metrics">
                            <span
                              >Non-elderly baseline <b>{number(currentProfile.demand.health.allAgeDemand?.combined)}</b
                              ></span
                            ><span
                              >Hospital demand <b
                                >{percentage(currentProfile.demand.health.hospitalDemand?.demandPercent ?? null)}</b
                              ></span
                            ><span
                              >Children/adolescent demand <b
                                >{number(currentProfile.demand.health.youngerCareDemand?.combined)}</b
                              ></span
                            ><span
                              >Elderly hospital outbound <b
                                >{number(currentProfile.demand.health.elderlyCareDemand?.outbound)}</b
                              ></span
                            ><span>Population basis <b>{number(currentProfile.demand.health.populationBasis)}</b></span>
                          </div>
                        </Card.Root>

                        <Card.Root class="insight-card demand-card" size="sm">
                          <div class="card-heading demand-heading">
                            <div>
                              <h3>Education demand</h3>
                            </div>
                            <strong
                              class="demand-percentage"
                              title="Modeled on-island demand / population basis, capped at 100%"
                              >{percentage(currentProfile.demand.education.demand.demandPercent)}</strong
                            >
                          </div>
                          <IslandDemandFlow metric={currentProfile.demand.education.demand} label="Education" />
                          <div class="demand-metrics">
                            <span>Children <b>{number(currentProfile.demand.education.childPopulation)}</b></span><span
                              >Adolescents <b>{number(currentProfile.demand.education.adolescentPopulation)}</b></span
                            ><span>Youth <b>{number(currentProfile.demand.education.youthPopulation)}</b></span>
                          </div>
                        </Card.Root>
                      </div>
                      <p class="demand-model-note">
                        Modeled demand estimates, not daily trips or unique people. Different needs can overlap; demand
                        percentages are capped at 100%.
                      </p>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
                <Accordion.Root type="single" class="analytics-disclosure-root">
                  <Accordion.Item value="transport" class="model-disclosure">
                    <Accordion.Trigger class="analytics-disclosure-trigger"
                      ><span class="disclosure-copy"
                        >Transport &amp; employment model <span>Stop loads, transfers and working population</span
                        ></span
                      ></Accordion.Trigger
                    >
                    <Accordion.Content class="analytics-disclosure-content">
                      <div class="demand-grid">
                        <Card.Root class="insight-card demand-card employment-balance-card" size="sm">
                          <div class="card-heading">
                            <div>
                              <h3>Employment balance</h3>
                            </div>
                            <strong class="card-heading-score">{percentage(currentProfile.employment.score)}</strong>
                          </div>
                          <div class="demand-metrics">
                            <span>Foreign residents <b>{number(currentProfile.employment.foreignPopulation)}</b></span>
                            <span
                              >Working age 15-64 <b>{number(currentProfile.employment.workingAgePopulation)}</b></span
                            >
                            <span
                              >Foreign / working age <b
                                >{percentage(
                                  currentProfile.employment.foreignPerWorkingAge === null
                                    ? null
                                    : currentProfile.employment.foreignPerWorkingAge * 100
                                )}</b
                              ></span
                            >
                            <span
                              >Workplaces / 1,000 working age <b
                                >{decimal(currentProfile.employment.jobLocationsPerThousandWorkingAge)}</b
                              ></span
                            >
                            <span
                              >Foreign / workplace <b>{decimal(currentProfile.employment.foreignPerJobLocation)}</b
                              ></span
                            >
                          </div>
                          <div class="employment-balance-bars">
                            <div>
                              <span>Demand balance <b>{percentage(currentProfile.employment.pressureScore)}</b></span>
                              <Progress
                                value={currentProfile.employment.pressureScore ?? 0}
                                max={100}
                                aria-label="Job demand balance score"
                              />
                            </div>
                            <div>
                              <span>Supply balance <b>{percentage(currentProfile.employment.supplyScore)}</b></span>
                              <Progress
                                value={currentProfile.employment.supplyScore ?? 0}
                                max={100}
                                aria-label="Job supply balance score"
                              />
                            </div>
                          </div>
                          {#if currentProfile.employment.foreignPopulationSource === 'assumed_zero'}
                            <p class="employment-assumption">Missing `foregner` row treated as zero.</p>
                          {/if}
                        </Card.Root>

                        <Card.Root class="insight-card demand-card transport-demand-card" size="sm">
                          <div class="card-heading">
                            <div>
                              <h3>Transport load</h3>
                            </div>
                            {#if currentProfile.demand.transport.stops.length > 2}
                              <Button
                                class="view-more-button"
                                variant="ghost"
                                size="xs"
                                type="button"
                                aria-expanded={transportLoadExpanded}
                                aria-controls="island-transport-load-details"
                                onclick={() => (transportLoadExpanded = !transportLoadExpanded)}
                              >
                                {transportLoadExpanded ? 'View less' : 'View more'}
                              </Button>
                            {/if}
                          </div>
                          <div id="island-transport-load-details">
                            {#if transportLoadExpanded || currentProfile.demand.transport.stops.length <= 2}
                              <div class="demand-metrics transport-demand-metrics">
                                <span
                                  >Resident population <b
                                    >{number(currentProfile.demand.transport.residentPopulation)}</b
                                  ></span
                                ><span
                                  >Inbound care + education
                                  <b
                                    >{number(
                                      currentProfile.demand.transport.careTransferDemand +
                                        currentProfile.demand.transport.educationTransferDemand
                                    )}</b
                                  ></span
                                ><span
                                  >Outbound load <b>{number(currentProfile.demand.transport.outboundPopulation)}</b
                                  ></span
                                ><span
                                  >Working demand <b>{number(currentProfile.demand.transport.workingDemand)}</b></span
                                ><span
                                  >Student demand <b>{number(currentProfile.demand.transport.studentDemand)}</b></span
                                ><span
                                  >Elderly demand <b>{number(currentProfile.demand.transport.elderlyDemand)}</b></span
                                ><span
                                  >Care transfers <b>{number(currentProfile.demand.transport.careTransferDemand)}</b
                                  ></span
                                ><span
                                  >Education transfers <b
                                    >{number(currentProfile.demand.transport.educationTransferDemand)}</b
                                  ></span
                                ><span
                                  >Average stop load <b>{percentage(currentProfile.demand.transport.averageLoad)}</b
                                  ></span
                                ><span>Transport score <b>{percentage(currentProfile.demand.transport.score)}</b></span
                                ><span
                                  >Marine load <b
                                    >{percentage(currentProfile.demand.transport.modes.marine.averageLoad)}</b
                                  ></span
                                ><span
                                  >Air load <b>{percentage(currentProfile.demand.transport.modes.air.averageLoad)}</b
                                  ></span
                                ><span>Stops <b>{currentProfile.demand.transport.stops.length}</b></span>
                              </div>
                              <div class="hub-list">
                                <div class="hub-row vehicle-hub-row">
                                  <div class="hub-row-main">
                                    <div class="hub-row-heading">
                                      <span class="hub-mode-icon" aria-hidden="true"
                                        ><Car size={13} strokeWidth={2.2} /></span
                                      >
                                      <span class="hub-row-copy">
                                        <b>Vehicle registrations</b>
                                        <small>Road · registration-based proxy</small>
                                      </span>
                                    </div>
                                    <div
                                      class="hub-load-bar"
                                      role="img"
                                      aria-label={`${percentage(vehicleIntensity)} registration-based vehicle intensity`}
                                    >
                                      <div class="hub-load-fill" style={`width: ${vehicleIntensity ?? 0}%`}>
                                        <span class="hub-load-local" style="width: 100%"></span>
                                      </div>
                                    </div>
                                    <div class="hub-load-legend">
                                      <span
                                        ><i class="hub-dot hub-dot-vehicle"></i>{number(
                                          currentProfile.sustainability.vehicleTotal
                                        )} registered</span
                                      >
                                      <span
                                        ><i class="hub-dot hub-dot-vehicle-density"></i>{decimal(
                                          currentProfile.sustainability.vehiclesPerThousandPopulation
                                        )} / 1,000 residents</span
                                      >
                                    </div>
                                  </div>
                                  <div
                                    class="hub-row-values"
                                    aria-label={`${percentage(vehicleIntensity)} registration-based vehicle intensity`}
                                  >
                                    <strong>{percentage(vehicleIntensity)}</strong>
                                  </div>
                                </div>
                                {#each currentProfile.demand.transport.stops as stop (stop.stopId)}
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
                                          <small
                                            >{titleCase(stop.mode)} · {stop.connectedIslandIds.length} islands</small
                                          >
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
                                        <span
                                          ><i class="hub-dot hub-dot-local"></i>{number(stop.localDemand)} local</span
                                        >
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
                                {:else}
                                  <p class="empty-state">No transport stop load is available.</p>
                                {/each}
                              </div>
                            {:else}
                              <div class="collapsed-summary transport-summary">
                                <span>Score <b>{percentage(currentProfile.demand.transport.score)}</b></span>
                                <span
                                  >Average stop load <b>{percentage(currentProfile.demand.transport.averageLoad)}</b
                                  ></span
                                >
                                <span>Stops <b>{currentProfile.demand.transport.stops.length}</b></span>
                              </div>
                              <div class="collapsed-hub-list">
                                {#each currentProfile.demand.transport.stops.slice(0, 2) as stop (stop.stopId)}
                                  {@const loadPercent = Math.min(100, Math.max(0, stop.loadRatio * 100))}
                                  <div class="collapsed-hub-row">
                                    <span class="collapsed-hub-copy">
                                      <b>{stop.stopName ?? titleCase(stop.subtype)}</b>
                                      <small>{titleCase(stop.mode)} · {stop.connectedIslandIds.length} islands</small>
                                    </span>
                                    <strong>{percentage(loadPercent)}</strong>
                                  </div>
                                {:else}
                                  <p class="empty-state">No transport stop load is available.</p>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        </Card.Root>
                      </div>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
                <Accordion.Root type="single" class="analytics-disclosure-root">
                  <Accordion.Item value="pollution" class="model-disclosure">
                    <Accordion.Trigger class="analytics-disclosure-trigger"
                      ><span class="disclosure-copy"
                        >Pollution &amp; vehicles <span>Pressure factors and registration breakdown</span></span
                      ></Accordion.Trigger
                    >
                    <Accordion.Content class="analytics-disclosure-content">
                      <Card.Root class="insight-card sustainability-card" size="sm">
                        <div class="card-heading">
                          <div>
                            <h3>Pollution pressure</h3>
                          </div>
                          <strong class="card-heading-score">{percentage(currentProfile.sustainability.score)}</strong>
                        </div>
                        <div class="sustainability-metrics">
                          <span>Vehicles <b>{number(currentProfile.sustainability.vehicleTotal)}</b></span>
                        </div>
                        <div class="sustainability-factors">
                          <div class="sustainability-factor sustainability-benefit-factor">
                            <div class="sustainability-factor-heading">
                              <span>Public transport benefit</span>
                              <strong
                                >{signedPercentage(
                                  publicTransportBenefitPercent(currentProfile.sustainability)
                                )}</strong
                              >
                            </div>
                            <Progress
                              value={publicTransportBenefitProgress(currentProfile.sustainability)}
                              max={100}
                              aria-label="Public transport benefit relative to private vehicle pressure"
                            />
                            <small class="sustainability-factor-note"
                              >{decimal(currentProfile.sustainability.publicTransportBenefit)} pressure units avoided</small
                            >
                          </div>
                          {#each SUSTAINABILITY_FACTORS as factor (factor.key)}
                            <div class="sustainability-factor">
                              <div class="sustainability-factor-heading">
                                <span>{factor.label}</span>
                                <strong
                                  >{signedPercentage(
                                    factorContribution(currentProfile.sustainability, factor.key)
                                  )}</strong
                                >
                              </div>
                              <Progress
                                value={factorProgress(currentProfile.sustainability, factor.key)}
                                max={100}
                                aria-label={`${factor.label} net pressure effect`}
                              />
                            </div>
                          {/each}
                        </div>
                        <div class="vehicle-category-list">
                          {#each currentProfile.sustainability.vehicleCategoryBreakdown as category (category.category)}
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
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion.Root>
                <Card.Root class="insight-card inbound-sources-card" size="sm">
                  <div class="card-heading">
                    <div>
                      <h3>Highest inbound demand from</h3>
                    </div>
                    {#if island.demand.inboundSources.length > 2}
                      <div class="card-heading-actions">
                        <Badge variant="outline">{island.demand.inboundSources.length}</Badge>
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
                    {#each inboundDemandExpanded ? island.demand.inboundSources : island.demand.inboundSources.slice(0, 2) as source (source.originIslandId)}
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
                <p class="analytics-state" role="status">Detailed model inputs are unavailable.</p>
              {/if}
            </Tabs.Content>
          </Tabs.Root>
        {/key}
      {:else}
        <p class="analytics-state" role="status">Select an island to explore its details.</p>
      {/if}
    </Card.Root>
  </div>
{/if}

<style>
  :global(.connection-map-link) {
    width: 100%;
    min-height: 2.5rem;
    justify-content: flex-start;
    gap: 0.55rem;
    padding: 0.65rem 0.8rem;
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
    white-space: normal;
    text-align: left;
  }

  :global(.connection-map-link svg) {
    flex: none;
  }

  .category-chart {
    margin-top: 1rem;
  }

  .score-highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 1rem;
    padding-top: 0.8rem;
    border-top: 1px solid var(--mobility-border);
  }

  .score-highlights > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.25rem 0.4rem;
  }

  .score-highlights span {
    grid-column: 1 / -1;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .score-highlights strong {
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    overflow-wrap: anywhere;
  }

  .score-highlights b {
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }

  .chart-note,
  .demand-model-note {
    margin: 0.85rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.55;
  }

  .demand-model-note {
    margin: 0.5rem 0.15rem 0;
  }

  .context-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 0.8rem;
  }

  .island-analytics-layer {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
  }

  .proposal-mode-right {
    transform: translateX(calc(100% + 2rem));
    opacity: 0;
    transition:
      transform var(--mobility-duration-enter) var(--mobility-ease),
      opacity var(--mobility-duration-fast) var(--mobility-ease);
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
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    box-shadow: var(--mobility-shadow-panel);
    pointer-events: auto;
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

  :global(.island-analytics-card .view-more-button) {
    border-color: var(--mobility-accent);
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
    font-size: var(--mobility-text-xs);
  }

  :global(.island-analytics-card .view-more-button:hover),
  :global(.island-analytics-card .view-more-button:focus-visible) {
    border-color: var(--mobility-accent-hover);
    background: var(--mobility-accent-hover);
    color: var(--mobility-on-accent);
  }

  .collapsed-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.75rem;
    margin-top: 0.7rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .collapsed-summary span {
    display: inline-flex;
    align-items: baseline;
    gap: 0.22rem;
  }

  .collapsed-summary b {
    color: var(--mobility-ink);
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
    border-top: 1px solid var(--mobility-border);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collapsed-hub-copy small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .collapsed-hub-row > strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }

  h2 {
    margin: 0;
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.045em;
    line-height: 1.15;
  }

  :global(.island-analytics-card .close-button) {
    display: grid;
    place-items: center;
    width: 2.45rem;
    height: 2.45rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    color: var(--mobility-ink);
  }

  :global(.island-analytics-card .insight-card) {
    margin-top: 0.8rem;
    padding: 0.85rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    box-shadow: var(--mobility-shadow-card);
  }

  h3 {
    margin: 0;
    font-size: var(--mobility-text-base);
    font-weight: var(--mobility-font-weight-semibold);
  }

  :global(.island-analytics-card [data-slot='badge']) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
    box-shadow: none;
    font-size: var(--mobility-text-xs);
  }

  .people-total {
    display: block;
    margin: 0;
    font-size: var(--mobility-text-xl);
    letter-spacing: -0.04em;
  }

  .employment-heading-total {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xl);
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .employment-assumption {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .employment-breakdown {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.7rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
  }

  .employment-category-heading strong,
  .employment-subcategory-list strong,
  .employment-balance-bars b {
    color: var(--mobility-ink);
    font-variant-numeric: tabular-nums;
  }

  :global(.employment-category [data-slot='progress']) {
    height: 0.3rem;
    background: var(--mobility-border);
  }

  :global(.employment-category [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
  }

  .employment-subcategory-list {
    display: grid;
    gap: 0.2rem;
    padding-left: 0.5rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .employment-balance-bars {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.7rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--mobility-border);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  :global(.employment-balance-bars [data-slot='progress']) {
    height: 0.3rem;
    margin-top: 0.25rem;
    background: var(--mobility-border);
  }

  :global(.employment-balance-bars [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
  }

  .employment-assumption {
    margin: 0.65rem 0 0;
  }

  :global(.sustainability-card) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
  }

  .card-heading-score {
    align-self: center;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-lg);
    font-weight: var(--mobility-font-weight-bold);
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .sustainability-metrics {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.7rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--mobility-border);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .sustainability-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sustainability-metrics b {
    color: var(--mobility-ink);
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
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
  }

  .sustainability-factor-heading strong,
  .vehicle-category-heading strong {
    color: var(--mobility-ink);
    font-variant-numeric: tabular-nums;
  }

  .sustainability-factor-note {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  :global(.sustainability-card [data-slot='progress']) {
    height: 0.32rem;
    background: var(--mobility-surface-muted);
  }

  :global(.sustainability-card .sustainability-factor [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
  }

  :global(.sustainability-card .vehicle-category-row [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
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
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-bold);
  }

  .population-topline b,
  .service-group-title b {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }

  :global(.population-row [data-slot='progress']) {
    height: 0.34rem;
    background: var(--mobility-border);
  }

  :global(.population-row [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
  }

  :global(.population-overlap [data-slot='progress']) {
    background: var(--mobility-surface-muted);
  }

  :global(.population-overlap [data-slot='progress-indicator']) {
    background: var(--mobility-chart-reference);
  }

  .population-row small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
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
    border-top: 1px solid var(--mobility-border);
  }

  .service-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .service-item {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface);
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .service-item b {
    color: var(--mobility-ink);
  }

  .empty-inline,
  .empty-state {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
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
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface-muted);
  }

  .connection-mode-icon,
  .connection-row-icon {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
  }

  .connection-mode-icon {
    grid-row: span 2;
  }

  .connection-mode strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    line-height: 1;
  }

  .connection-mode > span:last-child {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .connection-list {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--mobility-border);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connection-copy span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
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

  .demand-flow-grid .demand-heading {
    min-height: 2.25rem;
  }

  .demand-percentage {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-2xl);
    letter-spacing: -0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .demand-metrics {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .demand-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .demand-metrics b {
    color: var(--mobility-ink);
    font-variant-numeric: tabular-nums;
  }

  :global(.demand-card [data-slot='progress']) {
    height: 0.34rem;
    margin-top: 0.7rem;
    background: var(--mobility-border);
  }

  :global(.demand-card [data-slot='progress-indicator']) {
    background: var(--mobility-accent);
  }

  .hub-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--mobility-border);
  }

  .inbound-source-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--mobility-border);
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
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inbound-source-row small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .inbound-source-row > strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
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
    border-radius: var(--mobility-radius-small);
    background: var(--mobility-surface-muted);
    color: var(--mobility-ink);
  }

  .hub-row-copy {
    display: grid;
    min-width: 0;
    gap: 0.08rem;
  }

  .hub-row b {
    overflow: hidden;
    color: var(--mobility-ink);
    font-size: var(--mobility-text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hub-row-copy small,
  .hub-load-legend {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  .hub-load-bar {
    display: flex;
    overflow: hidden;
    width: 100%;
    height: 0.32rem;
    border-radius: 999px;
    background: var(--mobility-border);
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
    background: var(--mobility-accent);
  }

  .hub-load-linked {
    background: var(--mobility-chart-reference);
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
    background: var(--mobility-accent);
  }

  .hub-dot-linked {
    background: var(--mobility-chart-reference);
  }

  .hub-dot-vehicle {
    background: var(--mobility-accent);
  }

  .hub-dot-vehicle-density {
    background: var(--mobility-chart-reference);
  }

  .hub-dot-care {
    background: var(--mobility-chart-health);
  }

  .hub-dot-education {
    background: var(--mobility-chart-education);
  }

  .hub-row-values {
    display: grid;
    justify-items: end;
    gap: 0.05rem;
    min-width: 3.2rem;
  }

  .hub-row-values strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-lg);
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }

  .analytics-state {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }

  :global(.island-analytics-card [data-slot='skeleton']) {
    background-color: var(--mobility-surface-muted);
    background-image: linear-gradient(
      90deg,
      var(--mobility-surface-muted) 0%,
      var(--mobility-surface-soft) 50%,
      var(--mobility-surface-muted) 100%
    );
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

    .demand-grid {
      grid-template-columns: 1fr;
    }
  }

  :global(.island-analytics-card) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    color-scheme: light;
    box-shadow: var(--mobility-shadow-panel);
  }

  :global(.island-analytics-card .insight-card) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
    box-shadow: var(--mobility-shadow-card);
  }

  :global(.island-analytics-card h2),
  :global(.island-analytics-card h3),
  :global(.island-analytics-card .people-total),
  :global(.island-analytics-card .population-topline b),
  :global(.island-analytics-card .service-group-title b),
  :global(.island-analytics-card .service-item b),
  :global(.island-analytics-card .connection-copy b),
  :global(.island-analytics-card .demand-percentage),
  :global(.island-analytics-card .demand-metrics b),
  :global(.island-analytics-card .inbound-source-row b),
  :global(.island-analytics-card .inbound-source-row > strong),
  :global(.island-analytics-card .hub-row b),
  :global(.island-analytics-card .hub-row-values strong) {
    color: var(--mobility-ink);
  }

  :global(.island-analytics-card .card-heading > div > p),
  :global(.island-analytics-card .population-row small),
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
    color: var(--mobility-muted);
  }

  :global(.island-analytics-card .close-button) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface);
    color: var(--mobility-accent);
  }

  :global(.island-analytics-card .close-button:hover),
  :global(.island-analytics-card .close-button:focus-visible) {
    border-color: var(--mobility-accent-hover);
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }

  :global(.island-analytics-card [data-slot='progress']) {
    background: var(--mobility-surface-muted);
  }

  :global(.island-analytics-card [data-slot='progress-indicator']) {
    background: var(--driver-score-color, var(--mobility-accent));
  }

  :global(.island-analytics-card .service-group),
  :global(.island-analytics-card .connection-list),
  :global(.island-analytics-card .hub-list),
  :global(.island-analytics-card .inbound-source-list) {
    border-color: var(--mobility-border);
  }

  :global(.island-analytics-card .service-item),
  :global(.island-analytics-card .connection-mode) {
    border-color: var(--mobility-border);
    background: var(--mobility-surface-muted);
  }

  :global(.island-analytics-card .connection-mode-icon),
  :global(.island-analytics-card .connection-row-icon),
  :global(.island-analytics-card .hub-mode-icon) {
    background: var(--mobility-accent-soft);
    color: var(--mobility-accent);
  }

  :global(.island-analytics-card .hub-load-bar) {
    background: var(--mobility-surface-muted);
  }

  :global(.island-analytics-card .hub-load-local),
  :global(.island-analytics-card .hub-dot-local) {
    background: var(--mobility-accent);
  }

  .analytics-heading {
    position: relative;
    padding: 1rem 3.1rem 0.75rem 1rem;
    flex: none;
  }
  .analytics-identity {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .analytics-identity-copy {
    min-width: 0;
  }
  .analytics-eyebrow {
    display: block;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 0.3rem;
  }
  .analytics-identity h2 {
    font-size: var(--mobility-text-lg);
    letter-spacing: -0.035em;
    overflow-wrap: anywhere;
  }
  .analytics-identity p {
    margin: 0.3rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  :global(.island-analytics-card .close-button) {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    width: 2rem;
    height: 2rem;
  }
  :global(.island-analytics-tabs) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    overflow: hidden;
  }
  :global(.island-analytics-tabs .analytics-tab-list) {
    display: grid;
    flex: none;
    grid-template-columns: 0.75fr 1.25fr 1fr;
    width: calc(100% - 2rem);
    height: 2.35rem;
    margin: 0 1rem 0.5rem;
    padding: 0.2rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  :global(.analytics-tab-list [data-slot='tabs-trigger']) {
    min-width: 0;
    height: 100%;
    padding: 0.35rem 0.4rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    border-radius: calc(var(--mobility-radius-control) - 3px);
    transition:
      color 140ms ease,
      background-color 140ms ease,
      box-shadow 140ms ease;
  }
  :global(.analytics-tab-list [data-slot='tabs-trigger'][data-state='active']),
  :global(.analytics-tab-list [data-slot='tabs-trigger'][data-active]) {
    color: var(--mobility-ink);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-card);
  }
  :global(.island-analytics-tabs .analytics-tab-panel) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 1rem 1rem;
    scrollbar-color: color-mix(in srgb, var(--mobility-muted) 35%, transparent) transparent;
    scrollbar-width: thin;
  }
  :global(.analytics-tab-panel > .insight-card:first-child) {
    margin-top: 0.2rem;
  }
  :global(.island-analytics-card .insight-card) {
    box-shadow: none;
  }
  .access-highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 0.9rem 0 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--mobility-border);
  }
  .access-highlights > div {
    display: grid;
    align-content: start;
    gap: 0.3rem;
    min-width: 0;
  }
  .access-highlights span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
  }
  .access-highlights strong {
    color: var(--mobility-ink);
    font-size: clamp(var(--mobility-text-xl), 2.2vw, var(--mobility-text-2xl));
    font-weight: var(--mobility-font-weight-bold);
    line-height: 1.1;
    letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .access-highlights small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .access-mode-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.85rem;
  }
  .access-mode-grid > div {
    display: grid;
    gap: 0.25rem;
  }
  .access-mode-grid > div + div {
    border-left: 1px solid var(--mobility-border);
    padding-left: 0.65rem;
  }
  .access-mode-grid span {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .access-mode-grid strong {
    color: var(--mobility-ink);
    font-size: var(--mobility-text-lg);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
  }
  .access-mode-grid small,
  .access-link-total,
  .transport-link-summary {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .transport-link-summary {
    margin: 0.75rem 0 0;
    line-height: 1.5;
  }
  :global(.transport-access-overview .connection-map-link) {
    margin-top: 0.8rem;
    min-height: 2.15rem;
    font-size: var(--mobility-text-xs);
  }
  :global(.model-disclosure) {
    margin-top: 0.8rem;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    overflow: clip;
  }

  :global(.model-disclosure .insight-card) {
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  :global(.model-disclosure) .demand-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  :global(.model-disclosure) .demand-model-note {
    padding: 0 0.85rem 0.85rem;
    margin: 0;
  }
  .analytics-loading {
    display: grid;
    gap: 1rem;
    padding: 0 1rem 1rem;
  }
  .analytics-loading-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  :global(.analytics-loading-tabs) {
    height: 2.35rem;
  }
  :global(.analytics-loading-stats [data-slot='skeleton']) {
    height: 5rem;
  }
  :global(.analytics-loading-chart) {
    height: 9rem;
  }
  .analytics-state {
    margin: 0;
    padding: 0.85rem 1rem 1rem;
    line-height: 1.6;
  }
  @media (max-width: 640px) {
    .analytics-heading {
      padding-left: 0.85rem;
    }
    .analytics-identity {
      gap: 0.5rem;
    }
    .analytics-identity h2 {
      font-size: var(--mobility-text-lg);
    }
    :global(.analytics-tab-list [data-slot='tabs-trigger']) {
      font-size: var(--mobility-text-xs);
      padding-inline: 0.25rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.analytics-tab-list [data-slot='tabs-trigger']) {
      transition: none;
    }
  }

  .health-fallback-note {
    margin: -0.25rem 0 0.85rem;
  }
  :global(.analytics-disclosure-root .analytics-disclosure-trigger) {
    width: 100%;
    padding: 0.85rem;
    border-radius: var(--mobility-radius-control);
    color: var(--mobility-ink);
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.5;
    text-decoration: none;
    transition:
      color 140ms ease,
      background-color 140ms ease;
  }
  :global(.analytics-disclosure-root .analytics-disclosure-trigger:hover) {
    background: var(--mobility-surface-muted);
    text-decoration: none;
  }
  :global(.analytics-disclosure-root .detail-disclosure) {
    margin-top: 0.65rem;
    border: 0;
  }
  :global(.detail-disclosure .analytics-disclosure-trigger) {
    padding: 0.4rem 0;
  }
  :global(.analytics-disclosure-content) {
    padding-bottom: 0;
  }
  .disclosure-copy {
    display: block;
  }
  .disclosure-copy > span {
    display: block;
    margin-top: 0.2rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.analytics-disclosure-root .analytics-disclosure-trigger) {
      transition: none;
    }
    :global(.island-analytics-card [data-slot='accordion-content']) {
      animation: none;
    }
  }
</style>
