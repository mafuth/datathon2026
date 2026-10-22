<script lang="ts">
  import type { PresentationJourneyClock } from './presentation-journey-summary';
  import type { PresentationStep } from './presentation-story';

  import { PRESENTATION_JOURNEY_SEGMENTS, presentationJourneySummary } from './presentation-journey-summary';

  let { step, progress = 1 }: { step: PresentationStep; progress?: number } = $props();

  const uid = $props.id();
  const rows = (
    [
      {
        key: 'patient',
        label: 'Arriving from Baarah to Hulhumalé',
        total: 'patientTotalKnownSeconds',
        elapsed: 'patientElapsedSeconds'
      },
      { key: 'staff', label: 'Airport pickup', total: 'staffTotalKnownSeconds', elapsed: 'staffElapsedSeconds' }
    ] as const
  ).map((row) => {
    const segments = PRESENTATION_JOURNEY_SEGMENTS[row.key].map((segment) => ({
      ...segment,
      title: `${segment.label} · ${minutes(segment.seconds)} · ${segment.basis}`
    }));
    return {
      ...row,
      segments,
      description: segments
        .map((segment) => `${segment.label}: ${minutes(segment.seconds)}, ${segment.basis}`)
        .join('; ')
    };
  });
  let summary = $derived(presentationJourneySummary(step.id, progress));

  function minutes(seconds: number): string {
    if (seconds > 0 && seconds < 60) return `${Math.round(seconds)}s`;
    const rounded = Math.round(seconds / 60);
    return rounded >= 60 ? `${Math.floor(rounded / 60)}h ${rounded % 60}m` : `${rounded}m`;
  }

  function completedFraction(clock: PresentationJourneyClock): number {
    const total = clock === 'patient' ? summary.patientTotalKnownSeconds : summary.staffTotalKnownSeconds;
    const elapsed = clock === 'patient' ? summary.patientElapsedSeconds : (summary.staffElapsedSeconds ?? 0);
    return total > 0 ? Math.min(1, elapsed / total) : 0;
  }
</script>

<section class="journey-chain" aria-labelledby={`${uid}-title`}>
  <header>
    <h3 id={`${uid}-title`}>Where the time goes</h3>
    <span>Timetable + estimates</span>
  </header>
  <div class="chain-rows">
    {#each rows as row (row.key)}
      {@const total = summary[row.total]}
      {@const elapsed = summary[row.elapsed]}
      {@const waiting = row.key === 'patient' ? summary.patientWaitSeconds : summary.staffWaitSeconds}
      <div class="chain-row" data-started={elapsed !== null && elapsed > 0}>
        <div class="row-heading">
          <span>{row.label} <small>· {minutes(total)} shown</small></span>
          <span class="wait-total">{elapsed === null ? 'Not started' : `${minutes(waiting)} wait so far`}</span>
        </div>
        <div
          class="chain-track"
          role="img"
          aria-label={`${row.label}: ${elapsed === null ? 'not started' : `${minutes(elapsed)} shown so far`}. ${row.description}. Unknown waits are excluded from this scale.`}
        >
          {#each row.segments as segment (segment.stepId)}
            {@const complete =
              segment.stepIndex < summary.stepIndex
                ? 1
                : segment.stepIndex === summary.stepIndex
                  ? summary.progress
                  : 0}
            <span
              class="chain-segment"
              data-part={segment.part}
              data-current={segment.stepId === step.id}
              style:flex-basis={`${(segment.seconds / total) * 100}%`}
              title={segment.title}
            >
              <span class="segment-fill" style:transform={`scaleX(${complete})`}></span>
            </span>
          {/each}
          <span class="chain-cursor" style:left={`${completedFraction(row.key) * 100}%`}></span>
        </div>
      </div>
    {/each}
  </div>
  <footer>
    <span class="chain-legend"
      ><i data-part="travel"></i>Moving <i data-part="wait"></i>Waiting <i data-part="transfer"></i>Transfer / check-in
      <i data-part="upcoming"></i>Upcoming</span
    >
    <span class="unknown-time">Separate time scales · flight &amp; handoff waits unrecorded</span>
  </footer>
</section>

<style>
  .journey-chain {
    --chain-moving: var(--mobility-accent);
    --chain-waiting: var(--mobility-chart-waiting);
    --chain-transfer: var(--mobility-chart-transfer);
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--mobility-border);
    border-radius: var(--mobility-radius-card);
    background: var(--mobility-surface);
    color: var(--mobility-ink);
  }
  header,
  .row-heading,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    line-height: 1.35;
  }
  header > span {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.35;
  }
  .chain-rows {
    display: grid;
    gap: 6px;
    margin-top: 6px;
  }
  .row-heading {
    margin-bottom: 3px;
    font-size: var(--mobility-text-xs);
    line-height: 1.2;
  }
  .wait-total {
    color: var(--chain-waiting);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .row-heading small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-normal);
  }
  .chain-row[data-started='false'] .wait-total {
    color: var(--mobility-muted);
  }
  .chain-track {
    position: relative;
    display: flex;
    width: 100%;
    height: 8px;
    isolation: isolate;
  }
  .chain-segment {
    position: relative;
    flex-shrink: 1;
    min-width: 1px;
    height: 100%;
    border-radius: 2px;
    background: var(--mobility-border);
    box-shadow: inset -2px 0 0 var(--mobility-surface);
  }
  .chain-segment[data-current='true'] {
    outline: 1px solid var(--mobility-ink);
    outline-offset: 2px;
  }
  .segment-fill {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: var(--chain-moving);
    box-shadow: inset -2px 0 0 var(--mobility-surface);
    transform-origin: left;
  }
  [data-part='wait'] .segment-fill,
  .chain-legend i[data-part='wait'] {
    background: var(--chain-waiting);
  }
  [data-part='transfer'] .segment-fill,
  .chain-legend i[data-part='transfer'] {
    background: var(--chain-transfer);
  }
  .chain-cursor {
    position: absolute;
    z-index: 1;
    top: -3px;
    bottom: -3px;
    width: 2px;
    border-radius: 1px;
    background: var(--mobility-ink);
    box-shadow: 0 0 0 1px var(--mobility-surface);
    transform: translateX(-1px);
  }
  footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    margin-top: 5px;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.2;
  }
  .chain-legend {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chain-legend i {
    width: 6px;
    height: 6px;
    margin-left: 4px;
    border-radius: 1px;
    background: var(--chain-moving);
  }
  .chain-legend i:first-child {
    margin-left: 0;
  }
  .chain-legend i[data-part='upcoming'] {
    background: var(--mobility-border);
  }
  .unknown-time {
    font-style: italic;
  }
  @media (max-height: 800px) and (min-width: 701px) {
    .journey-chain {
      padding: 7px 10px;
    }
    header {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .chain-rows {
      gap: 7px;
      margin-top: 0;
    }
    .chain-track {
      height: 8px;
    }
    footer {
      margin-top: 6px;
    }
  }
</style>
