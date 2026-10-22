import type {
  IslandMapService,
  IslandServiceDemand,
  IslandServicesResponse
} from '../../src/lib/components/mobility/island-services';
import type {
  ScenarioOperation,
  ScenarioPreviewRequest,
  ScenarioPreviewResponse
} from '../../src/lib/mobility/scenario-contracts';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  buildProposalImpact,
  calculateProposalCosts,
  DEFAULT_PROPOSAL_SETTINGS
} from '../../src/lib/mobility/proposal-planning';
import { proposalBaselineVersion } from '../../src/lib/server/mobility/proposal-baseline';
import { buildProposalReport } from '../../src/lib/server/mobility/proposal-report';
import { projectScenario } from '../../src/lib/server/mobility/scenario-engine';

function demand(value: number | null = null): IslandServiceDemand {
  return {
    value,
    local: value,
    inbound: null,
    connected: null,
    transfer: null,
    careTransfer: null,
    educationTransfer: null,
    total: value,
    loadRatio: null,
    score: null,
    status: value === null ? 'unavailable' : 'partial',
    source: 'population-allocation',
    byNeed: {}
  };
}

function service(id = 'existing'): IslandMapService {
  return {
    id,
    name: 'Existing clinic',
    serviceType: 'health',
    subtype: 'health_center',
    coordinates: [73, 3],
    demand: { health: demand(10), education: demand(), transport: demand() }
  };
}

function baseline(services: IslandMapService[] = []): IslandServicesResponse {
  return {
    status: 'partial',
    baselineVersion: 'fixture-v1',
    island: { id: 'island-1', name: 'Hulhumalé', atollName: 'Kaafu', centroid: [73, 3] },
    services,
    hexes: { type: 'FeatureCollection', features: [] },
    summary: {
      serviceCount: services.length,
      mappedCoordinateCount: services.length,
      hexFeatureCount: 0,
      numericDemandCount: 0,
      unavailableDemandCount: 0,
      residentialBuildingCount: 0
    },
    limitations: ['Fixture partial model']
  };
}

function snapshot(): ScoringSnapshot {
  return {
    islands: [
      {
        id: 'island-1',
        name: 'Hulhumalé',
        islandType: 'inhabited',
        latitude: 3,
        longitude: 73,
        landAreaKm2: 1,
        atollId: 'atoll-1',
        geoJson: JSON.stringify({
          type: 'Polygon',
          coordinates: [
            [
              [72.9, 2.9],
              [73.1, 2.9],
              [73.1, 3.1],
              [72.9, 3.1],
              [72.9, 2.9]
            ]
          ]
        })
      }
    ],
    services: [
      {
        id: 'existing',
        name: 'Existing clinic',
        serviceType: 'health',
        subtype: 'health_center',
        islandId: 'island-1',
        longitude: 73,
        latitude: 3
      }
    ],
    population: [],
    vehicleCounts: [],
    jobLocations: [],
    connections: [],
    routes: [],
    transportStops: [],
    routeStops: [],
    residentialDemandPoints: []
  };
}

describe('proposal cost ledger', () => {
  const stop: ScenarioOperation = {
    operationId: 'add-1',
    kind: 'add_service',
    serviceType: 'transport',
    subtype: 'bus_stop',
    coordinates: [73, 3]
  };

  it('retains one allowance when moving an unbuilt site and removes it when cancelled by deletion', () => {
    const moved = calculateProposalCosts(
      [stop, { operationId: 'move-1', kind: 'move_service', serviceId: 'draft:add-1', coordinates: [73.01, 3] }],
      []
    );
    expect(moved.capital).toBe(250_000);
    expect(moved.items).toHaveLength(1);
    expect(moved.complete).toBe(true);
    const removed = calculateProposalCosts(
      [stop, { operationId: 'remove-1', kind: 'delete_service', serviceId: 'draft:add-1' }],
      []
    );
    expect(removed.capital).toBe(0);
    expect(removed.items).toEqual([]);
  });

  it('enforces capital and annual limits independently', () => {
    const school: ScenarioOperation = {
      operationId: 'school-1',
      kind: 'add_service',
      serviceType: 'education',
      subtype: 'school',
      coordinates: [73, 3]
    };
    const annualBlocked = calculateProposalCosts([school], [], {
      name: 'Annual limit',
      capitalLimit: 30_000_000,
      annualLimit: 4_000_000
    });
    expect(annualBlocked.withinBudget).toBe(false);
    expect(annualBlocked.capitalRemaining).toBe(5_000_000);
    expect(annualBlocked.annualRemaining).toBe(-1_000_000);
    const capitalBlocked = calculateProposalCosts([school], [], {
      name: 'Capital limit',
      capitalLimit: 20_000_000,
      annualLimit: 6_000_000
    });
    expect(capitalBlocked.withinBudget).toBe(false);
    expect(capitalBlocked.annualRemaining).toBe(1_000_000);
    expect(capitalBlocked.fiveYear).toBe(50_000_000);
    expect(capitalBlocked.tenYear).toBe(75_000_000);
  });

  it('uses a conservative replacement allowance for upgrades and does not retain removed work', () => {
    const upgrade: ScenarioOperation = {
      operationId: 'upgrade-1',
      kind: 'upgrade_service',
      serviceId: 'existing',
      targetSubtype: 'hospital'
    };
    const costs = calculateProposalCosts([upgrade], [service()]);
    expect(costs.capital).toBe(120_000_000);
    expect(costs.annual).toBe(20_000_000);
    expect(costs.withinBudget).toBe(false);
    const removed = calculateProposalCosts(
      [upgrade, { operationId: 'delete-1', kind: 'delete_service', serviceId: 'existing' }],
      [service()]
    );
    expect(removed.capital).toBe(0);
    expect(removed.annual).toBe(0);
  });

  it('labels downgrades accurately and keeps an unsupported conversion unpriced', () => {
    const school = { ...service(), serviceType: 'education' as const, subtype: 'high_school', name: 'Existing school' };
    const costs = calculateProposalCosts(
      [{ operationId: 'downgrade-school', kind: 'downgrade_service', serviceId: school.id, targetSubtype: 'school' }],
      [school]
    );
    expect(costs.items).toHaveLength(1);
    expect(costs.items[0]).toMatchObject({
      kind: 'downgrade_service',
      label: 'Downgrade Existing school to school',
      capital: 25_000_000,
      annual: 5_000_000,
      costAvailable: true
    });
    expect(costs.items[0]?.basis).toContain('no unverified value of existing assets or operating savings');

    const unpriced = calculateProposalCosts(
      [{ operationId: 'downgrade-health', kind: 'downgrade_service', serviceId: 'existing', targetSubtype: 'clinic' }],
      [service()]
    );
    expect(unpriced.complete).toBe(false);
    expect(unpriced.withinBudget).toBe(false);
    expect(unpriced.items[0]?.basis).toContain('this downgrade');
    expect(unpriced.items[0]?.basis).toContain('no operating savings are inferred');
  });

  it('replaces revised subtype conversion estimates without retaining abandoned transitions', () => {
    const operations: ScenarioOperation[] = [
      { operationId: 'upgrade-1', kind: 'upgrade_service', serviceId: 'existing', targetSubtype: 'hospital' },
      {
        operationId: 'downgrade-1',
        kind: 'downgrade_service',
        serviceId: 'existing',
        targetSubtype: 'health_center',
        estimate: { capital: 8_000_000, annual: 2_000_000, basis: 'Scoped conversion to a health centre' }
      },
      {
        operationId: 'upgrade-2',
        kind: 'upgrade_service',
        serviceId: 'existing',
        targetSubtype: 'hospital',
        estimate: { capital: 20_000_000, annual: 3_000_000, basis: 'Retained building with scoped hospital fit-out' }
      }
    ];
    const downgraded = calculateProposalCosts(operations.slice(0, 2), [service()]);
    expect(downgraded.items).toHaveLength(1);
    expect(downgraded.capital).toBe(8_000_000);
    expect(downgraded.items[0]?.kind).toBe('downgrade_service');
    expect(downgraded.items[0]?.basis).toContain('User supplied project scope');
    expect(downgraded.items[0]?.basis).not.toContain('full replacement');

    const revised = calculateProposalCosts(operations, [service()]);
    expect(revised.items).toHaveLength(1);
    expect(revised.items[0]?.operationId).toBe('upgrade-2');
    expect(revised.capital).toBe(20_000_000);
    expect(revised.annual).toBe(3_000_000);
    expect(revised.tenYear).toBe(50_000_000);
  });

  it('keeps one final facility allowance when an unbuilt addition is upgraded then downgraded', () => {
    const costs = calculateProposalCosts(
      [
        {
          operationId: 'school',
          kind: 'add_service',
          serviceType: 'education',
          subtype: 'school',
          coordinates: [73, 3]
        },
        {
          operationId: 'higher-school',
          kind: 'upgrade_service',
          serviceId: 'draft:school',
          targetSubtype: 'high_school',
          estimate: { capital: 40_000_000, annual: 8_000_000, basis: 'Secondary school construction and staffing' }
        },
        {
          operationId: 'smaller-school',
          kind: 'downgrade_service',
          serviceId: 'draft:school',
          targetSubtype: 'school'
        }
      ],
      []
    );
    expect(costs.items).toHaveLength(1);
    expect(costs.items[0]?.kind).toBe('add_service');
    expect(costs.capital).toBe(25_000_000);
    expect(costs.annual).toBe(5_000_000);
    expect(costs.complete).toBe(true);
  });

  it('keeps unpriced work distinct from free work, even with unlimited money', () => {
    const costs = calculateProposalCosts(
      [{ operationId: 'move', kind: 'move_service', serviceId: 'existing', coordinates: [73.01, 3] }],
      [service()],
      { name: 'Move', capitalLimit: 1e12, annualLimit: 1e12 }
    );
    expect(costs.complete).toBe(false);
    expect(costs.withinBudget).toBe(false);
    expect(costs.items[0]?.costAvailable).toBe(false);
  });

  it('preserves a user scoped estimate and distinguishes it from a retained benchmark', () => {
    const costs = calculateProposalCosts(
      [
        {
          operationId: 'clinic',
          kind: 'add_service',
          serviceType: 'health',
          subtype: 'clinic',
          coordinates: [73, 3],
          estimate: {
            capital: 2_000_000,
            annual: 500_000,
            basis: 'Small leased clinic fit-out and four-person staffing allowance'
          }
        }
      ],
      []
    );
    expect(costs.complete).toBe(true);
    expect(costs.capital).toBe(2_000_000);
    expect(costs.annual).toBe(500_000);
    expect(costs.items[0]?.basis).toContain('User supplied project scope');
    expect(costs.items[0]?.sourceIds).toEqual([]);
  });
});

describe('proposal model and baseline identity', () => {
  it('retains missing demand and pressure as unavailable', () => {
    const result = buildProposalImpact(baseline(), baseline());
    expect(
      result.categories.every((category) => category.beforeDemand === null && category.afterPressure === null)
    ).toBe(true);
    expect(result.limitations.join(' ')).toContain('not unique residents');
    expect(result.limitations.join(' ')).toContain('not measured student places');
  });

  it('counts a downgraded facility as changed without inventing measured education capacity', () => {
    const before = { ...service(), serviceType: 'education' as const, subtype: 'high_school' };
    const after = { ...before, subtype: 'school', change: 'downgraded' as const };
    const result = buildProposalImpact(baseline([before]), baseline([after]));
    expect(result.changedServiceCount).toBe(1);
    expect(result.addedServiceCount).toBe(0);
    expect(result.removedServiceCount).toBe(0);
    expect(result.categories.find((category) => category.category === 'education')).toMatchObject({
      beforeServiceCount: 1,
      afterServiceCount: 1,
      beforePressure: null,
      afterPressure: null
    });
  });

  it('changes the baseline fingerprint when source coordinates change and ignores row order', () => {
    const first = snapshot();
    first.services.push({ ...first.services[0]!, id: 'second' });
    first.population = [
      { islandId: 'island-1', ageCategory: 'children', amount: 100 },
      { islandId: 'island-1', ageCategory: 'adults', amount: 200 }
    ];
    const reversed = { ...first, services: [...first.services].reverse(), population: [...first.population].reverse() };
    expect(proposalBaselineVersion(first)).toBe(proposalBaselineVersion(reversed));
    const changed = structuredClone(first);
    changed.services[0]!.longitude = 73.001;
    expect(proposalBaselineVersion(first)).not.toBe(proposalBaselineVersion(changed));
  });

  it('projects changes without mutating the baseline and rejects duplicate operation identifiers', () => {
    const source = snapshot();
    const original = JSON.stringify(source);
    const stop: ScenarioOperation = {
      operationId: 'add',
      kind: 'add_service',
      serviceType: 'transport',
      subtype: 'bus_stop',
      coordinates: [73, 3]
    };
    const projected = projectScenario(source, source.islands[0]!, 'island-1', [stop]);
    expect(projected.snapshot.services).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(original);
    expect(() => projectScenario(source, source.islands[0]!, 'island-1', [stop, stop])).toThrow('unique identifier');
  });
});

describe('proposal PDF', () => {
  it('writes a real multipage PDF with canonical inputs and evidence attachments', async () => {
    const original = baseline();
    const proposal = { ...DEFAULT_PROPOSAL_SETTINGS, name: 'Hulhumalé review \u0780' };
    const input: ScenarioPreviewRequest = {
      baselineVersion: 'fixture-v1',
      selectedIslandId: 'island-1',
      operations: [],
      proposal
    };
    const preview: ScenarioPreviewResponse = {
      ...original,
      status: 'draft',
      baselineVersion: 'fixture-v1',
      selectedIslandId: 'island-1',
      draftOnly: true,
      persisted: false,
      operations: [],
      serviceChanges: {},
      proposal,
      costs: calculateProposalCosts([], [], proposal),
      impact: buildProposalImpact(original, original),
      transportPlans: []
    };
    const bytes = await buildProposalReport(input, preview);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe(proposal.name);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    const names = pdf.catalog.lookup(PDFName.of('Names'), PDFDict);
    const files = names.lookup(PDFName.of('EmbeddedFiles'), PDFDict).lookup(PDFName.of('Names'), PDFArray);
    const attachments = Array.from({ length: files.size() / 2 }, (_, index) =>
      files.lookup(index * 2, PDFHexString).decodeText()
    );
    expect(attachments).toEqual(['proposal-input.json', 'proposal-evidence.json']);
  });
});
