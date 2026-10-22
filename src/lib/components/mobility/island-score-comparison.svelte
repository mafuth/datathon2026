<script lang="ts">
  import type { ScoreCardMetric } from './score-presentation';

  import { chartScore } from './island-chart-data';

  let {
    metrics,
    overall = null,
    compact = false
  }: {
    metrics: readonly ScoreCardMetric[];
    overall?: number | null;
    compact?: boolean;
  } = $props();
  let reference = $derived(chartScore(overall));
  let completeProfile = $derived(metrics.length === 5 && metrics.every((metric) => chartScore(metric.value) !== null));
  let profilePoints = $derived(metrics.map((metric, index) => point(index, chartScore(metric.value) ?? 0)).join(' '));
  let referencePoints = $derived(metrics.map((_, index) => point(index, reference ?? 0)).join(' '));
  const levels = [25, 50, 75, 100];

  function polar(index: number, radius: number): { x: number; y: number } {
    const angle = -Math.PI / 2 + (index / Math.max(1, metrics.length)) * 2 * Math.PI;
    return { x: 180 + Math.cos(angle) * radius, y: 126 + Math.sin(angle) * radius };
  }
  function point(index: number, value: number): string {
    const position = polar(index, (value / 100) * 84);
    return `${position.x},${position.y}`;
  }
</script>

<div class={['score-comparison', { compact }]} data-testid="island-score-comparison">
  {#if compact}
    <dl class="comparison-rows">
      {#each metrics as metric (metric.key)}
        {@const value = chartScore(metric.value)}
        <div class="comparison-row" data-category={metric.key} data-value={value ?? 'unavailable'}>
          <dt>{metric.label}</dt>
          <dd>
            <div class={['comparison-track', { unavailable: value === null }]} aria-hidden="true">
              {#if value !== null}<span class="comparison-fill" style:width={`${value}%`}></span>{/if}
            </div>
            <strong>{value === null ? 'N/A' : `${Math.round(value)}%`}</strong>
          </dd>
        </div>
      {/each}
    </dl>
  {:else}
    <div class="chart-caption">
      <span>Category profile · out of 100</span>
      {#if reference !== null}<span class="reference-key"
          ><i aria-hidden="true"></i>Overall {Math.round(reference)}</span
        >{/if}
    </div>
    <svg class="radar" viewBox="0 0 360 250" aria-hidden="true">
      {#each levels as level (level)}
        <polygon class="radar-grid" points={metrics.map((_, index) => point(index, level)).join(' ')} />
        <text class="level-label" x="184" y={126 - (level / 100) * 84 + 4}>{level}</text>
      {/each}
      {#each metrics as metric, index (metric.key)}
        {@const edge = polar(index, 84)}
        {@const label = polar(index, 108)}
        <line class="radar-spoke" x1="180" y1="126" x2={edge.x} y2={edge.y} />
        <text
          class="axis-label"
          x={label.x}
          y={label.y + 3}
          text-anchor={label.x < 160 ? 'end' : label.x > 200 ? 'start' : 'middle'}>{metric.label}</text
        >
      {/each}
      {#if reference !== null}<polygon class="radar-reference" points={referencePoints} />{/if}
      {#if completeProfile}<polygon class="radar-profile" points={profilePoints} />{/if}
      {#each metrics as metric, index (metric.key)}
        {@const value = chartScore(metric.value)}
        {#if value !== null}
          {@const position = polar(index, (value / 100) * 84)}
          <circle class="radar-point" cx={position.x} cy={position.y} r="3.5" />
        {/if}
      {/each}
    </svg>
    <dl class="profile-values" aria-label="Category index scores out of 100">
      {#each metrics as metric (metric.key)}
        {@const value = chartScore(metric.value)}
        <div data-category={metric.key} data-value={value ?? 'unavailable'}>
          <dt>{metric.label}</dt>
          <dd>{value === null ? 'N/A' : `${Math.round(value)}%`}</dd>
        </div>
      {/each}
    </dl>
    {#if !completeProfile}<p class="chart-note">Unavailable categories are left unplotted.</p>{/if}
  {/if}
</div>

<style>
  .score-comparison {
    --chart-ink: var(--mobility-accent);
    --chart-profile: var(--mobility-accent);
    min-width: 0;
  }
  .chart-caption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.35rem 0.7rem;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .reference-key {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
  .reference-key i {
    width: 0.9rem;
    border-top: 1.5px dashed var(--mobility-chart-reference);
  }
  .radar {
    display: block;
    width: 100%;
    max-height: 17rem;
    margin: 0.3rem auto 0.2rem;
    overflow: visible;
  }
  .radar-grid {
    fill: none;
    stroke: var(--mobility-border);
    stroke-width: 0.8;
  }
  .radar-spoke {
    stroke: var(--mobility-border);
    stroke-width: 0.7;
  }
  .level-label {
    fill: var(--mobility-chart-reference);
    font-family: inherit;
    font-size: var(--mobility-text-xs);
    paint-order: stroke;
    stroke: var(--mobility-surface);
    stroke-width: 3px;
  }
  .axis-label {
    fill: var(--mobility-text);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
  }
  .radar-reference {
    fill: none;
    stroke: var(--mobility-chart-reference);
    stroke-width: 1.2;
    stroke-dasharray: 3 3;
  }
  .radar-profile {
    fill: var(--chart-profile);
    fill-opacity: 0.1;
    stroke: var(--chart-profile);
    stroke-width: 1.8;
    stroke-linejoin: round;
  }
  .radar-point {
    fill: var(--chart-profile);
    stroke: var(--mobility-surface);
    stroke-width: 1.5;
  }
  .profile-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem 1rem;
    margin: 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--mobility-border);
  }
  .profile-values > div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .profile-values dt {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .profile-values dd {
    margin: 0;
    font-size: var(--mobility-text-sm);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .chart-note {
    margin: 0.7rem 0 0;
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  .comparison-rows {
    display: grid;
    gap: 0.7rem;
    margin: 0;
  }
  .comparison-row {
    display: grid;
    grid-template-columns: 5.1rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
  }
  .comparison-row dt {
    color: var(--mobility-text);
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-medium);
  }
  .comparison-row dd {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.35rem;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
  }
  .comparison-row strong {
    text-align: right;
    font-size: var(--mobility-text-xs);
    font-weight: var(--mobility-font-weight-semibold);
    font-variant-numeric: tabular-nums;
  }
  .comparison-track {
    position: relative;
    height: 0.35rem;
    border-radius: 3px;
    background: var(--mobility-surface-muted);
    background-image: linear-gradient(
      to right,
      transparent calc(50% - 0.5px),
      var(--mobility-border) 50%,
      transparent calc(50% + 0.5px)
    );
  }
  .comparison-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: var(--chart-ink);
  }
  .unavailable {
    background: repeating-linear-gradient(135deg, var(--mobility-surface-muted) 0 3px, var(--mobility-border) 3px 4px);
  }
</style>
