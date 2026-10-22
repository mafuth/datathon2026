<script lang="ts">
  import { chartScore } from './island-chart-data';

  let { label, value, note }: { label: string; value: number | null; note: string } = $props();
  let score = $derived(chartScore(value));
</script>

<div class="context-gauge">
  <span class="gauge-label">{label}</span>
  <div class="gauge-visual">
    <svg viewBox="0 0 160 94" aria-hidden="true">
      <path class="gauge-track" d="M 12 78 A 68 68 0 0 1 148 78" />
      {#if score !== null}
        <path class="gauge-value" d="M 12 78 A 68 68 0 0 1 148 78" pathLength="100" stroke-dasharray={`${score} 100`} />
      {/if}
      <text x="12" y="93" text-anchor="middle">0</text>
      <text x="148" y="93" text-anchor="middle">100</text>
    </svg>
    <strong>{score === null ? 'N/A' : `${Math.round(score)}%`}</strong>
  </div>
  <small>{note}</small>
</div>

<style>
  .context-gauge {
    display: grid;
    align-content: start;
    gap: 0.55rem;
    min-width: 0;
  }
  .gauge-label {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.4;
  }
  .gauge-visual {
    position: relative;
    max-width: 10rem;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
  }
  .gauge-track {
    stroke: var(--mobility-surface-muted);
  }
  .gauge-value {
    stroke: var(--mobility-accent);
  }
  strong {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 15%;
    text-align: center;
    color: var(--mobility-text);
    font-size: var(--mobility-text-2xl);
    font-weight: var(--mobility-font-weight-semibold);
    letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  text {
    fill: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
  }
  small {
    color: var(--mobility-muted);
    font-size: var(--mobility-text-xs);
    line-height: 1.45;
  }
</style>
