<script lang="ts">
  import type { IslandProfile } from './island-profile';
  import type { AnalyticsIsland } from './national-analytics-card.svelte';
  import type { PresentationStep } from './presentation-story';

  import { Button } from '$components/ui/button';

  import PresentationIslandCharts from './presentation-island-charts.svelte';
  import PresentationJourneyChart from './presentation-journey-chart.svelte';
  import { PRESENTATION_STEPS, presentationEvidenceIslandId } from './presentation-story';

  type Props = {
    step: PresentationStep;
    profile: IslandProfile | null;
    island?: AnalyticsIsland | null;
    loading: boolean;
    error: string | null;
    patientElapsedSeconds: number;
    staffElapsedSeconds: number | null;
    timingIncomplete?: boolean;
    patientTimingIncomplete?: boolean;
    staffTimingIncomplete?: boolean;
    patientTimingLabel?: string;
    staffTimingLabel?: string;
    patientTimingNote?: string | null;
    staffTimingNote?: string | null;
    journeyProgress?: number;
    travelling?: boolean;
  };

  let {
    step,
    profile,
    island = null,
    loading,
    error,
    patientElapsedSeconds,
    staffElapsedSeconds,
    timingIncomplete = false,
    patientTimingIncomplete,
    staffTimingIncomplete,
    patientTimingLabel,
    staffTimingLabel,
    patientTimingNote,
    staffTimingNote,
    journeyProgress = 0,
    travelling = false
  }: Props = $props();

  const uid = $props.id();
  let detailView = $state<'island' | 'journey'>('island');
  const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  const ferryWait = PRESENTATION_STEPS.find((item) => item.id === 'wait-dhihdhoo')?.timing?.patient;
  const busWait = PRESENTATION_STEPS.find((item) => item.id === 'staff-wait-for-bus')?.timing?.staff;
  let expectedIslandId = $derived(presentationEvidenceIslandId(step));
  let matchingProfile = $derived(profile?.island.id === expectedIslandId ? profile : null);
  let matchingIsland = $derived(island?.id === expectedIslandId ? island : null);
  let hospitalDemand = $derived(matchingProfile?.demand.health.hospitalDemand ?? null);
  let medicalDemand = $derived(
    knownDemand(
      hospitalDemand?.outbound ??
        matchingProfile?.demand.health.outboundDemand ??
        matchingProfile?.demand.health.demand.outbound
    )
  );
  let educationDemand = $derived(
    knownDemand(matchingProfile?.demand.education.outboundDemand ?? matchingProfile?.demand.education.demand.outbound)
  );
  let wait = $derived(staffElapsedSeconds === null ? ferryWait : busWait);
  let currentWait = $derived(step.id === 'wait-dhihdhoo' || step.id === 'staff-wait-for-bus');
  let patientClock = $derived(clockValue(patientElapsedSeconds));
  let staffClock = $derived(staffElapsedSeconds === null ? null : clockValue(staffElapsedSeconds));
  let patientIncomplete = $derived(patientTimingIncomplete ?? timingIncomplete);
  let staffIncomplete = $derived(staffTimingIncomplete ?? timingIncomplete);
  let legProgress = $derived(Number.isFinite(journeyProgress) ? Math.max(0, Math.min(1, journeyProgress)) : 0);
  let stepNumber = $derived(PRESENTATION_STEPS.findIndex((item) => item.id === step.id) + 1);
  let overall = $derived(knownDemand(matchingIsland?.overall.score));

  function knownDemand(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  function waitDuration(seconds: number | null | undefined): string {
    if (knownDemand(seconds) === null || seconds === null || seconds === undefined) return 'Unknown';
    const minutes = Math.round(seconds / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  }

  function clockValue(
    value: number
  ): { hours: string; minutes: string; seconds: string; spoken: string; total: number } | null {
    if (!Number.isFinite(value) || value < 0) return null;
    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
      spoken: `${hours} hours, ${minutes} minutes, ${seconds} seconds`,
      total
    };
  }
</script>

{#snippet clockDigits(value: ReturnType<typeof clockValue>, incomplete: boolean, label: string)}
  {#if value}
    <time
      datetime={`PT${value.total}S`}
      class="clock-digits"
      aria-label={`${label}: ${incomplete ? 'illustrative subtotal ' : ''}${value.spoken}${incomplete ? ', plus unrecorded time' : ''}`}
      aria-live="off"
    >
      <span>{value.hours}<small>h</small></span><span>{value.minutes}<small>m</small></span><span
        >{value.seconds}<small>s</small></span
      >
      {#if incomplete}<sup aria-hidden="true">+</sup>{/if}
    </time>
  {:else}<span class="clock-unavailable">Timing unavailable</span>{/if}
{/snippet}

<aside class="presentation-story-panel" aria-labelledby={`${uid}-title`} data-presentation-story={step.id}>
  <header class="story-heading">
    <div class="heading-topline">
      <p class="story-eyebrow">{step.eyebrow}</p>
      <span class="scene-count">{stepNumber} / {PRESENTATION_STEPS.length}</span>
    </div>
    <h2 id={`${uid}-title`} title={step.title}>{step.title}</h2>
    <div class="island-context">
      <span
        >{step.journey?.arrivalIslandId ? 'Destination context' : 'Island context'}
        <strong>{matchingProfile?.island.name ?? matchingIsland?.name ?? 'Loading island…'}</strong
        >{#if matchingProfile}<span class="atoll"> · {matchingProfile.island.atollName}</span>{/if}</span
      >
      {#if overall !== null}<span class="overall-score"><strong>{Math.round(overall)}%</strong> index</span>{/if}
    </div>
  </header>

  <section
    class="story-highlights"
    aria-label="Highlighted outbound demand and connection waiting time"
    aria-busy={loading}
  >
    <dl class="headline-stats">
      <div class="headline-stat medical" data-demand="medical">
        <dt>Outbound {hospitalDemand ? 'hospital' : 'health'} demand</dt>
        <dd>{medicalDemand === null ? '—' : numberFormat.format(medicalDemand)}</dd>
        <span>Modeled allocations</span>
      </div>
      <div class="headline-stat education" data-demand="education">
        <dt>Outbound education demand</dt>
        <dd>{educationDemand === null ? '—' : numberFormat.format(educationDemand)}</dd>
        <span>Modeled allocations</span>
      </div>
      <div class="headline-stat waiting" class:current-wait={currentWait}>
        <dt>{staffElapsedSeconds === null ? 'Story connection wait' : 'Pickup bus wait'}</dt>
        <dd>{wait?.basis === 'estimate' ? '≈' : ''}{waitDuration(wait?.seconds)}</dd>
        <span>{staffElapsedSeconds === null ? 'Dhihdhoo · timetable gap' : 'R9 · retained example'}</span>
      </div>
    </dl>
  </section>

  <div class="detail-views" aria-label="Presentation details">
    <Button
      variant={detailView === 'island' ? 'default' : 'ghost'}
      size="sm"
      aria-pressed={detailView === 'island'}
      onclick={() => (detailView = 'island')}>Island details</Button
    >
    <Button
      variant={detailView === 'journey' ? 'default' : 'ghost'}
      size="sm"
      aria-pressed={detailView === 'journey'}
      onclick={() => (detailView = 'journey')}>Journey breakdown</Button
    >
  </div>

  <div class="presentation-details" data-view={detailView}>
    <section class="island-dashboard" aria-label="Fuller island context" aria-busy={loading}>
      {#if matchingProfile}
        <PresentationIslandCharts profile={matchingProfile} island={matchingIsland} />
      {:else if error}
        <p class="evidence-status evidence-error" role="status">{error}</p>
      {:else}
        <div class="dashboard-loading">
          <div></div>
          <div></div>
          <div></div>
          <div></div>
          <p class="evidence-status" role="status">
            {loading ? 'Loading island charts…' : 'Island details are unavailable for this scene.'}
          </p>
        </div>
      {/if}
    </section>

    <div class="journey-details">
      {#if step.facts.length}
        <dl class="journey-facts" aria-label="Current scene facts">
          {#each step.facts as fact (`${fact.label}:${fact.value}`)}<div data-tone={fact.tone ?? 'default'}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>{/each}
        </dl>
      {/if}

      <div class="journey-visual"><PresentationJourneyChart {step} progress={journeyProgress} /></div>
    </div>
  </div>

  <div class="journey-clocks" data-has-staff={staffElapsedSeconds !== null}>
    <section
      class="journey-clock"
      aria-label="Arriving from Baarah to Hulhumalé clock"
      data-testid="presentation-patient-clock"
      data-elapsed-seconds={patientClock?.total ?? ''}
      data-incomplete={patientIncomplete}
    >
      <div class="clock-heading">
        <span class="clock-dot" aria-hidden="true"></span>
        <h3>Arriving from Baarah to Hulhumalé</h3>
      </div>
      {@render clockDigits(patientClock, patientIncomplete, 'Arriving from Baarah to Hulhumalé elapsed')}
      <p class="clock-status" title={patientTimingLabel || undefined}>
        {patientTimingLabel || 'Illustrative elapsed journey time'}
      </p>
      {#if patientIncomplete}<p class="clock-note" title={patientTimingNote ?? undefined}>
          + Flight / pickup waits unconfirmed
        </p>{/if}
    </section>
    {#if staffElapsedSeconds !== null}
      <section
        class="journey-clock"
        aria-label="Airport pickup clock"
        data-testid="presentation-staff-clock"
        data-elapsed-seconds={staffClock?.total ?? ''}
        data-incomplete={staffIncomplete}
      >
        <div class="clock-heading">
          <span class="clock-dot clock-dot-staff" aria-hidden="true"></span>
          <h3>Airport pickup</h3>
        </div>
        {@render clockDigits(staffClock, staffIncomplete, 'Airport pickup elapsed')}
        <p class="clock-status" title={staffTimingLabel || undefined}>
          {staffTimingLabel || 'Airport pickup example'}
        </p>
        {#if staffIncomplete}<p class="clock-note" title={staffTimingNote ?? undefined}>
            + Pickup handoff unconfirmed
          </p>{/if}
      </section>
    {/if}
  </div>
  <footer class="story-footnote">
    <p>{step.note || 'Modeled demand allocations are not daily trips or unique residents.'}</p>
    <span>← → scenes · Esc exit</span>
  </footer>
  {#if travelling}<div
      class="journey-progress"
      role="progressbar"
      aria-label="Current journey leg"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(legProgress * 100)}
    >
      <span style:transform={`scaleX(${legProgress})`}></span>
    </div>{/if}
</aside>

<style>
  .presentation-story-panel {
    position: absolute;
    z-index: 20;
    top: 16px;
    right: 16px;
    bottom: 16px;
    width: clamp(460px, 44%, 760px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-panel);
    background: var(--mobility-surface);
    box-shadow: var(--mobility-shadow-panel);
    color: var(--mobility-ink);
    pointer-events: auto;
    animation: panel-enter var(--mobility-duration-enter) var(--mobility-ease) both;
  }
  .story-heading {
    flex: none;
  }
  .heading-topline {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .story-eyebrow {
    margin: 0 0 6px;
    color: var(--mobility-accent);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.4;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .scene-count {
    flex: none;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-variant-numeric: tabular-nums;
  }
  h2 {
    margin: 0;
    font-family: var(--mobility-font-heading);
    font-size: clamp(var(--mobility-text-xl), 1.4vw, var(--mobility-text-2xl));
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.25;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }
  .island-context {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .island-context strong {
    color: var(--mobility-ink);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .island-context > span > strong {
    margin-left: 5px;
  }
  .overall-score {
    flex: none;
  }
  .overall-score strong {
    font-size: var(--mobility-text-lg);
    font-variant-numeric: tabular-nums;
  }
  .story-highlights {
    flex: none;
  }
  .headline-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  .headline-stat {
    min-width: 0;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    padding: 8px 10px;
    background: var(--mobility-surface-soft);
  }
  .headline-stat dt {
    min-height: 28px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
    line-height: 1.35;
  }
  .headline-stat dd {
    margin: 5px 0 4px;
    font-family: var(--mobility-font-heading);
    font-size: clamp(var(--mobility-text-2xl), 1.8vw, var(--mobility-text-3xl));
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.055em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .headline-stat > span {
    display: block;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.35;
  }
  .medical {
    background: color-mix(in srgb, var(--mobility-chart-health) 8%, var(--mobility-surface));
    border-color: color-mix(in srgb, var(--mobility-chart-health) 28%, var(--mobility-border));
  }
  .medical dd {
    color: var(--mobility-ink);
  }
  .education {
    background: var(--mobility-accent-soft);
  }
  .education dd {
    color: var(--mobility-accent);
  }
  .waiting {
    background: var(--mobility-warning-soft);
    border-color: color-mix(in srgb, var(--mobility-chart-waiting) 30%, var(--mobility-border));
  }
  .waiting dd {
    color: var(--mobility-warning-ink);
  }
  .current-wait {
    border-color: var(--mobility-chart-waiting);
    box-shadow: inset 0 0 0 1px var(--mobility-chart-waiting);
  }
  .island-dashboard {
    flex: 1;
    min-height: 0;
    container-name: presentation-details;
    container-type: size;
  }
  .detail-views {
    display: none;
    flex: none;
    gap: 4px;
    padding: 3px;
    border-radius: var(--mobility-radius-control);
    background: var(--mobility-surface-muted);
  }
  .detail-views :global(button) {
    flex: 1;
    font-size: var(--mobility-text-xs);
  }
  .detail-views :global(button[aria-pressed='true']) {
    background: var(--mobility-accent);
    color: var(--mobility-on-accent);
  }
  .detail-views :global(button[aria-pressed='false']) {
    color: var(--mobility-ink);
  }
  .presentation-details {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }
  .journey-details {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 10px;
  }
  .dashboard-loading {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    min-height: 0;
  }
  .dashboard-loading > div {
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  .dashboard-loading p {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .evidence-status {
    margin: 0;
    padding: 20px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-sm);
    line-height: 1.5;
  }
  .evidence-error {
    color: var(--mobility-danger-ink);
  }
  .journey-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
    flex: none;
    padding: 8px 0;
    border-block: 1px solid var(--mobility-border);
  }
  .journey-facts > div {
    min-width: 0;
  }
  .journey-facts dt {
    margin-bottom: 4px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .journey-facts dd {
    margin: 0;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
    line-height: 1.45;
    text-wrap: pretty;
  }
  .journey-facts [data-tone='critical'] dd {
    color: var(--mobility-warning-ink);
    font-weight: var(--mobility-font-weight-semibold);
  }
  .journey-visual {
    flex: none;
  }
  .journey-clocks {
    flex: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface-muted);
  }
  .journey-clocks[data-has-staff='true'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .journey-clock {
    min-width: 0;
    padding: 8px 10px;
  }
  .journey-clock + .journey-clock {
    border-left: 1px solid var(--mobility-border);
  }
  .clock-heading {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .clock-heading h3 {
    margin: 0;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.4;
  }
  .clock-dot {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: var(--mobility-accent);
  }
  .clock-dot-staff {
    background: var(--mobility-chart-transfer);
  }
  .clock-digits {
    display: flex;
    align-items: baseline;
    gap: 9px;
    margin-top: 5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .clock-digits > span {
    font-family: var(--mobility-font-heading);
    font-size: clamp(var(--mobility-text-xl), 1.6vw, var(--mobility-text-2xl));
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.2;
    letter-spacing: -0.04em;
  }
  .clock-digits small {
    padding-left: 2px;
    color: var(--mobility-muted);
    font-family: var(--mobility-font-body);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
    letter-spacing: 0;
  }
  .clock-digits sup {
    align-self: flex-start;
    margin-left: -4px;
    font-size: var(--mobility-text-sm);
    line-height: 1.2;
  }
  .clock-status,
  .clock-note {
    margin: 5px 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .clock-note {
    color: var(--mobility-warning-ink);
  }
  .clock-unavailable {
    display: block;
    margin-top: 8px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .story-footnote {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex: none;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .story-footnote p {
    margin: 0;
  }
  .story-footnote > span {
    white-space: nowrap;
    font-size: var(--mobility-text-xs);
  }
  .journey-progress {
    position: absolute;
    bottom: 0;
    left: 16px;
    right: 16px;
    height: 2px;
    background: var(--mobility-border);
  }
  .journey-progress span {
    display: block;
    height: 100%;
    background: var(--mobility-accent);
    transform-origin: left;
    transition: transform 120ms linear;
  }
  @media (max-height: 800px) and (min-width: 701px) {
    .presentation-story-panel {
      gap: 8px;
      padding: 14px;
      top: 12px;
      bottom: 12px;
      right: 12px;
    }
    h2 {
      font-size: var(--mobility-text-xl);
    }
    .story-eyebrow {
      margin-bottom: 5px;
      font-size: var(--mobility-text-xs);
    }
    .island-context {
      margin-top: 6px;
    }
    .headline-stat {
      padding: 8px 10px;
    }
    .headline-stat dd {
      font-size: var(--mobility-text-2xl);
      margin: 3px 0;
    }
    .journey-facts {
      padding: 7px 0;
    }
    .journey-clock {
      padding: 8px 10px;
    }
    .clock-digits > span {
      font-size: var(--mobility-text-2xl);
    }
    .presentation-details,
    .journey-details {
      gap: 8px;
    }
  }
  @media (max-width: 700px) {
    .presentation-story-panel {
      top: auto;
      bottom: 12px;
      left: 12px;
      right: 12px;
      width: auto;
      height: min(90%, calc(100% - 140px));
      gap: 8px;
      padding: 12px;
    }
    h2 {
      font-size: var(--mobility-text-lg);
    }
    .story-eyebrow,
    .scene-count {
      font-size: var(--mobility-text-xs);
    }
    .story-eyebrow {
      margin-bottom: 4px;
    }
    .island-context {
      margin-top: 5px;
    }
    .atoll {
      display: none;
    }
    .headline-stat {
      padding: 7px 8px;
    }
    .headline-stat dd {
      font-size: var(--mobility-text-2xl);
    }
    .journey-facts {
      gap: 8px;
      padding: 6px 0;
    }
    .journey-clock {
      padding: 7px 10px;
    }
    .clock-digits > span {
      font-size: var(--mobility-text-xl);
    }
    .story-footnote > span {
      display: none;
    }
  }
  @media (max-width: 700px), (max-height: 700px) {
    .detail-views {
      display: flex;
    }
    .presentation-details[data-view='island'] .journey-details,
    .presentation-details[data-view='journey'] .island-dashboard {
      display: none;
    }
    .presentation-details,
    .journey-details {
      gap: 8px;
    }
    .journey-details {
      flex: 1;
      justify-content: center;
    }
    .clock-status {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .clock-note {
      margin-top: 3px;
    }
  }
  @media (max-height: 600px) {
    .presentation-story-panel {
      top: 8px;
      bottom: 8px;
      height: auto;
      gap: 6px;
      padding: 10px;
    }
    .story-eyebrow,
    .clock-status {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    h2 {
      overflow: hidden;
      font-size: var(--mobility-text-lg);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .island-context {
      margin-top: 4px;
    }
    .headline-stat {
      padding: 6px 8px;
    }
    .headline-stat dd,
    .clock-digits > span {
      font-size: var(--mobility-text-xl);
    }
    .journey-clock {
      padding: 6px 8px;
    }
    .detail-views :global(button) {
      height: 26px;
      min-height: 26px;
    }
  }
  @keyframes panel-enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .presentation-story-panel {
      animation: none;
    }
    .journey-progress span {
      transition: none;
    }
  }
</style>
