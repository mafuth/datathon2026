<script lang="ts">
  import type { ScoreCardMetric } from './score-presentation';

  import { chartScore } from './island-chart-data';

  let {
    metrics,
    overall = null
  }: {
    metrics: readonly ScoreCardMetric[];
    overall?: number | null;
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

<div class="score-comparison">
  <div class="chart-caption">
    <span>Category profile</span>
    {#if reference !== null}<span class="reference-key"><i aria-hidden="true"></i>Overall {Math.round(reference)}</span
      >{/if}
  </div>
  <svg class="radar" viewBox="0 0 360 250" role="img" aria-label="Island category scores out of 100">
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
  <dl class="profile-values" aria-label="Category scores out of 100">
    {#each metrics as metric (metric.key)}
      {@const value = chartScore(metric.value)}
      <div>
        <dt>{metric.label}</dt>
        <dd>{value === null ? 'N/A' : `${Math.round(value)}%`}</dd>
      </div>
    {/each}
  </dl>
  {#if !completeProfile}<p class="chart-note">Unavailable categories are left unplotted.</p>{/if}
</div>

<style>
  .score-comparison {
    --chart-profile: var(--mobility-accent, #09090b);
    --chart-reference: var(--mobility-muted, #71717a);
    min-width: 0;
  }
  .chart-caption {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.35rem 0.7rem;
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
  }
  .reference-key {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-variant-numeric: tabular-nums;
  }
  .reference-key i {
    width: 0.9rem;
    border-top: 1.5px dashed var(--chart-reference);
  }
  .radar {
    display: block;
    width: 100%;
    max-height: 15rem;
    margin: 0.3rem auto 0.2rem;
    overflow: visible;
  }
  .radar-grid,
  .radar-spoke {
    fill: none;
    stroke: var(--mobility-border, #e4e4e7);
  }
  .radar-grid {
    stroke-width: 0.8;
  }
  .radar-spoke {
    stroke-width: 0.7;
  }
  .level-label {
    fill: var(--chart-reference);
    font-family: inherit;
    font-size: 0.52rem;
    paint-order: stroke;
    stroke: var(--mobility-surface, #ffffff);
    stroke-width: 3px;
  }
  .axis-label {
    fill: var(--mobility-text, #09090b);
    font-size: 0.56rem;
    font-weight: 650;
  }
  .radar-reference {
    fill: none;
    stroke: var(--chart-reference);
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
    stroke: var(--mobility-surface, #ffffff);
    stroke-width: 1.5;
  }
  .profile-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem 1rem;
    margin: 0;
    padding-top: 0.7rem;
    border-top: 1px solid var(--mobility-border, #e4e4e7);
  }
  .profile-values > div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .profile-values dt {
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
  }
  .profile-values dd {
    margin: 0;
    font-size: 0.64rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .chart-note {
    margin: 0.65rem 0 0;
    color: var(--mobility-muted, #71717a);
    font-size: 0.56rem;
    line-height: 1.45;
  }
</style>
