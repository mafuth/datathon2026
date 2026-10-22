import type { IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type { ScenarioPreviewRequest } from '../../src/lib/mobility/scenario-contracts';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PROPOSAL_SETTINGS } from '../../src/lib/mobility/proposal-planning';
import { MobilityFacade } from '../../src/lib/server/mobility/mobility-facade';
import { proposalBaselineVersion } from '../../src/lib/server/mobility/proposal-baseline';
import { projectScenario } from '../../src/lib/server/mobility/scenario-engine';

const dependencies = vi.hoisted(() => ({ context: vi.fn(), snapshot: vi.fn(), services: vi.fn() }));
vi.mock('$lib/server/scoring/database-input', () => ({
  loadScoringSnapshot: dependencies.snapshot,
  loadIslandContext: dependencies.context
}));
vi.mock('$lib/server/scoring/island-services', () => ({
  getIslandServices: dependencies.services,
  IslandServicesNotFoundError: class extends Error {}
}));

let source: ScoringSnapshot;
let baseline: IslandServicesResponse;
let input: ScenarioPreviewRequest;

beforeEach(() => {
  vi.clearAllMocks();
  source = {
    islands: [
      {
        id: 'island-1',
        name: 'Island',
        islandType: 'inhabited',
        atollId: 'atoll-1',
        latitude: 3,
        longitude: 73,
        landAreaKm2: 1,
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
    services: [],
    population: [],
    vehicleCounts: [],
    connections: [],
    routes: [],
    transportStops: [],
    routeStops: [],
    residentialDemandPoints: []
  };
  baseline = {
    status: 'partial',
    island: { id: 'island-1', name: 'Island', atollName: 'Atoll', centroid: [73, 3] },
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
    limitations: ['Source qualification']
  };
  input = { selectedIslandId: 'island-1', baselineVersion: proposalBaselineVersion(source), operations: [] };
  dependencies.snapshot.mockResolvedValue(source);
  dependencies.context.mockResolvedValue({ island: source.islands[0], atollName: 'Atoll' });
  dependencies.services.mockResolvedValue(baseline);
});

describe('proposal baseline calculation reuse', () => {
  it('shares the baseline between detail loading and an empty preview with equivalent projected data', async () => {
    const facade = new MobilityFacade();
    const before = JSON.stringify(source);
    const detail = await facade.getIslandServices('island-1');
    const preview = await facade.previewScenario(input);
    expect(projectScenario(source, source.islands[0], 'island-1', []).snapshot).toEqual(source);
    expect(preview).toMatchObject({
      status: 'draft',
      draftOnly: true,
      persisted: false,
      selectedIslandId: 'island-1',
      baselineVersion: detail.baselineVersion,
      island: baseline.island,
      services: baseline.services,
      hexes: baseline.hexes,
      summary: baseline.summary,
      operations: [],
      serviceChanges: {},
      transportPlans: [],
      proposal: DEFAULT_PROPOSAL_SETTINGS,
      costs: { capital: 0, annual: 0, complete: true, withinBudget: true }
    });
    expect(preview.limitations).toEqual([
      ...baseline.limitations,
      'Draft changes do not update the server baseline. Saved drafts remain in this browser.',
      'Draft scoring remains a partial planning estimate and is not an approved policy score.'
    ]);
    expect(dependencies.services).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('coalesces empty previews and reuses identical computed projections while refreshing settings and costs', async () => {
    const facade = new MobilityFacade();
    await Promise.all([facade.previewScenario(input), facade.previewScenario(input)]);
    expect(dependencies.services).toHaveBeenCalledTimes(1);
    const draft: ScenarioPreviewRequest = {
      ...input,
      operations: [
        {
          operationId: 'new-stop',
          kind: 'add_service',
          serviceType: 'transport',
          subtype: 'bus_stop',
          coordinates: [73, 3]
        }
      ]
    };
    const first = await facade.previewScenario(draft);
    const changedSettings = { ...DEFAULT_PROPOSAL_SETTINGS, name: 'Revised proposal', capitalLimit: 1 };
    const second = await facade.previewScenario({ ...draft, proposal: changedSettings });
    expect(dependencies.services).toHaveBeenCalledTimes(2);
    expect(dependencies.services.mock.calls[1][1]).not.toBe(source);
    expect(first.costs.withinBudget).toBe(true);
    expect(second.costs.withinBudget).toBe(false);
    expect(second.proposal).toEqual(changedSettings);
    expect(second.hexes).toBe(first.hexes);
    expect(second.impact).toEqual(first.impact);
    expect(second.operations).toEqual(first.operations);
    expect(dependencies.context).toHaveBeenCalledWith('island-1');
    await expect(
      facade.previewScenario({
        ...draft,
        operations: [{ ...draft.operations[0], coordinates: [74, 3] } as ScenarioPreviewRequest['operations'][number]]
      })
    ).rejects.toMatchObject({ code: 'ADD_OUTSIDE_ISLAND' });
    expect(dependencies.services).toHaveBeenCalledTimes(2);
    expect(source.services).toEqual([]);
  });

  it('invalidates baseline reuse for a fresh snapshot and rejects stale proposal revisions', async () => {
    const facade = new MobilityFacade();
    await facade.getIslandServices('island-1');
    const revised = { ...source, population: [{ islandId: 'island-1', ageCategory: 'total', amount: 100 }] };
    dependencies.snapshot.mockResolvedValue(revised);
    await expect(facade.previewScenario(input)).rejects.toMatchObject({
      code: 'BASELINE_VERSION_MISMATCH',
      status: 409
    });
    await facade.previewScenario({ ...input, baselineVersion: proposalBaselineVersion(revised) });
    expect(dependencies.services).toHaveBeenCalledTimes(2);
  });

  it('retries baseline failures without caching the failed preview', async () => {
    const facade = new MobilityFacade();
    dependencies.services.mockRejectedValueOnce(new Error('baseline unavailable'));
    await expect(facade.previewScenario(input)).rejects.toThrow('baseline unavailable');
    const recovered = await facade.previewScenario(input);
    expect(recovered.status).toBe('draft');
    expect(dependencies.services).toHaveBeenCalledTimes(2);
  });
});
