<script lang="ts">
  import type { IslandProfile } from './island-profile';
  import type { AnalyticsIsland } from './national-analytics-card.svelte';

  import Bus from '@lucide/svelte/icons/bus';
  import Plane from '@lucide/svelte/icons/plane';
  import Route from '@lucide/svelte/icons/route';
  import Ship from '@lucide/svelte/icons/ship';
  import X from '@lucide/svelte/icons/x';
  import { prefersReducedMotion } from 'svelte/motion';
  import { fly } from 'svelte/transition';

  import { Badge } from '$components/ui/badge';
  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';
  import { Progress } from '$components/ui/progress';
  import { Skeleton } from '$components/ui/skeleton';

  type Props = {
    open?: boolean;
    island: AnalyticsIsland | null;
    profile: IslandProfile | null;
    loading?: boolean;
    error?: string | null;
    onClose?: () => void;
  };
  let {
    open = $bindable(false),
    island,
    profile,
    loading = false,
    error = null,
    onClose = () => (open = false)
  }: Props = $props();

  const drivers = [
    { key: 'health', label: 'Health', note: 'Population-weighted health access' },
    { key: 'education', label: 'Education', note: 'Population-weighted school access' },
    { key: 'transport', label: 'Transport', note: 'Land, marine, and air connections' },
    { key: 'crowdedness', label: 'Crowdedness', note: 'Population density pressure' },
    { key: 'demand', label: 'Service demand', note: 'Combined local and inbound demand pressure' }
  ] as const;

  function percentage(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : `${Math.round(value)}%`;
  }
  function number(value: number | null | undefined): string {
    return value === null || value === undefined ? 'N/A' : Math.round(value).toLocaleString();
  }
  function driverScore(key: (typeof drivers)[number]['key']): number | null {
    if (!island) return null;
    if (key === 'demand') return island.demand.score;
    if (key === 'crowdedness') return island.crowdedness.score;
    return island[key].score;
  }
  function coverage(key: (typeof drivers)[number]['key']): number {
    if (!island) return 0;
    if (key === 'health') return island.health.coverageRatio;
    if (key === 'education') return island.education.coverageRatio;
    if (key === 'transport') return island.transport.coverageRatio;
    if (key === 'demand') return island.demand.coverageRatio;
    return 0;
  }
  function titleCase(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
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
    class="island-analytics-layer"
    in:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 260 }}
    out:fly={{ x: prefersReducedMotion.current ? 0 : 360, duration: prefersReducedMotion.current ? 0 : 200 }}
  >
    <Card.Root class="island-analytics-card" role="dialog" aria-label="Island score analytics">
      <div class="analytics-scroll">
        <div class="analytics-heading">
          <div>
            <h2>
              {island?.overall.score === null || island?.overall.score === undefined
                ? 'Why is this score unavailable?'
                : `Why ${Math.round(island.overall.score)}%?`}
            </h2>
          </div>
          <Button class="close-button" variant="ghost" size="icon" aria-label="Close island analytics" onclick={onClose}
            ><X size={18} strokeWidth={2.2} /></Button
          >
        </div>

        {#if loading}
          <Card.Root class="insight-card" size="sm"
            ><Skeleton class="loading-heading" /><Skeleton
              class="loading-copy"
            />{#each drivers as driver (driver.key)}<div class="loading-row">
                <Skeleton class="loading-label" /><Skeleton class="loading-progress" />
              </div>{/each}</Card.Root
          >
        {:else if error}
          <p class="analytics-state" role="alert">{error}</p>
        {:else if island}
          <Card.Root class="insight-card" size="sm">
            <div class="card-heading">
              <div>
                <h3>Score drivers</h3>
              </div>
              <Badge class="status-badge" variant="outline">{island.overall.status}</Badge>
            </div>
            <div class="driver-list">
              {#each drivers as driver (driver.key)}
                {@const value = driverScore(driver.key)}
                <div class="driver-row">
                  <div class="driver-topline">
                    <span>{driver.label}</span><Badge class="driver-badge" variant="outline">{percentage(value)}</Badge>
                  </div>
                  <Progress value={value ?? 0} max={100} aria-label={`${driver.label} score`} /><small
                    >{driver.note}{driver.key !== 'demand'
                      ? ` - ${Math.round(coverage(driver.key) * 100)}% coverage`
                      : ` - ${number(island.demand.inboundTotal)} inbound · ${number(island.demand.outboundTotal)} outbound`}</small
                  >
                </div>
              {/each}
            </div>
          </Card.Root>

          {#if profile}
            <Card.Root class="insight-card population-panel" size="sm">
              <div class="card-heading">
                <div>
                  <h3>Population</h3>
                </div>
                <strong class="people-total">{number(profile.population.total)}</strong>
              </div>
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
                    <h3>Transport access</h3>
                  </div>
                </div>
                <div class="stat-list">
                  <span>Land access <b>{percentage(profile.transportAccess.land.score)}</b></span><span
                    >Marine access <b>{percentage(profile.transportAccess.marine.score)}</b></span
                  ><span>Air access <b>{percentage(profile.transportAccess.air.score)}</b></span>
                </div>
              </Card.Root>
            </div>

            <Card.Root class="insight-card connections-panel" size="sm">
              <div class="card-heading">
                <div>
                  <h3>Available connections</h3>
                </div>
                <Badge variant="outline">{profile.connections.direct.length}</Badge>
              </div>
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
                      <span>{titleCase(connection.type)}{connection.routeName ? ` · ${connection.routeName}` : ''}</span
                      >
                    </div>
                  </div>
                {:else}
                  <p class="empty-state">No mapped transport connections.</p>
                {/each}
              </div>
            </Card.Root>

            <div class="demand-grid">
              <Card.Root class="insight-card demand-card" size="sm">
                <div class="card-heading">
                  <div>
                    <h3>Health demand</h3>
                  </div>
                </div>
                <div class="demand-main">
                  <strong>{percentage(profile.demand.health.demand.demandPercent)}</strong>
                  <span>service demand</span>
                </div>
                <div class="demand-metrics">
                  <span>Local demand <b>{number(profile.demand.health.demand.local)}</b></span><span
                    >Inbound demand <b>{number(profile.demand.health.demand.inbound)}</b></span
                  ><span>Outbound demand <b>{number(profile.demand.health.demand.outbound)}</b></span><span
                    >Hospital demand <b>{percentage(profile.demand.health.hospitalDemand?.demandPercent ?? null)}</b
                    ></span
                  ><span>Child care demand <b>{number(profile.demand.health.childCareDemand?.combined)}</b></span><span
                    >Elderly hospital outbound <b>{number(profile.demand.health.elderlyCareDemand?.outbound)}</b></span
                  ><span>Elderly care unserved <b>{number(profile.demand.health.elderlyCareDemand?.unserved)}</b></span
                  ><span>Population basis <b>{number(profile.demand.health.populationBasis)}</b></span>
                </div>
                <Progress
                  value={profile.demand.health.demand.demandPercent ?? 0}
                  max={100}
                  aria-label="Health service demand percentage"
                />
              </Card.Root>

              <Card.Root class="insight-card demand-card" size="sm">
                <div class="card-heading">
                  <div>
                    <h3>Education demand</h3>
                  </div>
                </div>
                <div class="demand-main">
                  <strong>{percentage(profile.demand.education.demand.demandPercent)}</strong>
                  <span>service demand</span>
                </div>
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

              <Card.Root class="insight-card demand-card transport-demand-card" size="sm">
                <div class="card-heading">
                  <div>
                    <h3>Transport load</h3>
                  </div>
                </div>
                <div class="demand-metrics transport-demand-metrics">
                  <span>Resident population <b>{number(profile.demand.transport.residentPopulation)}</b></span><span
                    >Inbound load <b>{number(profile.demand.transport.inboundPopulation)}</b></span
                  ><span>Outbound load <b>{number(profile.demand.transport.outboundPopulation)}</b></span><span
                    >Working demand <b>{number(profile.demand.transport.workingDemand)}</b></span
                  ><span>Student demand <b>{number(profile.demand.transport.studentDemand)}</b></span><span
                    >Elderly demand <b>{number(profile.demand.transport.elderlyDemand)}</b></span
                  ><span>Care transfers <b>{number(profile.demand.transport.careTransferDemand)}</b></span><span
                    >Average stop load <b>{percentage(profile.demand.transport.averageLoad)}</b></span
                  ><span>Transport score <b>{percentage(profile.demand.transport.score)}</b></span><span
                    >Marine load <b>{percentage(profile.demand.transport.modes.marine.averageLoad)}</b></span
                  ><span>Air load <b>{percentage(profile.demand.transport.modes.air.averageLoad)}</b></span><span
                    >Stops <b>{profile.demand.transport.stops.length}</b></span
                  >
                </div>
                <div class="hub-list">
                  {#each profile.demand.transport.stops as stop (stop.stopId)}
                    {@const Icon = connectionIcon(stop.mode === 'marine' ? 'ferry' : stop.mode)}
                    {@const routedDemand = stop.localDemand + stop.connectedDemand}
                    {@const localShare = routedDemand > 0 ? (stop.localDemand / routedDemand) * 100 : 0}
                    {@const loadPercent = Math.min(100, Math.max(0, stop.loadRatio * 100))}
                    <div class="hub-row">
                      <div class="hub-row-main">
                        <div class="hub-row-heading">
                          <span class="hub-mode-icon" aria-hidden="true"><Icon size={13} strokeWidth={2.2} /></span>
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
                          <span><i class="hub-dot hub-dot-linked"></i>{number(stop.connectedDemand)} linked</span>
                          {#if stop.careTransferDemand > 0}
                            <span><i class="hub-dot hub-dot-care"></i>{number(stop.careTransferDemand)} care</span>
                          {/if}
                        </div>
                      </div>
                      <div class="hub-row-values" aria-label={`${percentage(loadPercent)} capacity load`}>
                        <strong>{percentage(loadPercent)}</strong>
                        <small>capacity load</small>
                      </div>
                    </div>
                  {:else}
                    <p class="empty-state">No transport stop load is available.</p>
                  {/each}
                </div>
              </Card.Root>
            </div>

            <Card.Root class="insight-card inbound-sources-card" size="sm">
              <div class="card-heading">
                <div>
                  <h3>Highest inbound demand from</h3>
                </div>
                <Badge variant="outline">{island.demand.inboundSources.length}</Badge>
              </div>
              <div class="inbound-source-list">
                {#each island.demand.inboundSources as source (source.originIslandId)}
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
  :global(.island-analytics-card) {
    display: flex;
    flex-direction: column;
    width: min(31rem, calc(100vw - 2rem));
    height: min(47rem, calc(100dvh - 2rem));
    margin: 1rem;
    overflow: hidden;
    border: 1px solid rgb(16 24 32 / 14%);
    border-radius: 0.55rem;
    background: #fff;
    color: #101820;
    box-shadow: 0 0.7rem 2.2rem rgb(16 24 32 / 16%);
    pointer-events: auto;
  }
  .analytics-scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
  }
  .analytics-heading,
  .card-heading,
  .driver-topline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
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
    border: 1px solid #c8d1cd;
    border-radius: 0.8rem;
    color: #263139;
  }
  :global(.insight-card) {
    margin-top: 0.8rem;
    padding: 0.72rem;
    border: 1px solid #dce3df;
    border-radius: 0.42rem;
    background: #fff;
    color: #101820;
    box-shadow: 0 0.2rem 0.7rem rgb(16 24 32 / 5%);
  }
  h3 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 800;
  }
  :global(.island-analytics-card [data-slot='badge']) {
    border-color: #d3ddd8;
    background: #f8faf9;
    color: #263139;
    box-shadow: none;
    font-size: 0.56rem;
  }
  :global(.island-analytics-card .status-badge),
  :global(.island-analytics-card .driver-badge) {
    border-color: #c4d4cc;
    background: #edf4f0;
    color: #315d4c;
    font-size: 0.56rem;
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
  .driver-topline span {
    font-size: 0.66rem;
    font-weight: 780;
  }
  :global(.driver-row [data-slot='progress']) {
    height: 0.38rem;
    background: #e4e6e5;
  }
  :global(.driver-row [data-slot='progress-indicator']) {
    background: #101820;
  }
  .driver-row small {
    color: #5d6260;
    font-size: 0.56rem;
    line-height: 1.25;
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
    color: #101820;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
  }
  :global(.population-row [data-slot='progress']) {
    height: 0.34rem;
    background: #e4e6e5;
  }
  :global(.population-row [data-slot='progress-indicator']) {
    background: #101820;
  }
  :global(.population-overlap [data-slot='progress']) {
    background: #eef1ef;
  }
  :global(.population-overlap [data-slot='progress-indicator']) {
    background: #97a39d;
  }
  .population-row small {
    color: #5d6260;
    font-size: 0.54rem;
  }
  .stat-list {
    display: grid;
    gap: 0.48rem;
    margin-top: 0.7rem;
    color: #5d6260;
    font-size: 0.59rem;
  }
  .stat-list span {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .stat-list b {
    color: #101820;
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
    border-top: 1px solid #e7ebe9;
  }
  .service-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .service-item {
    padding: 0.3rem 0.4rem;
    border: 1px solid #e0e5e2;
    border-radius: 0.35rem;
    background: #fff;
    color: #53606a;
    font-size: 0.56rem;
  }
  .service-item b {
    color: #101820;
  }
  .empty-inline,
  .empty-state {
    color: #5d6260;
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
    border: 1px solid #e0e5e2;
    border-radius: 0.35rem;
    background: #f8faf9;
  }
  .connection-mode-icon,
  .connection-row-icon {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 0.35rem;
    background: #e6ece9;
    color: #101820;
  }
  .connection-mode-icon {
    grid-row: span 2;
  }
  .connection-mode strong {
    color: #101820;
    font-size: 0.72rem;
    line-height: 1;
  }
  .connection-mode > span:last-child {
    color: #53606a;
    font-size: 0.52rem;
  }
  .connection-list {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e7ebe9;
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
    color: #101820;
    font-size: 0.64rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .connection-copy span {
    color: #5d6260;
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
  .demand-main {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }
  .demand-main strong {
    color: #101820;
    font-size: 1.35rem;
    letter-spacing: -0.04em;
  }
  .demand-main span {
    color: #5d6260;
    font-size: 0.55rem;
  }
  .demand-metrics {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.65rem;
    color: #5d6260;
    font-size: 0.58rem;
  }
  .demand-metrics span {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .demand-metrics b {
    color: #101820;
    font-variant-numeric: tabular-nums;
  }
  :global(.demand-card [data-slot='progress']) {
    height: 0.34rem;
    margin-top: 0.7rem;
    background: #e4e6e5;
  }
  :global(.demand-card [data-slot='progress-indicator']) {
    background: #101820;
  }
  .hub-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e7ebe9;
  }
  .inbound-source-list {
    display: grid;
    gap: 0.4rem;
    margin-top: 0.7rem;
    padding-top: 0.55rem;
    border-top: 1px solid #e7ebe9;
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
    color: #101820;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .inbound-source-row small {
    color: #5d6260;
    font-size: 0.54rem;
  }
  .inbound-source-row > strong {
    color: #101820;
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
    background: #e7efeb;
    color: #315d4c;
  }
  .hub-row-copy {
    display: grid;
    min-width: 0;
    gap: 0.08rem;
  }
  .hub-row b {
    overflow: hidden;
    color: #101820;
    font-size: 0.6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hub-row-copy small,
  .hub-load-legend,
  .hub-row-values small {
    color: #5d6260;
    font-size: 0.54rem;
  }
  .hub-load-bar {
    display: flex;
    overflow: hidden;
    width: 100%;
    height: 0.32rem;
    border-radius: 999px;
    background: #e7ebe9;
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
    background: #101820;
  }
  .hub-load-linked {
    background: #9bb3a7;
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
    background: #101820;
  }
  .hub-dot-linked {
    background: #9bb3a7;
  }
  .hub-dot-care {
    background: #c69a5c;
  }
  .hub-row-values {
    display: grid;
    justify-items: end;
    gap: 0.05rem;
    min-width: 3.2rem;
  }
  .hub-row-values strong {
    color: #101820;
    font-size: 1rem;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .analytics-state {
    color: #5d6260;
    font-size: 0.65rem;
  }
  :global(.loading-heading) {
    width: 8rem;
    height: 0.8rem;
  }
  :global(.loading-copy) {
    width: 12rem;
    height: 0.5rem;
    margin-top: 0.4rem;
  }
  .loading-row {
    display: grid;
    gap: 0.3rem;
    margin-top: 0.8rem;
  }
  :global(.loading-label) {
    width: 6rem;
    height: 0.55rem;
  }
  :global(.loading-progress) {
    width: 100%;
    height: 0.38rem;
  }
  :global(.island-analytics-card [data-slot='skeleton']) {
    background-color: #e9ecea;
    background-image: linear-gradient(90deg, #e9ecea 0%, #f8f9f8 50%, #e9ecea 100%);
    background-size: 200% 100%;
  }
  @media (max-width: 640px) {
    .island-analytics-layer {
      align-items: flex-end;
    }
    :global(.island-analytics-card) {
      width: calc(100vw - 1rem);
      height: min(42rem, calc(100dvh - 1rem));
      margin: 0.5rem;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
    .demand-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
