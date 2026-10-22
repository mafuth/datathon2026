import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';
import type { PDFFont, PDFPage } from 'pdf-lib';

import { PageSizes, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

import { themeColorChannels } from '$lib/config/theme/theme-tokens';
import { proposalCostTreemap, proposalCostWaterfall, proposalUnitFill } from '$lib/mobility/proposal-chart-data';
import { formatProposalMoney, PROPOSAL_COST_SOURCES } from '$lib/mobility/proposal-planning';

const INK = rgb(...themeColorChannels('--mobility-ink'));
const MUTED = rgb(...themeColorChannels('--mobility-muted'));
const ACCENT = rgb(...themeColorChannels('--mobility-accent'));
const BEFORE = rgb(...themeColorChannels('--mobility-chart-before'));
const ANNUAL = rgb(...themeColorChannels('--mobility-chart-cost-2'));
const AMBER = rgb(...themeColorChannels('--mobility-chart-outbound'));
const RULE = rgb(...themeColorChannels('--mobility-border'));
const SURFACE = rgb(...themeColorChannels('--mobility-surface-muted'));
const MARGIN = 44;
const COMPOSITION_COLORS = [
  ACCENT,
  rgb(...themeColorChannels('--mobility-chart-inbound')),
  AMBER,
  rgb(...themeColorChannels('--mobility-chart-transfer')),
  rgb(...themeColorChannels('--mobility-chart-older')),
  BEFORE
];

function printable(value: string, font: PDFFont): string {
  return [
    ...value
      .replaceAll('\t', ' ')
      .replaceAll('\r', '')
      .replaceAll('→', 'to')
      .replaceAll('↔', '<->')
      .replaceAll('–', '-')
      .replaceAll('—', '-')
  ]
    .map((character) => {
      if (character === '\n') return character;
      try {
        font.encodeText(character);
        return character;
      } catch {
        return `[U+${character.codePointAt(0)?.toString(16).toUpperCase()}]`;
      }
    })
    .join('');
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(value, font).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (font.widthOfTextAtSize(`${current}${current ? ' ' : ''}${word}`, size) <= width) {
        current += `${current ? ' ' : ''}${word}`;
        continue;
      }
      if (current) lines.push(current);
      current = '';
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, size) > width && current) {
          lines.push(current);
          current = '';
        }
        current += character;
      }
    }
    lines.push(current);
  }
  return lines;
}

function metric(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? 'Unavailable'
    : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
}

function chartValue(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Exact values behind the vector charts; null values stay unknown, including incomplete costs. */
export function proposalReportChartEvidence(preview: ScenarioPreviewResponse) {
  const capital = preview.costs.complete ? chartValue(preview.costs.capital) : null;
  const annual = preview.costs.complete ? chartValue(preview.costs.annual) : null;
  return {
    schema: 'proposal-report-charts-v2',
    demand: {
      title: 'Modeled demand by service',
      visual: 'dumbbell',
      maximum: Math.max(
        0,
        ...preview.impact.categories.flatMap((category) => [
          chartValue(category.beforeDemand) ?? 0,
          chartValue(category.afterDemand) ?? 0
        ])
      ),
      unit: 'Modeled service allocations; not unique residents or journey-time accessibility',
      rows: preview.impact.categories.map((category) => ({
        category: category.category,
        label: category.label,
        before: chartValue(category.beforeDemand),
        after: chartValue(category.afterDemand),
        evidence: category.status
      }))
    },
    services: {
      title: 'Service facilities',
      visual: 'unit-matrix',
      symbolUnit: Math.max(
        1,
        Math.ceil(
          Math.max(
            0,
            ...preview.impact.categories.flatMap((category) => [
              chartValue(category.beforeServiceCount) ?? 0,
              chartValue(category.afterServiceCount) ?? 0
            ])
          ) / 50
        )
      ),
      unit: 'Facility counts; a boarding point alone does not establish a transport service',
      rows: preview.impact.categories.map((category) => ({
        category: category.category,
        label: category.label,
        before: chartValue(category.beforeServiceCount),
        after: chartValue(category.afterServiceCount)
      }))
    },
    costHorizon: {
      title: 'Planning cost over time',
      currency: 'MVR',
      rows: [
        { years: 1, total: preview.costs.oneYear },
        { years: 5, total: preview.costs.fiveYear },
        { years: 10, total: preview.costs.tenYear }
      ].map(({ years, total }) => ({
        years,
        capitalOnce: capital,
        annualTotal: annual === null ? null : annual * years,
        total: capital !== null && annual !== null ? chartValue(total) : null
      }))
    },
    budgets: [
      { label: 'Capital investment', amount: capital, limit: chartValue(preview.proposal.capitalLimit) },
      { label: 'Annual running cost', amount: annual, limit: chartValue(preview.proposal.annualLimit) }
    ],
    waterfall: {
      title: 'How the 10-year commitment builds',
      unit: 'MVR; capital once plus ten annual running allowances',
      rows: proposalCostWaterfall(preview.costs).map((row) => ({
        ...row,
        start: capital !== null && annual !== null ? chartValue(row.start) : null,
        end: capital !== null && annual !== null ? chartValue(row.end) : null,
        value: capital !== null && annual !== null ? chartValue(row.value) : null
      }))
    },
    costComposition: {
      title: 'Where the 10-year allowance goes',
      unit: 'MVR; each priced intervention uses capital plus ten annual running allowances',
      complete: preview.costs.complete,
      rows: proposalCostTreemap(preview.costs)
    }
  };
}

export async function buildProposalReport(
  input: ScenarioPreviewRequest,
  preview: ScenarioPreviewResponse
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = new Date();
  document.setTitle(preview.proposal.name);
  document.setAuthor('Maldives Mobility Sandbox');
  document.setSubject(
    'Proposal decision brief with capital, annual running cost and modeled service-demand comparison'
  );
  document.setCreationDate(generatedAt);
  document.setLanguage('en');

  let page: PDFPage = document.addPage(PageSizes.A4);
  let started = false;
  let y = 0;
  const width = PageSizes.A4[0] - MARGIN * 2;
  const charts = proposalReportChartEvidence(preview);

  function newPage(): void {
    if (started) page = document.addPage(PageSizes.A4);
    started = true;
    y = PageSizes.A4[1] - MARGIN;
    page.drawText('MALDIVES  /  MOBILITY SANDBOX', { x: MARGIN, y, font: bold, size: 8, color: ACCENT });
    page.drawLine({
      start: { x: MARGIN, y: y - 12 },
      end: { x: MARGIN + width, y: y - 12 },
      color: RULE,
      thickness: 1
    });
    y -= 34;
  }

  function ensure(height: number): void {
    if (y - height < 64) newPage();
  }

  function textBlockHeight(value: string, size = 10, strong = false): number {
    return wrap(value, strong ? bold : regular, size, width).length * size * 1.5 + 5;
  }

  function text(value: string, size = 10, strong = false, color = INK): void {
    const font = strong ? bold : regular;
    const lines = wrap(value, font, size, width);
    const blockHeight = lines.length * size * 1.5 + 5;
    const fullPageHeight = PageSizes.A4[1] - MARGIN - 34 - 64;
    if (blockHeight <= fullPageHeight) ensure(blockHeight);
    for (const line of lines) {
      ensure(size * 1.5);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color });
      y -= size * 1.5;
    }
    y -= 5;
  }

  function section(label: string): void {
    ensure(50);
    y -= 10;
    text(label, 14, true, ACCENT);
  }

  function pair(label: string, value: string): void {
    ensure(27);
    chartText(label, MARGIN + 10, y, width * 0.42, 9, false, MUTED);
    chartText(value, MARGIN + width - 10, y, width * 0.56 - 20, 10, true, INK, 'right');
    page.drawLine({
      start: { x: MARGIN, y: y - 21 },
      end: { x: MARGIN + width, y: y - 21 },
      color: RULE,
      thickness: 0.5
    });
    y -= 27;
  }

  function chartText(
    value: string,
    x: number,
    top: number,
    maximumWidth: number,
    size = 9,
    strong = false,
    color = INK,
    align: 'left' | 'right' = 'left'
  ): void {
    const font = strong ? bold : regular;
    const safe = printable(value, font);
    const measured = font.widthOfTextAtSize(safe, size);
    const fitted = measured > maximumWidth ? Math.max(6, (size * maximumWidth) / measured) : size;
    const fittedWidth = font.widthOfTextAtSize(safe, fitted);
    page.drawText(safe, { x: align === 'right' ? x - fittedWidth : x, y: top - fitted, size: fitted, font, color });
  }

  function comparisonLegend(): void {
    let x = MARGIN;
    for (const [index, entry] of [
      { label: 'Current services', color: BEFORE },
      { label: 'With proposal', color: ACCENT }
    ].entries()) {
      page.drawCircle({
        x: x + 4,
        y: y - 5,
        size: 3.2,
        color: index === 0 ? rgb(...themeColorChannels('--mobility-surface')) : entry.color,
        borderColor: entry.color,
        borderWidth: index === 0 ? 1.4 : 0
      });
      chartText(entry.label, x + 14, y, width, 8, false, MUTED);
      x += regular.widthOfTextAtSize(entry.label, 8) + 38;
    }
    y -= 23;
  }

  function comparisonChart(
    title: string,
    rows: { label: string; before: number | null; after: number | null; evidence?: string }[]
  ): void {
    const rowHeight = 59;
    ensure(84 + rows.length * rowHeight);
    text(title, 13, true, ACCENT);
    comparisonLegend();
    const plotX = MARGIN + 112;
    const plotWidth = width - 118;
    const values = rows.flatMap((row) => [row.before, row.after]).filter((value): value is number => value !== null);
    const observedMaximum = Math.max(0, ...values);
    const maximum = observedMaximum > 0 ? observedMaximum : 1;
    for (const row of rows) {
      chartText(row.label, MARGIN, y - 1, 102, 9, true);
      const centerY = y - 26;
      page.drawLine({
        start: { x: plotX, y: centerY },
        end: { x: plotX + plotWidth, y: centerY },
        color: RULE,
        thickness: 1
      });
      if (row.before !== null && row.after !== null) {
        page.drawLine({
          start: { x: plotX + (plotWidth * row.before) / maximum, y: centerY },
          end: { x: plotX + (plotWidth * row.after) / maximum, y: centerY },
          color: ACCENT,
          thickness: 3
        });
      }
      if (row.before !== null)
        page.drawCircle({
          x: plotX + (plotWidth * row.before) / maximum,
          y: centerY,
          size: 4.6,
          color: rgb(...themeColorChannels('--mobility-surface')),
          borderColor: BEFORE,
          borderWidth: 1.7
        });
      if (row.after !== null)
        page.drawCircle({ x: plotX + (plotWidth * row.after) / maximum, y: centerY, size: 3.2, color: ACCENT });
      const delta = row.before !== null && row.after !== null ? row.after - row.before : null;
      chartText(`${metric(row.before)} to ${metric(row.after)}`, plotX, y, plotWidth * 0.65, 9, true);
      chartText(
        delta === null
          ? 'Unavailable comparison'
          : delta === 0
            ? 'No change'
            : `${delta > 0 ? '+' : '-'}${metric(Math.abs(delta))} change`,
        MARGIN + width,
        y,
        plotWidth * 0.35,
        8,
        false,
        MUTED,
        'right'
      );
      if (row.evidence && row.evidence !== 'numeric')
        chartText(
          row.evidence === 'partial' ? 'Partial evidence' : 'Evidence unavailable',
          MARGIN,
          y - 19,
          102,
          7,
          false,
          MUTED
        );
      y -= rowHeight;
    }
    chartText('0', plotX, y + 12, 40, 7, false, MUTED);
    chartText(
      values.length ? `${metric(observedMaximum)}  |  common scale` : 'No numeric values available',
      plotX + plotWidth,
      y + 12,
      plotWidth,
      7,
      false,
      MUTED,
      'right'
    );
    y -= 9;
  }

  function facilityMatrixChart(): void {
    ensure(60 + charts.services.rows.length * 65);
    text(charts.services.title, 13, true, ACCENT);
    text(
      `Unit-tile comparison: one full tile = ${metric(charts.services.symbolUnit)} ${charts.services.symbolUnit === 1 ? 'facility' : 'facilities'}. A partial tile retains the exact remainder.`,
      8,
      false,
      MUTED
    );
    const symbolUnit = charts.services.symbolUnit;
    const dotStep = 6.2;
    const matrixX = MARGIN + 142;
    for (const row of charts.services.rows) {
      chartText(row.label, MARGIN, y, 128, 9, true);
      for (const [index, value, color] of [
        [0, row.before, BEFORE],
        [1, row.after, ACCENT]
      ] as const) {
        const dotY = y - 19 - index * 15;
        chartText(index === 0 ? 'Without' : 'With proposal', MARGIN, dotY + 4, 128, 8, false, MUTED);
        if (value !== null) {
          for (let dot = 0; dot < 50; dot++) {
            const fraction = proposalUnitFill(value, symbolUnit, dot);
            const dotX = matrixX + (dot % 25) * dotStep;
            const dotCenterY = dotY - Math.floor(dot / 25) * dotStep;
            page.drawRectangle({ x: dotX - 2, y: dotCenterY - 2, width: 4, height: 4, color: SURFACE });
            if (fraction > 0)
              page.drawRectangle({ x: dotX - 2, y: dotCenterY - 2, width: 4 * fraction, height: 4, color });
          }
        }
        chartText(metric(value), MARGIN + width, dotY + 5, 82, 9, index === 1, value === null ? MUTED : INK, 'right');
      }
      y -= 65;
    }
    y -= 4;
  }

  function budgetChart(): void {
    ensure(191);
    text('Independent budget limits', 13, true, ACCENT);
    const gap = 18;
    const cardWidth = (width - gap) / 2;
    for (const [index, budget] of charts.budgets.entries()) {
      const x = MARGIN + index * (cardWidth + gap);
      const over = budget.amount !== null && budget.limit !== null && budget.amount > budget.limit;
      const color = over ? AMBER : ACCENT;
      chartText(budget.label, x, y, cardWidth, 10, true);
      const value = budget.amount === null ? 'Unavailable' : formatProposalMoney(budget.amount);
      const limit = budget.limit === null ? 'Unavailable' : formatProposalMoney(budget.limit);
      chartText(`${value} / ${limit}`, x, y - 19, cardWidth, 8, false, color);
      const ratio =
        budget.amount !== null && budget.limit !== null && budget.limit > 0 ? budget.amount / budget.limit : null;
      const fill = ratio === null ? 0 : Math.min(1, ratio) * 100;
      const gridTop = y - 40;
      for (let cell = 0; cell < 100; cell++) {
        const cellX = x + (cell % 10) * 6.6;
        const cellY = gridTop - Math.floor(cell / 10) * 6.6;
        page.drawRectangle({ x: cellX, y: cellY - 5, width: 5, height: 5, color: SURFACE });
        const fraction = Math.min(1, Math.max(0, fill - cell));
        if (fraction) page.drawRectangle({ x: cellX, y: cellY - 5, width: 5 * fraction, height: 5, color });
      }
      chartText(
        ratio === null ? 'Ratio unavailable' : `${metric(ratio * 100)}% used`,
        x + 77,
        gridTop - 3,
        cardWidth - 77,
        12,
        true,
        color
      );
      const note =
        budget.amount === null || budget.limit === null
          ? 'Complete cost and limit required.'
          : over
            ? `${formatProposalMoney(budget.amount - budget.limit)} above this limit`
            : `${formatProposalMoney(budget.limit - budget.amount)} remaining within this limit`;
      const noteLines = wrap(note, regular, 8, cardWidth - 77);
      for (const [line, label] of noteLines.entries())
        chartText(label, x + 77, gridTop - 25 - line * 12, cardWidth - 77, 8, false, over ? AMBER : MUTED);
      chartText('100 cells = budget limit', x, gridTop - 73, cardWidth, 7, false, MUTED);
    }
    y -= 147;
  }

  function horizonChart(): void {
    ensure(340);
    text(charts.waterfall.title, 13, true, ACCENT);
    text('Additive waterfall - MVR', 8, false, MUTED);
    const plotHeight = 125;
    const bottom = y - plotHeight - 22;
    const slot = width / charts.waterfall.rows.length;
    const barWidth = slot * 0.46;
    const maximum = Math.max(1, ...charts.waterfall.rows.map((row) => row.end ?? 0));
    page.drawLine({
      start: { x: MARGIN, y: bottom },
      end: { x: MARGIN + width, y: bottom },
      color: RULE,
      thickness: 0.7
    });
    for (const [index, row] of charts.waterfall.rows.entries()) {
      const x = MARGIN + index * slot + (slot - barWidth) / 2;
      if (row.start !== null && row.end !== null) {
        const startY = bottom + (row.start / maximum) * plotHeight;
        const endY = bottom + (row.end / maximum) * plotHeight;
        const color = row.total ? INK : index === 0 ? ACCENT : ANNUAL;
        if (row.end > row.start) page.drawRectangle({ x, y: startY, width: barWidth, height: endY - startY, color });
        else page.drawLine({ start: { x, y: endY }, end: { x: x + barWidth, y: endY }, color, thickness: 1.5 });
        if (index < charts.waterfall.rows.length - 2)
          page.drawLine({
            start: { x: x + barWidth, y: endY },
            end: { x: x + slot, y: endY },
            color: BEFORE,
            thickness: 0.7,
            dashArray: [3, 2]
          });
        chartText(
          `${row.total ? '' : '+'}${metric(row.value)}`,
          x + barWidth,
          endY + 14,
          slot - 5,
          8,
          true,
          color,
          'right'
        );
      } else chartText('Unavailable', x + barWidth, bottom + 25, slot - 5, 7, false, MUTED, 'right');
      chartText(row.label, x - 13, bottom - 12, slot - 4, 8, true);
      chartText(
        row.total ? 'Capital + running' : index === 0 ? 'Capital once' : 'Running cost added',
        x - 13,
        bottom - 24,
        slot - 4,
        7,
        false,
        MUTED
      );
    }
    chartText('0', MARGIN, bottom + 8, 20, 7, false, MUTED);
    y = bottom - 49;
    for (const row of charts.costHorizon.rows)
      pair(
        row.years === 1 ? 'Year 1 total' : `${row.years}-year total`,
        row.total === null ? 'Unavailable' : formatProposalMoney(row.total)
      );
    text(
      'Capital once + annual running allowance x years. No inflation, discounting, financing or revenue is modeled.',
      8,
      false,
      MUTED
    );
  }

  function costCompositionChart(): void {
    const tiles = charts.costComposition.rows;
    ensure(350 + tiles.length * 28);
    text(charts.costComposition.title, 17, true, ACCENT);
    text(
      "Proportional treemap - area represents each priced intervention's capital + 10 years of running cost.",
      9,
      false,
      MUTED
    );
    if (!tiles.length) {
      text(
        'No positive priced intervention costs are available. Zero-cost and unpriced items have no area.',
        10,
        false,
        MUTED
      );
      return;
    }
    const plotHeight = 240;
    const plotBottom = y - plotHeight;
    for (const [index, tile] of tiles.entries()) {
      const tileX = MARGIN + (tile.x / 360) * width;
      const tileWidth = (tile.width / 360) * width;
      const tileHeight = (tile.height / 180) * plotHeight;
      const tileBottom = plotBottom + ((180 - tile.y - tile.height) / 180) * plotHeight;
      page.drawRectangle({
        x: tileX,
        y: tileBottom,
        width: tileWidth,
        height: tileHeight,
        color: COMPOSITION_COLORS[index],
        borderColor: rgb(...themeColorChannels('--mobility-surface')),
        borderWidth: 1.4
      });
      if (tileWidth > 32 && tileHeight > 28) {
        chartText(
          String(index + 1),
          tileX + 10,
          tileBottom + tileHeight - 10,
          tileWidth - 20,
          14,
          true,
          rgb(...themeColorChannels('--mobility-surface'))
        );
        if (tileWidth > 100 && tileHeight > 62)
          chartText(
            `${metric(tile.share * 100)}%`,
            tileX + 10,
            tileBottom + tileHeight - 32,
            tileWidth - 20,
            12,
            false,
            rgb(...themeColorChannels('--mobility-surface'))
          );
      }
    }
    y = plotBottom - 18;
    for (const [index, tile] of tiles.entries()) {
      page.drawRectangle({ x: MARGIN, y: y - 10, width: 9, height: 9, color: COMPOSITION_COLORS[index] });
      chartText(
        `${index + 1}. ${tile.label}${tile.itemCount > 1 ? ` (${tile.itemCount} items)` : ''}`,
        MARGIN + 16,
        y,
        width - 160,
        9,
        true
      );
      chartText(formatProposalMoney(tile.value), MARGIN + width, y, 140, 9, true, INK, 'right');
      y -= 25;
    }
    text(
      charts.costComposition.complete
        ? 'Top five priced interventions plus Other. Zero-cost items have no area; exact costs remain in the itemised basis.'
        : 'Partial priced scope only: unpriced interventions are excluded, so this is not the complete proposal cost.',
      8,
      false,
      MUTED
    );
  }

  newPage();
  text('PROPOSAL DECISION BRIEF', 9, true, MUTED);
  text(preview.proposal.name, 25, true);
  text(`${preview.island.name}, ${preview.island.atollName}`, 12, false, MUTED);
  text(`Generated ${generatedAt.toISOString()}  |  Baseline ${preview.baselineVersion}`, 8, false, MUTED);
  text(
    'Draft for review. Baseline data remains unchanged. Costs are planning allowances and impact is a modeled comparison.',
    10
  );

  section('Investment and affordability');
  pair('Capital investment', formatProposalMoney(preview.costs.capital));
  pair('Annual cash running cost', formatProposalMoney(preview.costs.annual));
  pair(
    'Capital limit / remaining',
    `${formatProposalMoney(preview.proposal.capitalLimit)} / ${formatProposalMoney(preview.costs.capitalRemaining)}`
  );
  pair(
    'Annual limit / remaining',
    `${formatProposalMoney(preview.proposal.annualLimit)} / ${formatProposalMoney(preview.costs.annualRemaining)}`
  );
  pair(
    'Year 1 / 5 years / 10 years',
    `${formatProposalMoney(preview.costs.oneYear)} / ${formatProposalMoney(preview.costs.fiveYear)} / ${formatProposalMoney(preview.costs.tenYear)}`
  );
  text(
    'Both capital and annual limits are met. Multi-year totals assume the same annual cash cost in every year; no price escalation or financing is included.',
    9,
    false,
    MUTED
  );

  section('What changes');
  text(
    `${preview.impact.changedServiceCount} changed facilities: ${preview.impact.addedServiceCount} added and ${preview.impact.removedServiceCount} removed. Facility count changes from ${preview.impact.baselineServiceCount} to ${preview.impact.proposedServiceCount}.`,
    10
  );
  if (input.operations.length === 0)
    text('No interventions are accepted. This brief describes the unchanged baseline.', 10);
  for (const operation of preview.operations) text(`• ${operation.message}`, 10);
  for (const plan of preview.transportPlans) {
    ensure(90);
    text(plan.label, 11, true);
    text(
      `${plan.vehicleCount} proposed vehicle(s)  |  ${plan.distanceKm.toFixed(2)} km modeled route  |  ${plan.headwayMinutes}-minute proposed headway`,
      9
    );
    text(
      `${plan.departuresPerDirectionPerDay} proposed departures per direction/day  |  ${plan.serviceDaysPerWeek} operating days/week  |  ${plan.startHour}:00–${plan.endHour}:00 operating window`,
      9
    );
    text(
      `Planning expected wait: ${metric(plan.proposedExpectedWaitMinutes)} minutes under evenly spaced service. This is a proposed assumption, not an observed or confirmed timetable.`,
      9,
      false,
      MUTED
    );
    for (const assumption of plan.assumptions) text(`• ${assumption}`, 9, false, MUTED);
  }

  newPage();
  text('FUNDING THE PROPOSAL', 9, true, MUTED);
  text('Budget use and planning cost', 20, true);
  text(
    'Capital and annual costs have separate limits. The illustrations below use the accepted proposal and its server-calculated planning allowances.',
    9,
    false,
    MUTED
  );
  budgetChart();
  horizonChart();
  text(
    'Full cost values, the scope of each allowance and retained source references appear in the itemised cost basis. These illustrations are not financial forecasts.',
    9,
    false,
    MUTED
  );

  newPage();
  text('COST COMPOSITION', 9, true, MUTED);
  costCompositionChart();

  newPage();
  text('Modeled service comparison', 20, true);
  text(
    'These are service allocations and facility counts, not residents gaining access or minutes saved. Categories may count the same person more than once.',
    9,
    false,
    MUTED
  );
  comparisonChart(charts.demand.title, charts.demand.rows);
  text(
    'Allocated demand, common scale across categories. Partial evidence may omit demand; Unavailable is not zero. Larger allocations do not by themselves establish better access.',
    8,
    false,
    MUTED
  );
  facilityMatrixChart();
  text(
    'Facility counts, common scale across categories. A new boarding point alone does not establish a scheduled bus or ferry service.',
    8,
    false,
    MUTED
  );
  ensure(25 + preview.impact.categories.length * 17);
  text('Mean available load ratio: current services / with proposal', 10, true);
  for (const category of preview.impact.categories) {
    chartText(category.label, MARGIN, y, 140, 8, false, MUTED);
    chartText(
      `${metric(category.beforePressure)} / ${metric(category.afterPressure)}`,
      MARGIN + width,
      y,
      width - 150,
      8,
      false,
      MUTED,
      'right'
    );
    y -= 17;
  }

  newPage();
  text('PLANNED LOCATIONS', 9, true, MUTED);
  text('Where the proposal changes services', 20, true);
  const mapped = preview.services.filter((service) => service.coordinates);
  const coordinates = [
    ...mapped.flatMap((service) => (service.coordinates ? [service.coordinates] : [])),
    ...preview.transportPlans.flatMap((plan) => plan.geometry.coordinates.flat())
  ];
  if (coordinates.length > 0) {
    const boxHeight = 260;
    const boxBottom = y - boxHeight;
    page.drawRectangle({
      x: MARGIN,
      y: boxBottom,
      width,
      height: boxHeight,
      color: SURFACE,
      borderColor: RULE,
      borderWidth: 1
    });
    const longitudes = coordinates.map((point) => point[0]);
    const latitudes = coordinates.map((point) => point[1]);
    const minimumX = Math.min(...longitudes);
    const maximumX = Math.max(...longitudes);
    const minimumY = Math.min(...latitudes);
    const maximumY = Math.max(...latitudes);
    const spanX = Math.max(maximumX - minimumX, 0.001);
    const spanY = Math.max(maximumY - minimumY, 0.001);
    const scale = Math.min((width - 40) / spanX, (boxHeight - 40) / spanY);
    const originX = MARGIN + (width - spanX * scale) / 2;
    const originY = boxBottom + (boxHeight - spanY * scale) / 2;
    for (const plan of preview.transportPlans) {
      for (const line of plan.geometry.coordinates) {
        for (let index = 1; index < line.length; index += 1) {
          const from = line[index - 1];
          const to = line[index];
          if (!from || !to) continue;
          page.drawLine({
            start: { x: originX + (from[0] - minimumX) * scale, y: originY + (from[1] - minimumY) * scale },
            end: { x: originX + (to[0] - minimumX) * scale, y: originY + (to[1] - minimumY) * scale },
            color: ACCENT,
            thickness: 1.5,
            dashArray: [4, 3]
          });
        }
      }
    }
    for (const service of mapped) {
      if (!service.coordinates) continue;
      const changed = service.change && service.change !== 'unchanged';
      page.drawCircle({
        x: originX + (service.coordinates[0] - minimumX) * scale,
        y: originY + (service.coordinates[1] - minimumY) * scale,
        size: changed ? 5 : 2.4,
        color: changed ? ACCENT : rgb(...themeColorChannels('--mobility-chart-before')),
        borderColor: changed ? INK : SURFACE,
        borderWidth: changed ? 1 : 0.5
      });
    }
    y = boxBottom - 19;
    text(
      'Schematic coordinate view: larger green markers are changed facilities; small grey markers are retained services. Dashed green lines show proposed transport geometry. No coastline, catchment or navigation accuracy is implied; ferry lines may cross land or reefs.',
      9,
      false,
      MUTED
    );
  } else {
    text('No mapped service coordinates are available.', 10);
  }
  for (const service of preview.services.filter((entry) => entry.change && entry.change !== 'unchanged')) {
    text(
      `${service.name || service.subtype.replaceAll('_', ' ')} (${service.change}; ${service.subtype.replaceAll('_', ' ')}) — ${service.coordinates ? `${service.coordinates[1].toFixed(6)} N, ${service.coordinates[0].toFixed(6)} E` : 'coordinates unavailable'}`,
      9
    );
  }

  section('Itemised cost basis');
  for (const item of preview.costs.items) {
    ensure(70);
    text(item.label, 11, true);
    text(`${formatProposalMoney(item.capital)} capital  |  ${formatProposalMoney(item.annual)} per year`, 10, true);
    text(item.basis, 9, false, MUTED);
  }

  section('Assumptions and evidence boundaries');
  for (const limitation of new Set([
    ...preview.costs.limitations,
    ...preview.impact.limitations,
    ...preview.limitations
  ])) {
    text(`• ${limitation}`, 9, false, MUTED);
  }

  section('Retained source references');
  const cited = new Set(preview.costs.items.flatMap((item) => item.sourceIds));
  const sources = PROPOSAL_COST_SOURCES.filter((source) => cited.has(source.id));
  if (sources.length === 0)
    text(
      'The accepted changes use explicit planning allowances without an isolated verified unit quotation. Their full basis is listed above.',
      9,
      false,
      MUTED
    );
  for (const source of sources) {
    text(source.title, 10, true);
    text(source.qualification, 9, false, MUTED);
    text(source.url, 8, false, ACCENT);
  }

  const reproductionNote =
    'The PDF includes proposal-input.json and proposal-evidence.json as attachments. They preserve the accepted operations, limits, baseline version, server-calculated costs, demand comparison and evidence qualifications. Open the attachments panel in a PDF reader to inspect them.';
  const fontNote =
    'Fonts retain supported Latin names. Any character outside the embedded font encoding is represented visibly by its Unicode code point; the attached JSON preserves the original text.';
  ensure(
    10 +
      textBlockHeight('Reproduce this review', 14, true) +
      textBlockHeight(reproductionNote, 9) +
      textBlockHeight(fontNote, 8)
  );
  section('Reproduce this review');
  text(reproductionNote, 9, false, MUTED);
  text(fontNote, 8, false, MUTED);

  const canonicalInput = {
    ...input,
    baselineVersion: preview.baselineVersion,
    selectedIslandId: preview.selectedIslandId,
    proposal: preview.proposal
  };
  await document.attach(new TextEncoder().encode(JSON.stringify(canonicalInput, null, 2)), 'proposal-input.json', {
    mimeType: 'application/json',
    description: 'Accepted proposal operations, limits and immutable baseline version',
    creationDate: generatedAt
  });
  await document.attach(
    new TextEncoder().encode(
      JSON.stringify(
        {
          generatedAt: generatedAt.toISOString(),
          island: preview.island,
          baselineVersion: preview.baselineVersion,
          costs: preview.costs,
          impact: preview.impact,
          services: preview.services,
          transportPlans: preview.transportPlans,
          charts,
          limitations: preview.limitations
        },
        null,
        2
      )
    ),
    'proposal-evidence.json',
    {
      mimeType: 'application/json',
      description: 'Canonical cost and modeled demand comparison evidence',
      creationDate: generatedAt
    }
  );

  const pages = document.getPages();
  pages.forEach((current, index) => {
    current.drawLine({ start: { x: MARGIN, y: 43 }, end: { x: MARGIN + width, y: 43 }, color: RULE, thickness: 0.5 });
    current.drawText('DRAFT  |  Planning estimates; not an approved investment decision', {
      x: MARGIN,
      y: 30,
      size: 7,
      font: regular,
      color: MUTED
    });
    current.drawText(`${index + 1} / ${pages.length}`, {
      x: MARGIN + width - 25,
      y: 30,
      size: 8,
      font: bold,
      color: MUTED
    });
  });
  return document.save();
}
