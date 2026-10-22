import type { IslandMapService, IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '../../src/lib/mobility/scenario-contracts';

import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildProposalImpact, calculateProposalCosts } from '../../src/lib/mobility/proposal-planning';
import { buildProposalReport, proposalReportChartEvidence } from '../../src/lib/server/mobility/proposal-report';

function fixture(): { input: ScenarioPreviewRequest; preview: ScenarioPreviewResponse } {
  const proposal = { name: 'School and boarding access', capitalLimit: 50_000_000, annualLimit: 12_000_000 };
  const input: ScenarioPreviewRequest = {
    baselineVersion: 'chart-fixture-v1',
    selectedIslandId: 'island-1',
    proposal,
    operations: [
      { operationId: 'school', kind: 'add_service', serviceType: 'education', subtype: 'school', coordinates: [73, 3] },
      {
        operationId: 'stop',
        kind: 'add_service',
        serviceType: 'transport',
        subtype: 'bus_stop',
        coordinates: [73.001, 3]
      }
    ]
  };
  const baseline: IslandServicesResponse = {
    status: 'partial',
    island: { id: 'island-1', name: 'Hulhumalé', atollName: 'Kaafu', centroid: [73, 3] },
    services: [],
    hexes: { type: 'FeatureCollection', features: [] },
    summary: {
      serviceCount: 0,
      mappedCoordinateCount: 0,
      hexFeatureCount: 0,
      numericDemandCount: 0,
      unavailableDemandCount: 0,
      residentialBuildingCount: 0
    },
    limitations: []
  };
  const impact = buildProposalImpact(baseline, baseline);
  impact.categories = [
    {
      category: 'health',
      label: 'Healthcare',
      beforeDemand: 50.25,
      afterDemand: 100.75,
      demandChange: 50.5,
      beforePressure: null,
      afterPressure: null,
      beforeServiceCount: 1,
      afterServiceCount: 2,
      status: 'partial'
    },
    {
      category: 'education',
      label: 'Education',
      beforeDemand: 150,
      afterDemand: 120,
      demandChange: -30,
      beforePressure: null,
      afterPressure: null,
      beforeServiceCount: 2,
      afterServiceCount: 2,
      status: 'numeric'
    },
    {
      category: 'transport',
      label: 'Public transport',
      beforeDemand: null,
      afterDemand: 0,
      demandChange: null,
      beforePressure: null,
      afterPressure: 0,
      beforeServiceCount: 1,
      afterServiceCount: 2,
      status: 'unavailable'
    }
  ];
  return {
    input,
    preview: {
      ...baseline,
      status: 'draft',
      baselineVersion: input.baselineVersion,
      selectedIslandId: input.selectedIslandId,
      draftOnly: true,
      persisted: false,
      operations: [],
      serviceChanges: {},
      proposal,
      costs: calculateProposalCosts(input.operations, [], proposal),
      impact,
      transportPlans: []
    }
  };
}

function pageContents(pdf: PDFDocument): string[] {
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index, PDFRawStream))
        : contents instanceof PDFRawStream
          ? [contents]
          : [];
    return streams.map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join('\n');
  });
}

function drawnText(content: string): string {
  return [...content.matchAll(/<([0-9A-F]+)>\s*Tj/gi)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('\n');
}

function attachedEvidence(pdf: PDFDocument): Record<string, unknown> {
  const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict);
  const files = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
  for (let index = 0; index < files.size(); index += 2) {
    if (files.lookup(index, PDFHexString).decodeText() !== 'proposal-evidence.json') continue;
    const attachment = files
      .lookup(index + 1, PDFDict)
      .lookup(PDFName.of('EF'), PDFDict)
      .lookup(PDFName.of('F'));
    if (!(attachment instanceof PDFRawStream)) throw new Error('Expected a compressed PDF attachment stream');
    return JSON.parse(new TextDecoder().decode(decodePDFRawStream(attachment).decode()));
  }
  throw new Error('Missing proposal evidence attachment');
}

describe('proposal PDF vector charts', () => {
  it('uses canonical demand and cost data, retaining missing values and decreases without access claims', () => {
    const { preview } = fixture();
    const charts = proposalReportChartEvidence(preview);
    expect(charts.demand.rows).toEqual([
      { category: 'health', label: 'Healthcare', before: 50.25, after: 100.75, evidence: 'partial' },
      { category: 'education', label: 'Education', before: 150, after: 120, evidence: 'numeric' },
      { category: 'transport', label: 'Public transport', before: null, after: 0, evidence: 'unavailable' }
    ]);
    expect(charts.demand.unit).toContain('not unique residents');
    expect(charts.costHorizon.rows).toEqual([
      { years: 1, capitalOnce: 25_250_000, annualTotal: 5_000_000, total: 30_250_000 },
      { years: 5, capitalOnce: 25_250_000, annualTotal: 25_000_000, total: 50_250_000 },
      { years: 10, capitalOnce: 25_250_000, annualTotal: 50_000_000, total: 75_250_000 }
    ]);
    expect(charts.budgets).toEqual([
      { label: 'Capital investment', amount: 25_250_000, limit: 50_000_000 },
      { label: 'Annual running cost', amount: 5_000_000, limit: 12_000_000 }
    ]);
    expect(charts.services.rows[2]).toMatchObject({ before: 1, after: 2 });
  });

  it('keeps incomplete costs unavailable and guards invalid numbers without hiding valid zeros', () => {
    const { preview } = fixture();
    preview.costs.complete = false;
    preview.impact.categories[0].beforeDemand = Number.POSITIVE_INFINITY;
    preview.impact.categories[0].afterDemand = -1;
    const charts = proposalReportChartEvidence(preview);
    expect(
      charts.costHorizon.rows.every((row) => row.capitalOnce === null && row.annualTotal === null && row.total === null)
    ).toBe(true);
    expect(charts.budgets.every((budget) => budget.amount === null)).toBe(true);
    expect(charts.waterfall.rows.every((row) => row.start === null && row.end === null && row.value === null)).toBe(
      true
    );
    expect(charts.costComposition.complete).toBe(false);
    expect(charts.demand.rows[0]).toMatchObject({ before: null, after: null });
    expect(charts.demand.rows[2]).toMatchObject({ before: null, after: 0 });
  });

  it('keeps facility tile units shared, bounded and separate from the exact facility counts', () => {
    const { preview } = fixture();
    preview.impact.categories[0].beforeServiceCount = 51;
    preview.impact.categories[0].afterServiceCount = 101;
    const { services } = proposalReportChartEvidence(preview);
    expect(services).toMatchObject({ visual: 'unit-matrix', symbolUnit: 3 });
    expect(services.rows[0]).toMatchObject({ before: 51, after: 101 });
    expect(services.rows[2]).toMatchObject({ before: 1, after: 2 });
    expect(Math.ceil(101 / services.symbolUnit)).toBeLessThanOrEqual(50);
  });

  it('keeps the fractional dumbbell scale and exact comparison aligned', async () => {
    const { input, preview } = fixture();
    preview.impact.categories = preview.impact.categories.map((category, index) => ({
      ...category,
      beforeDemand: index === 0 ? 0.25 : null,
      afterDemand: index === 0 ? 0.5 : null
    }));
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    const content = pageContents(pdf).find((page) => drawnText(page).includes('Modeled demand by service'))!;
    expect(proposalReportChartEvidence(preview).demand).toMatchObject({ visual: 'dumbbell', maximum: 0.5 });
    expect(drawnText(content)).toContain('0.25 to 0.5');
    expect(drawnText(content)).toContain('+0.25 change');
    expect(drawnText(content)).toContain('0.5  |  common scale');
  });

  it('preserves additive cost stages and proportional intervention areas in report evidence', () => {
    const { preview } = fixture();
    const evidence = proposalReportChartEvidence(preview);
    const stages = evidence.waterfall.rows.filter((row) => !row.total);
    expect(stages.map((row) => row.value)).toEqual([25_250_000, 5_000_000, 20_000_000, 25_000_000]);
    expect(stages.reduce((sum, row) => sum + (row.value ?? 0), 0)).toBe(preview.costs.tenYear);
    expect(stages.at(-1)?.end).toBe(preview.costs.tenYear);
    expect(evidence.costComposition.rows.reduce((sum, row) => sum + row.value, 0)).toBe(preview.costs.tenYear);
    for (const tile of evidence.costComposition.rows) {
      expect((tile.width * tile.height) / (360 * 180)).toBeCloseTo(tile.share, 10);
      expect(tile.share).toBeCloseTo(tile.value / preview.costs.tenYear, 10);
    }
  });

  it('writes native paths and readable labels with exact chart evidence embedded in the PDF', async () => {
    const { input, preview } = fixture();
    const snapshot = JSON.stringify({ input, preview });
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    const contents = pageContents(pdf);
    const text = contents.map(drawnText).join('\n');
    for (const title of [
      'Independent budget limits',
      'How the 10-year commitment builds',
      'Where the 10-year allowance goes',
      'Modeled demand by service',
      'Service facilities'
    ]) {
      const chartPage = contents.find((content) => drawnText(content).includes(title));
      expect(chartPage, title).toBeDefined();
      expect(chartPage, `${title}: native painted paths`).toMatch(/\n(?:f|B)\n/);
    }
    const compositionPage = contents.find((content) =>
      drawnText(content).includes('Where the 10-year allowance goes')
    )!;
    const tileCount = proposalReportChartEvidence(preview).costComposition.rows.length;
    // A treemap tile fills and strokes its border (B); its legend swatch only fills (f).
    expect((compositionPage.match(/\nB\n/g) ?? []).length).toBe(tileCount);
    expect((compositionPage.match(/\nf\n/g) ?? []).length).toBe(tileCount);
    const fundingPage = contents.find((content) => drawnText(content).includes('How the 10-year commitment builds'))!;
    const waterfallTitle = Buffer.from('How the 10-year commitment builds').toString('hex').toUpperCase();
    const waterfallContent = fundingPage.slice(fundingPage.indexOf(`<${waterfallTitle}>`));
    expect((waterfallContent.match(/\nf\n/g) ?? []).length).toBe(5);
    expect(text).toContain('50.25');
    expect(text).toContain('100.75');
    expect(text).toContain('Unavailable');
    expect(text).toContain('Partial evidence');
    expect(text).toContain('MVR 75,250,000');
    expect(text).toContain('not residents gaining access or minutes saved');
    expect(text).toContain('not financial forecasts');
    for (const page of pdf.getPages()) {
      const objects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      expect(objects?.keys() ?? []).toHaveLength(0);
    }
    expect(attachedEvidence(pdf).charts).toEqual(proposalReportChartEvidence(preview));
    expect(JSON.stringify({ input, preview })).toBe(snapshot);
  });

  it('renders an empty comparison without inventing demand or dividing by zero', async () => {
    const { input, preview } = fixture();
    input.operations = [];
    preview.costs = calculateProposalCosts([], [], { ...preview.proposal, capitalLimit: 0, annualLimit: 0 });
    preview.proposal = { ...preview.proposal, capitalLimit: 0, annualLimit: 0 };
    preview.impact.categories = preview.impact.categories.map((category) => ({
      ...category,
      beforeDemand: null,
      afterDemand: null,
      beforeServiceCount: 0,
      afterServiceCount: 0
    }));
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    const contents = pageContents(pdf);
    const text = contents.map(drawnText).join('\n');
    expect(text).toContain('No numeric values available');
    expect(text).toContain('MVR 0 / MVR 0');
    expect(text).toContain('MVR 0 remaining within this limit');
    expect(contents.join('\n')).not.toMatch(/NaN|Infinity/);
    for (const content of contents) {
      for (const match of content.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(44);
        expect(Number(match[2])).toBeGreaterThanOrEqual(29);
        expect(Number(match[2])).toBeLessThan(842);
      }
    }
  });

  it('preserves scoped downgrade costs and the proposed facility subtype in the report evidence', async () => {
    const { input, preview } = fixture();
    const service: IslandMapService = {
      id: 'existing-school',
      name: 'Island school',
      serviceType: 'education',
      subtype: 'high_school',
      coordinates: [73, 3],
      demand: Object.fromEntries(
        (['health', 'education', 'transport'] as const).map((category) => [
          category,
          {
            value: null,
            local: null,
            inbound: null,
            connected: null,
            transfer: null,
            careTransfer: null,
            educationTransfer: null,
            total: null,
            loadRatio: null,
            score: null,
            status: 'unavailable',
            source: 'population-allocation',
            byNeed: {}
          }
        ])
      ) as IslandMapService['demand']
    };
    input.operations = [
      {
        operationId: 'smaller-school',
        kind: 'downgrade_service',
        serviceId: service.id,
        targetSubtype: 'school',
        estimate: { capital: 2_000_000, annual: 1_000_000, basis: 'Scoped primary school conversion and running cost' }
      }
    ];
    preview.services = [{ ...service, subtype: 'school', change: 'downgraded' }];
    preview.costs = calculateProposalCosts(input.operations, [service], preview.proposal);
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    const text = pageContents(pdf).map(drawnText).join('\n');
    expect(text).toContain('Downgrade Island school to school');
    expect(text).toContain('(downgraded; school)');
    expect(text).toContain('User supplied project scope');
    expect(text).toContain('not measured student places');
    expect(attachedEvidence(pdf).costs).toEqual(preview.costs);
    expect(attachedEvidence(pdf).services).toEqual(preview.services);
  });
});
