import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '$lib/mobility/scenario-contracts';
import type { PDFFont, PDFPage } from 'pdf-lib';

import { PageSizes, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

import { proposalCostTreemap, proposalCostWaterfall } from '$lib/mobility/proposal-chart-data';
import { formatProposalMoney, PROPOSAL_COST_SOURCES } from '$lib/mobility/proposal-planning';

import { config } from '$config/server';

const color = (red: number, green: number, blue: number) => rgb(red / 255, green / 255, blue / 255);
const INK = color(9, 9, 9);
const MUTED = color(113, 113, 113);
const ACCENT = color(9, 9, 9);
const BEFORE = color(113, 113, 113);
const ANNUAL = color(39, 39, 39);
const AMBER = color(82, 82, 82);
const RULE = color(228, 228, 228);
const SURFACE = color(244, 244, 244);
const PAPER = color(255, 255, 255);
const MARGIN = 44;

export type ProposalReportIsland = {
  id: string;
  name: string;
  geoJson: string;
};

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
  preview: ScenarioPreviewResponse,
  reportIslands: readonly ProposalReportIsland[] = []
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const generatedAt = new Date();
  document.setTitle(preview.proposal.name);
  document.setAuthor(config.app.name);
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
  const transportOperations = input.operations.filter(
    (operation) => operation.kind === 'add_bus_service' || operation.kind === 'add_ferry_service'
  );
  const transportPlans = new Map(preview.transportPlans.map((plan) => [plan.operationId, plan]));

  function newPage(): void {
    if (started) page = document.addPage(PageSizes.A4);
    started = true;
    y = PageSizes.A4[1] - MARGIN;
    page.drawText(printable(`Generated by ${config.app.name}`, bold), {
      x: MARGIN,
      y,
      font: bold,
      size: 8,
      color: ACCENT
    });
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
        color: index === 0 ? PAPER : entry.color,
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
          color: PAPER,
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
    ensure(70 + charts.services.rows.length * 70);
    text(charts.services.title, 13, true, ACCENT);
    text('Horizontal bars use one common facility-count scale.', 8, false, MUTED);
    const maximum = Math.max(1, ...charts.services.rows.flatMap((row) => [row.before ?? 0, row.after ?? 0]));
    const plotX = MARGIN + 132;
    const plotWidth = width - 170;
    for (const row of charts.services.rows) {
      chartText(row.label, MARGIN, y, 120, 9, true);
      for (const [index, value, fill] of [
        [0, row.before, BEFORE],
        [1, row.after, INK]
      ] as const) {
        const barY = y - 21 - index * 19;
        chartText(index === 0 ? 'Without' : 'With proposal', MARGIN, barY + 8, 120, 7, false, MUTED);
        page.drawRectangle({ x: plotX, y: barY, width: plotWidth, height: 9, color: SURFACE });
        if (value !== null)
          page.drawRectangle({
            x: plotX,
            y: barY,
            width: (plotWidth * Math.max(0, value)) / maximum,
            height: 9,
            color: fill
          });
        chartText(metric(value), MARGIN + width, barY + 8, 32, 8, true, value === null ? MUTED : INK, 'right');
      }
      y -= 70;
    }
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
      const gridTop = y - 40;
      const barWidth = cardWidth;
      page.drawRectangle({ x, y: gridTop - 10, width: barWidth, height: 12, color: SURFACE });
      if (ratio !== null)
        page.drawRectangle({
          x,
          y: gridTop - 10,
          width: barWidth * Math.min(1, Math.max(0, ratio)),
          height: 12,
          color
        });
      if (over)
        page.drawLine({
          start: { x: x + barWidth, y: gridTop - 14 },
          end: { x: x + barWidth, y: gridTop + 6 },
          color: INK,
          thickness: 2
        });
      chartText(
        ratio === null ? 'Ratio unavailable' : `${metric(ratio * 100)}% used${over ? ' · OVER LIMIT' : ''}`,
        x,
        gridTop - 22,
        cardWidth,
        11,
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
    const rows = charts.costComposition.rows
      .filter((row) => Number.isFinite(row.value) && row.value > 0 && Number.isFinite(row.share) && row.share >= 0)
      .sort((left, right) => right.value - left.value);
    text(charts.costComposition.title, 17, true, ACCENT);
    text(
      'Ranked horizontal composition bars. Each bar is scaled to the largest priced intervention; labels give its share of the known 10-year allowance.',
      9,
      false,
      MUTED
    );
    if (!rows.length) {
      text(
        charts.costComposition.complete
          ? 'Empty composition: no positive priced intervention costs contribute to the 10-year allowance.'
          : 'Incomplete composition: no positive known costs can be charted and one or more interventions are unpriced.',
        10,
        false,
        MUTED
      );
      return;
    }
    const maximum = Math.max(...rows.map((row) => row.value));
    const labelWidth = 170;
    const plotX = MARGIN + labelWidth;
    const plotWidth = width - labelWidth;
    for (const [index, row] of rows.entries()) {
      ensure(43);
      chartText(
        `${index + 1}. ${row.label}${row.itemCount > 1 ? ` (${row.itemCount} items)` : ''}`,
        MARGIN,
        y,
        labelWidth - 10,
        9,
        true
      );
      chartText(
        `${formatProposalMoney(row.value)} | ${metric(row.share * 100)}%`,
        MARGIN + width,
        y,
        plotWidth,
        8,
        true,
        INK,
        'right'
      );
      page.drawRectangle({ x: plotX, y: y - 24, width: plotWidth, height: 10, color: SURFACE });
      page.drawRectangle({ x: plotX, y: y - 24, width: plotWidth * (row.value / maximum), height: 10, color: INK });
      y -= 43;
    }
    text(
      charts.costComposition.complete
        ? 'Complete priced scope. Zero-cost items do not produce bars; exact values remain in the itemised basis.'
        : 'Incomplete composition: unpriced interventions are excluded, so shares describe known costs only and not the complete proposal.',
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
    !preview.costs.complete
      ? 'The estimate is incomplete because one or more interventions are unpriced. Known multi-year totals exclude that scope.'
      : preview.costs.withinBudget
        ? 'Both capital and annual limits are met. Multi-year totals assume the same annual cash cost in every year; no price escalation or financing is included.'
        : 'OVER BUDGET: at least one independent limit is exceeded. Multi-year totals assume the same annual cash cost in every year; no price escalation or financing is included.',
    9,
    true,
    preview.costs.withinBudget ? MUTED : INK
  );

  section('What changes');
  text(
    `${preview.impact.changedServiceCount} changed facilities: ${preview.impact.addedServiceCount} added and ${preview.impact.removedServiceCount} removed. Facility count changes from ${preview.impact.baselineServiceCount} to ${preview.impact.proposedServiceCount}.`,
    10
  );
  if (input.operations.length === 0)
    text('No interventions are accepted. This brief describes the unchanged baseline.', 10);
  for (const operation of preview.operations) text(`• ${operation.message}`, 10);
  for (const operation of transportOperations) {
    const plan = transportPlans.get(operation.operationId);
    ensure(90);
    text(plan?.label ?? `${operation.kind.replace('add_', '').replace('_service', '')} service`, 11, true);
    text(`Operation ${operation.operationId}`, 8, false, MUTED);
    if (!plan) {
      text('Transport plan details are unavailable for this accepted operation.', 9, false, MUTED);
      continue;
    }
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
  text('Related-area schematic proposal locations', 20, true);
  text(`Selected island: ${preview.island.name}`, 9, false, MUTED);
  const validCoordinate = (point: unknown): point is [number, number] =>
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90;
  const geometryRings = (source: unknown): unknown[][] => {
    if (!source || typeof source !== 'object') return [];
    const value = source as { type?: unknown; coordinates?: unknown; geometry?: unknown; features?: unknown[] };
    if (value.type === 'Feature') return geometryRings(value.geometry);
    if (value.type === 'FeatureCollection' && Array.isArray(value.features))
      return value.features.flatMap((feature) => geometryRings(feature));
    if (value.type === 'Polygon' && Array.isArray(value.coordinates)) return value.coordinates as unknown[][];
    if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates))
      return value.coordinates.flatMap((polygon) => (Array.isArray(polygon) ? (polygon as unknown[][]) : []));
    return [];
  };
  const changedServices = preview.services.filter((service) => service.change && service.change !== 'unchanged');
  const islandOutlines = reportIslands.flatMap((island) => {
    try {
      return geometryRings(JSON.parse(island.geoJson) as unknown).map((ring) => ({
        islandId: island.id,
        ring: ring.filter(validCoordinate)
      }));
    } catch {
      return [];
    }
  });
  const outlineRings = (
    islandOutlines.length > 0
      ? islandOutlines
      : (preview.baseline.hexes?.features ?? preview.hexes.features).flatMap((feature) =>
          feature.geometry.coordinates.map((ring) => ({
            islandId: preview.selectedIslandId,
            ring: ring.filter(validCoordinate)
          }))
        )
  ).filter((outline) => outline.ring.length > 2);
  const routeLines = preview.transportPlans
    .flatMap((plan) => plan.geometry.coordinates)
    .map((line) => line.filter(validCoordinate))
    .filter((line) => line.length > 1);
  const routeCoordinates = routeLines.flat();
  const routeBounds = routeCoordinates.length
    ? {
        minimumX: Math.min(...routeCoordinates.map(([longitude]) => longitude)),
        maximumX: Math.max(...routeCoordinates.map(([longitude]) => longitude)),
        minimumY: Math.min(...routeCoordinates.map(([, latitude]) => latitude)),
        maximumY: Math.max(...routeCoordinates.map(([, latitude]) => latitude))
      }
    : null;
  const routeMargin = 0.35;
  const focusedOutlineRings = outlineRings.filter(
    (outline) =>
      outline.islandId === preview.selectedIslandId ||
      (routeBounds &&
        outline.ring.some(
          ([longitude, latitude]) =>
            longitude >= routeBounds.minimumX - routeMargin &&
            longitude <= routeBounds.maximumX + routeMargin &&
            latitude >= routeBounds.minimumY - routeMargin &&
            latitude <= routeBounds.maximumY + routeMargin
        ))
  );
  const coordinates = [
    ...focusedOutlineRings.flatMap((outline) => outline.ring),
    ...routeLines.flat(),
    ...changedServices.flatMap((service) => (validCoordinate(service.coordinates) ? [service.coordinates] : []))
  ];
  if (coordinates.length > 0) {
    const boxHeight = 260;
    const boxBottom = y - boxHeight;
    page.drawRectangle({
      x: MARGIN,
      y: boxBottom,
      width,
      height: boxHeight,
      color: PAPER,
      borderColor: RULE,
      borderWidth: 1
    });
    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (const [longitude, latitude] of coordinates) {
      minimumX = Math.min(minimumX, longitude);
      maximumX = Math.max(maximumX, longitude);
      minimumY = Math.min(minimumY, latitude);
      maximumY = Math.max(maximumY, latitude);
    }
    const spanX = Math.max(maximumX - minimumX, 0.000_001);
    const spanY = Math.max(maximumY - minimumY, 0.000_001);
    const scale = Math.min((width - 40) / spanX, (boxHeight - 58) / spanY);
    const originX = MARGIN + (width - spanX * scale) / 2;
    const originY = boxBottom + 18 + (boxHeight - 40 - spanY * scale) / 2;
    const project = ([longitude, latitude]: [number, number]) => ({
      x: originX + (longitude - minimumX) * scale,
      y: originY + (latitude - minimumY) * scale
    });
    for (const outline of focusedOutlineRings)
      for (let index = 1; index < outline.ring.length; index += 1)
        page.drawLine({
          start: project(outline.ring[index - 1]),
          end: project(outline.ring[index]),
          color: outline.islandId === preview.selectedIslandId ? BEFORE : RULE,
          thickness: outline.islandId === preview.selectedIslandId ? 0.8 : 0.35
        });
    for (const line of routeLines)
      for (let index = 1; index < line.length; index += 1)
        page.drawLine({
          start: project(line[index - 1]),
          end: project(line[index]),
          color: INK,
          thickness: 1.6,
          dashArray: [5, 3]
        });
    for (const service of changedServices) {
      if (!validCoordinate(service.coordinates)) continue;
      const point = project(service.coordinates);
      page.drawCircle({ x: point.x, y: point.y, size: 4.5, color: PAPER, borderColor: INK, borderWidth: 1.7 });
    }
    y = boxBottom - 16;
    text(
      'Legend: light grey lines = all island outlines; darker grey line = selected island; dashed black line = proposed transport plan; outlined circle = changed service.',
      8,
      true,
      INK
    );
    text(
      'Schematic only. Invalid coordinates are omitted; no catchment, coastline completeness or navigation accuracy is implied.',
      8,
      false,
      MUTED
    );
  } else {
    text(
      'No valid island outline, changed-service coordinates or proposed transport geometry are available for this schematic.',
      10,
      false,
      MUTED
    );
  }
  if (changedServices.length === 0) text('No changed services are mapped.', 9, false, MUTED);
  for (const service of changedServices) {
    const location = validCoordinate(service.coordinates)
      ? `${service.coordinates[1].toFixed(6)} N, ${service.coordinates[0].toFixed(6)} E`
      : 'valid coordinates unavailable';
    text(
      `${service.name || service.subtype.replaceAll('_', ' ')} (${service.change}; ${service.subtype.replaceAll('_', ' ')}) - ${location}`,
      9
    );
  }
  for (const operation of transportOperations) {
    const plan = transportPlans.get(operation.operationId);
    text(
      `${plan?.label ?? operation.operationId} (accepted ${operation.kind.replace('add_', '').replace('_service', '')} transport operation)`,
      9,
      true
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
          transportOperations,
          transportPlans: preview.transportPlans,
          map: {
            islandCount: reportIslands.length,
            selectedIslandId: preview.selectedIslandId,
            islands: reportIslands.map(({ id, name }) => ({ id, name }))
          },
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
