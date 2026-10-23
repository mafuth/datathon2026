import type { IslandMapService, IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type { ScenarioPreviewRequest, ScenarioPreviewResponse } from '../../src/lib/mobility/scenario-contracts';

import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { config } from '../../src/lib/config/config.server';
import { buildProposalImpact, calculateProposalCosts } from '../../src/lib/mobility/proposal-planning';
import { buildProposalReport, proposalReportChartEvidence } from '../../src/lib/server/mobility/proposal-report';

function demand(): IslandMapService['demand'] {
  return Object.fromEntries(
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
        source: 'unavailable',
        byNeed: {}
      }
    ])
  ) as IslandMapService['demand'];
}

function fixture(): { input: ScenarioPreviewRequest; preview: ScenarioPreviewResponse } {
  const proposal = { name: 'Island access proposal', capitalLimit: 50_000_000, annualLimit: 12_000_000 };
  const input: ScenarioPreviewRequest = {
    baselineVersion: 'report-fixture-v1',
    selectedIslandId: 'island-1',
    proposal,
    operations: [
      { operationId: 'school', kind: 'add_service', serviceType: 'education', subtype: 'school', coordinates: [73, 3] },
      {
        operationId: 'route',
        kind: 'add_bus_service',
        routeId: 'school-route',
        headwayMinutes: 30,
        startHour: 6,
        endHour: 22,
        serviceDaysPerWeek: 7,
        vehicleCount: 1
      }
    ]
  };
  const baseline: IslandServicesResponse = {
    status: 'partial',
    baselineVersion: input.baselineVersion,
    island: { id: 'island-1', name: 'Test Island', atollName: 'Test Atoll', centroid: [73, 3] },
    services: [],
    hexes: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'outline',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [72.99, 2.99],
                [73.01, 2.99],
                [73.01, 3.01],
                [72.99, 2.99]
              ]
            ]
          },
          properties: {
            healthWeight: 0,
            educationWeight: 0,
            transportWeight: 0,
            allWeight: 0,
            healthStatus: 'unavailable',
            educationStatus: 'unavailable',
            transportStatus: 'unavailable',
            allStatus: 'unavailable'
          }
        }
      ]
    },
    summary: {
      serviceCount: 0,
      mappedCoordinateCount: 0,
      hexFeatureCount: 1,
      numericDemandCount: 0,
      unavailableDemandCount: 0,
      residentialBuildingCount: 0
    },
    limitations: []
  };
  const services: IslandMapService[] = [
    {
      id: 'new-school',
      serviceType: 'education',
      subtype: 'school',
      name: 'New School',
      coordinates: [73, 3],
      change: 'added',
      demand: demand()
    },
    {
      id: 'bad-stop',
      serviceType: 'transport',
      subtype: 'bus_stop',
      name: 'Invalid Stop',
      coordinates: [Number.POSITIVE_INFINITY, 3],
      change: 'moved',
      demand: demand()
    }
  ];
  const proposed = { ...baseline, services };
  const impact = buildProposalImpact(baseline, proposed);
  impact.categories[0].beforeDemand = Number.POSITIVE_INFINITY;
  return {
    input,
    preview: {
      ...proposed,
      status: 'draft',
      draftOnly: true,
      persisted: false,
      baselineVersion: input.baselineVersion,
      selectedIslandId: input.selectedIslandId,
      baseline,
      operations: [
        {
          operationId: 'school',
          kind: 'add_service',
          serviceId: 'new-school',
          status: 'applied',
          message: 'Add New School'
        },
        {
          operationId: 'route',
          kind: 'add_bus_service',
          serviceId: '',
          status: 'applied',
          message: 'Add School connector'
        }
      ],
      serviceChanges: { 'new-school': 'added' },
      proposal,
      costs: calculateProposalCosts(input.operations, baseline.services, proposal),
      impact,
      transportPlans: [
        {
          operationId: 'route',
          mode: 'bus',
          label: 'School connector',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [72.995, 3],
                [73.005, 3],
                [Number.NaN, 3]
              ]
            ]
          },
          distanceKm: 1,
          speedKph: 20,
          headwayMinutes: 30,
          startHour: 6,
          endHour: 22,
          serviceDaysPerWeek: 7,
          vehicleCount: 1,
          departuresPerDirectionPerDay: 32,
          proposedExpectedWaitMinutes: 15,
          bidirectional: true,
          capital: 3_000_000,
          annual: 100_000,
          assumptions: []
        }
      ]
    }
  };
}

function contents(pdf: PDFDocument): string[] {
  return pdf.getPages().map((page) => {
    const value = page.node.Contents();
    const streams =
      value instanceof PDFArray
        ? Array.from({ length: value.size() }, (_, index) => value.lookup(index, PDFRawStream))
        : value instanceof PDFRawStream
          ? [value]
          : [];
    return streams.map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode())).join('\n');
  });
}

function text(content: string): string {
  return [...content.matchAll(/<([0-9A-F]+)>\s*Tj/gi)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('\n');
}

function attachment(pdf: PDFDocument, filename: string): Record<string, unknown> {
  const names = pdf.catalog
    .lookup(PDFName.of('Names'), PDFDict)
    .lookup(PDFName.of('EmbeddedFiles'), PDFDict)
    .lookup(PDFName.of('Names'), PDFArray);
  for (let index = 0; index < names.size(); index += 2) {
    if (names.lookup(index, PDFHexString).decodeText() !== filename) continue;
    const stream = names
      .lookup(index + 1, PDFDict)
      .lookup(PDFName.of('EF'), PDFDict)
      .lookup(PDFName.of('F'));
    if (!(stream instanceof PDFRawStream)) throw new Error('Expected embedded file stream');
    return JSON.parse(new TextDecoder().decode(decodePDFRawStream(stream).decode()));
  }
  throw new Error(`Missing ${filename}`);
}

describe('proposal report', () => {
  it('produces a parseable, branded, finite monochrome PDF with chart and map evidence', async () => {
    const { input, preview } = fixture();
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    const operators = contents(pdf);
    const labels = operators.map(text).join('\n');

    expect(pdf.getAuthor()).toBe(config.app.name);
    expect(labels).toContain(`Generated by ${config.app.name}`);
    expect(labels).toContain('Where the 10-year allowance goes');
    expect(labels).toContain('Ranked horizontal composition bars');
    expect(labels).not.toContain('treemap');
    expect(labels).toContain('All-island schematic proposal locations');
    expect(labels).toContain('available island outline');
    expect(labels).toContain('New School (added; school)');
    expect(labels).toContain('School connector (proposed transport plan)');
    expect(operators.join('\n')).not.toMatch(/NaN|Infinity/);
    for (const match of operators.join('\n').matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)/g)) {
      expect(match[1]).toBe(match[2]);
      expect(match[2]).toBe(match[3]);
    }
    expect(attachment(pdf, 'proposal-evidence.json').charts).toEqual(proposalReportChartEvidence(preview));
    expect(attachment(pdf, 'proposal-input.json')).toMatchObject({ selectedIslandId: input.selectedIslandId });
  });

  it('states empty and incomplete composition explicitly', async () => {
    const { input, preview } = fixture();
    preview.costs = { ...preview.costs, complete: false, items: [] };
    const pdf = await PDFDocument.load(await buildProposalReport(input, preview));
    expect(contents(pdf).map(text).join('\n')).toContain(
      'Incomplete composition: no positive known costs can be charted'
    );
  });

  it('includes every supplied island in the schematic map evidence', async () => {
    const { input, preview } = fixture();
    const pdf = await PDFDocument.load(
      await buildProposalReport(input, preview, [
        {
          id: 'island-1',
          name: 'Test Island',
          geoJson: JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [72.99, 2.99],
                [73.01, 2.99],
                [73.01, 3.01],
                [72.99, 2.99]
              ]
            ]
          })
        },
        {
          id: 'island-2',
          name: 'Second Island',
          geoJson: JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [73.2, 3.2],
                [73.22, 3.2],
                [73.22, 3.22],
                [73.2, 3.2]
              ]
            ]
          })
        }
      ])
    );
    expect(attachment(pdf, 'proposal-evidence.json').map).toMatchObject({
      islandCount: 2,
      selectedIslandId: 'island-1',
      islands: expect.arrayContaining([
        expect.objectContaining({ id: 'island-1', name: 'Test Island' }),
        expect.objectContaining({ id: 'island-2', name: 'Second Island' })
      ])
    });
  });
});
