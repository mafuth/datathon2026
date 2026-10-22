import type { IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type {
  ScenarioOperation,
  ScenarioPreviewRequest,
  ScenarioPreviewResponse
} from '../../src/lib/mobility/scenario-contracts';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProposalWorkspace,
  withoutProposalOperation
} from '../../src/lib/components/mobility/proposal-workspace.svelte';
import {
  buildProposalImpact,
  calculateProposalCosts,
  DEFAULT_PROPOSAL_SETTINGS
} from '../../src/lib/mobility/proposal-planning';

const baseline: IslandServicesResponse = {
  status: 'partial',
  baselineVersion: 'fixture-v1',
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
  limitations: ['Fixture model']
};

const addition: ScenarioOperation = {
  operationId: 'add-1',
  kind: 'add_service',
  serviceType: 'transport',
  subtype: 'bus_stop',
  coordinates: [73, 3]
};

const islandGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [72.99, 2.99],
      [73.01, 2.99],
      [73.01, 3.01],
      [72.99, 3.01],
      [72.99, 2.99]
    ]
  ]
};

function preview(input: ScenarioPreviewRequest): ScenarioPreviewResponse {
  const proposal = input.proposal ?? DEFAULT_PROPOSAL_SETTINGS;
  return {
    ...baseline,
    status: 'draft',
    draftOnly: true,
    persisted: false,
    baselineVersion: input.baselineVersion,
    selectedIslandId: input.selectedIslandId,
    proposal,
    costs: calculateProposalCosts(input.operations, baseline.services, proposal),
    impact: buildProposalImpact(baseline, baseline),
    transportPlans: [],
    serviceChanges: {},
    operations: input.operations.map((operation) => ({
      operationId: operation.operationId,
      kind: operation.kind,
      serviceId: 'serviceId' in operation ? operation.serviceId : `draft:${operation.operationId}`,
      status: 'applied',
      message: 'Draft change evaluated'
    }))
  };
}

function body(init: RequestInit | undefined): ScenarioPreviewRequest {
  return JSON.parse(String(init?.body)) as ScenarioPreviewRequest;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

describe('proposal workspace quote and draft lifecycle', () => {
  const fetcher = vi.fn<typeof fetch>();
  const saved = new Map<string, string>();

  beforeEach(() => {
    saved.clear();
    fetcher.mockReset();
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('/transport-options')) {
        return Response.json({
          islandId: baseline.island.id,
          islandName: baseline.island.name,
          busRoutes: [],
          origins: [],
          destinations: [],
          assumptions: []
        });
      }
      return Response.json(preview(body(init)));
    });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not load transport options until the planner is requested', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.open({ ...baseline });

    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/transport-options'))).toHaveLength(0);
    expect(workspace.transportOptions).toBeNull();
    expect(workspace.transportOptionsLoading).toBe(false);
    expect(workspace.reviewCurrent).toBe(true);

    await workspace.retryTransportOptions();

    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/transport-options'))).toHaveLength(1);
    expect(workspace.transportOptions?.islandId).toBe(baseline.island.id);
  });

  it('loads transport geometry for the first bus-stop placement and still snaps it to a route', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    fetcher.mockImplementation(async (url, init) =>
      String(url).includes('/transport-options')
        ? Response.json({
            islandId: baseline.island.id,
            islandName: baseline.island.name,
            busRoutes: [
              {
                id: 'route-1',
                name: 'Main road',
                distanceKm: 1,
                stopCount: 2,
                geometry: {
                  type: 'MultiLineString',
                  coordinates: [
                    [
                      [72.99, 3],
                      [73.01, 3]
                    ]
                  ]
                }
              }
            ],
            origins: [],
            destinations: [],
            assumptions: []
          })
        : Response.json(preview(body(init)))
    );

    await workspace.stage({ ...addition, coordinates: [73, 3.0001] }, 'Add a stop');

    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/transport-options'))).toHaveLength(1);
    const operation = workspace.staged?.operations.at(-1);
    expect(operation?.kind).toBe('add_service');
    if (operation?.kind === 'add_service') {
      expect(operation.coordinates[0]).toBeCloseTo(73, 8);
      expect(operation.coordinates[1]).toBeCloseTo(3, 8);
    }
    expect(workspace.staged?.label).toContain('snapped');
    expect(workspace.pendingPlacement?.allowed).toBe(true);
  });

  it('shows the dropped bus-stop location before route geometry loads and preserves it on a loading failure', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const transport = deferred<Response>();
    fetcher.mockImplementationOnce(async () => transport.promise);
    const staging = workspace.stage(addition, 'Add a stop');

    expect(workspace.pendingPlacement?.coordinates).toEqual(addition.coordinates);
    expect(workspace.pendingPlacement?.checking).toBe(true);
    expect(workspace.staged?.preview).toBeNull();
    transport.resolve(new Response(null, { status: 503 }));
    await staging;

    expect(workspace.pendingPlacement?.coordinates).toEqual(addition.coordinates);
    expect(workspace.pendingPlacement?.checking).toBe(false);
    expect(workspace.pendingPlacement?.error).toContain('could not be loaded');
    expect(workspace.confirm()).toBe(false);
    expect(workspace.operations).toEqual([]);
  });

  it('does not restore a canceled dropped point when its route response finishes late', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const transport = deferred<Response>();
    fetcher.mockImplementationOnce(async () => transport.promise);
    const staging = workspace.stage(addition, 'Add a stop');
    expect(workspace.pendingPlacement?.checking).toBe(true);
    workspace.cancel();
    transport.resolve(
      Response.json({ islandId: baseline.island.id, busRoutes: [], origins: [], destinations: [], assumptions: [] })
    );
    await staging;

    expect(workspace.staged).toBeNull();
    expect(workspace.pending).toBe(false);
    expect(workspace.operations).toEqual([]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(1);
  });

  it('does not restore a dropped point from an island whose route load finished after switching islands', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const transport = deferred<Response>();
    fetcher.mockImplementationOnce(async () => transport.promise);
    const staging = workspace.stage(addition, 'Add a stop');
    await workspace.open({ ...baseline, island: { ...baseline.island, id: 'island-2' } });
    transport.resolve(
      Response.json({ islandId: baseline.island.id, busRoutes: [], origins: [], destinations: [], assumptions: [] })
    );
    await staging;

    expect(workspace.baseline?.island.id).toBe('island-2');
    expect(workspace.staged).toBeNull();
    expect(workspace.pending).toBe(false);
    expect(workspace.operations).toEqual([]);
    expect(workspace.accepted?.selectedIslandId).toBe('island-2');
  });

  it('reopens an unchanged accepted draft without refetching or replacing its current quote', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.stage(addition, 'Add a stop');
    expect(workspace.confirm()).toBe(true);
    const accepted = workspace.accepted;
    const calls = fetcher.mock.calls.length;

    workspace.suspend();
    await workspace.open({ ...baseline });

    expect(fetcher.mock.calls.length).toBe(calls);
    expect(workspace.accepted).toBe(accepted);
    expect(workspace.operations).toEqual([addition]);
    expect(workspace.history).toEqual([[]]);
    expect(workspace.reviewCurrent).toBe(true);
  });

  it('shares an initial preview across simultaneous openings and does not abort it', async () => {
    const response = deferred<Response>();
    let submitted!: ScenarioPreviewRequest;
    let signal!: AbortSignal;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('/transport-options')) {
        return Response.json({
          islandId: baseline.island.id,
          busRoutes: [],
          origins: [],
          destinations: [],
          assumptions: []
        });
      }
      submitted = body(init);
      signal = init!.signal!;
      return response.promise;
    });
    const workspace = new ProposalWorkspace();
    const first = workspace.open(baseline);
    const second = workspace.open({ ...baseline });

    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(1);
    expect(signal.aborted).toBe(false);
    expect(workspace.pending).toBe(true);
    response.resolve(Response.json(preview(submitted)));
    await Promise.all([first, second]);

    expect(workspace.reviewCurrent).toBe(true);
    expect(workspace.error).toBeNull();
  });

  it('shares repeated placement evaluation and keeps it alive when the workspace opens again', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.retryTransportOptions();
    const response = deferred<Response>();
    let submitted!: ScenarioPreviewRequest;
    let signal!: AbortSignal;
    fetcher.mockImplementationOnce(async (_url, init) => {
      submitted = body(init);
      signal = init!.signal!;
      return response.promise;
    });
    const first = workspace.stage(addition, 'Add a stop');
    const second = workspace.stage({ ...addition }, 'My stop');
    await workspace.open(baseline);

    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(2);
    expect(signal.aborted).toBe(false);
    expect(workspace.pendingPlacement?.checking).toBe(true);
    response.resolve(Response.json(preview(submitted)));
    await Promise.all([first, second]);

    expect(workspace.pendingPlacement?.label).toBe('My stop');
    expect(workspace.pendingPlacement?.allowed).toBe(true);
    expect(workspace.confirm()).toBe(true);
    expect(workspace.operations).toEqual([addition]);
    expect(workspace.history).toEqual([[]]);
  });

  it('retries a failed initial preview on reopen and invalidates a quote for revised baseline evidence', async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('/transport-options'))
        return Response.json({
          islandId: baseline.island.id,
          busRoutes: [],
          origins: [],
          destinations: [],
          assumptions: []
        });
      attempts += 1;
      if (attempts === 1) throw new Error('Temporary connection failure');
      return Response.json(preview(body(init)));
    });
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    expect(workspace.current).toBe(false);
    await workspace.open(baseline);
    expect(workspace.reviewCurrent).toBe(true);
    expect(attempts).toBe(2);

    await workspace.open({ ...baseline, baselineVersion: 'fixture-v2' });
    expect(workspace.accepted?.baselineVersion).toBe('fixture-v2');
    expect(workspace.reviewCurrent).toBe(true);
    expect(attempts).toBe(3);
  });

  it('does not reevaluate identical settings for an accepted or pending placement quote', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.retryTransportOptions();
    await workspace.updateSettings({ ...workspace.settings });
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(1);

    const response = deferred<Response>();
    let submitted!: ScenarioPreviewRequest;
    fetcher.mockImplementationOnce(async (_url, init) => {
      submitted = body(init);
      return response.promise;
    });
    const staging = workspace.stage(addition, 'Add a stop');
    const updating = workspace.updateSettings({ ...workspace.settings });
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(2);
    response.resolve(Response.json(preview(submitted)));
    await Promise.all([staging, updating]);
    expect(workspace.pendingPlacement?.allowed).toBe(true);
  });

  it('invalidates a valid staged quote when changed settings fail to refresh and blocks export', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.stage(addition, 'Add a stop');
    expect(workspace.pendingPlacement?.allowed).toBe(true);
    fetcher.mockRejectedValueOnce(new Error('Connection interrupted'));
    await workspace.updateSettings({ ...workspace.settings, capitalLimit: 1 });

    expect(workspace.pending).toBe(false);
    expect(workspace.current).toBe(false);
    expect(workspace.pendingPlacement?.allowed).toBe(false);
    expect(workspace.confirm()).toBe(false);
    expect(workspace.reviewCurrent).toBe(false);
    const calls = fetcher.mock.calls.length;
    await workspace.downloadPdf();
    expect(fetcher.mock.calls.length).toBe(calls);
    expect(workspace.operations).toEqual([]);
    expect(workspace.error).toBe('Connection interrupted');
  });

  it('keeps an over-budget candidate out of accepted operations and the accepted map view', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.updateSettings({ ...workspace.settings, capitalLimit: 100_000 });
    const accepted = workspace.accepted;
    await workspace.stage(addition, 'Add a stop');

    expect(workspace.staged?.preview?.costs.capital).toBe(250_000);
    expect(workspace.pendingPlacement?.allowed).toBe(false);
    expect(workspace.confirm()).toBe(false);
    expect(workspace.accepted).toBe(accepted);
    expect(workspace.display).toBe(accepted);
    expect(workspace.operations).toEqual([]);
  });

  it('rejects a quote for different settings even if its quoted total fits that old budget', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.retryTransportOptions();
    fetcher.mockImplementationOnce(async (_url, init) => {
      const request = body(init);
      return Response.json(preview({ ...request, proposal: { ...workspace.settings, capitalLimit: 99_000_000 } }));
    });
    await workspace.stage(addition, 'Add a stop');
    expect(workspace.staged?.preview?.costs.withinBudget).toBe(true);
    expect(workspace.pendingPlacement?.allowed).toBe(false);
    expect(workspace.confirm()).toBe(false);
  });

  it('ignores a canceled evaluation even when the aborted server response arrives late', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.retryTransportOptions();
    const accepted = workspace.accepted;
    const delayed = deferred<Response>();
    let lateInput: ScenarioPreviewRequest | undefined;
    fetcher.mockImplementationOnce(async (_url, init) => {
      lateInput = body(init);
      return delayed.promise;
    });
    const staging = workspace.stage(addition, 'Add a stop');
    expect(workspace.pending).toBe(true);
    workspace.cancel();
    delayed.resolve(Response.json(preview(lateInput!)));
    await staging;

    expect(workspace.staged).toBeNull();
    expect(workspace.pending).toBe(false);
    expect(workspace.operations).toEqual([]);
    expect(workspace.accepted).toBe(accepted);
    expect(workspace.error).toBeNull();
  });

  it('saves accepted inputs and restores them through a fresh evaluation without changing baseline data', async () => {
    const originalBaseline = JSON.stringify(baseline);
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.stage(addition, 'Add a stop');
    expect(workspace.confirm()).toBe(true);
    expect(workspace.history).toEqual([[]]);
    const stored = JSON.parse(saved.get('mobility-proposal-v1:island-1')!) as ScenarioPreviewRequest;
    expect(stored.operations).toEqual([addition]);
    expect(stored.baselineVersion).toBe(baseline.baselineVersion);
    expect(stored.proposal).toEqual(workspace.settings);

    const restored = new ProposalWorkspace();
    await restored.open(baseline);
    expect(restored.operations).toEqual([addition]);
    expect(restored.reviewCurrent).toBe(true);
    expect(restored.costs?.capital).toBe(250_000);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/scenarios/preview'))).toHaveLength(3);
    expect(JSON.stringify(baseline)).toBe(originalBaseline);
  });

  it('does not restore a saved draft against changed baseline evidence', async () => {
    saved.set(
      'mobility-proposal-v1:island-1',
      JSON.stringify({
        baselineVersion: 'outdated-v0',
        selectedIslandId: 'island-1',
        operations: [addition],
        proposal: DEFAULT_PROPOSAL_SETTINGS
      })
    );
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    expect(workspace.operations).toEqual([]);
    expect(workspace.message).toContain('different baseline data');
    const request = fetcher.mock.calls.find(([url]) => String(url).endsWith('/scenarios/preview'));
    expect(body(request?.[1]).operations).toEqual([]);
  });

  it('clears an earlier suggested package when a fresh search cannot fund any option and keeps the accepted draft reviewable', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.stage(addition, 'Add a stop');
    expect(workspace.confirm()).toBe(true);
    await workspace.suggest(['transport'], islandGeometry);
    expect(workspace.suggestions).toHaveLength(1);
    expect(workspace.staged?.suggestions).toBe(true);
    expect(workspace.suggestionsAllowed).toBe(true);

    await workspace.updateSettings({ ...workspace.settings, capitalLimit: 350_000 });
    expect(workspace.costs?.withinBudget).toBe(true);
    expect(workspace.staged?.preview?.costs.withinBudget).toBe(false);
    const accepted = workspace.accepted;
    const calls = fetcher.mock.calls.length;
    await workspace.suggest(['transport'], islandGeometry);

    expect(workspace.suggestions).toEqual([]);
    expect(workspace.staged).toBeNull();
    expect(workspace.accepted).toBe(accepted);
    expect(workspace.operations).toEqual([addition]);
    expect(workspace.history).toEqual([[]]);
    expect(workspace.display).toBe(accepted);
    expect(workspace.reviewCurrent).toBe(true);
    expect(workspace.confirm()).toBe(false);
    expect(workspace.error).toContain('No supported package fits');
    expect(fetcher.mock.calls.length).toBe(calls);
    expect((JSON.parse(saved.get('mobility-proposal-v1:island-1')!) as ScenarioPreviewRequest).operations).toEqual([
      addition
    ]);
  });

  it('shares one pending transport request between planner calls and repeated opening', async () => {
    const transport = deferred<Response>();
    fetcher.mockImplementation(async (url, init) =>
      String(url).includes('/transport-options') ? transport.promise : Response.json(preview(body(init)))
    );
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const first = workspace.retryTransportOptions();
    const second = workspace.retryTransportOptions();
    await workspace.open(baseline);
    expect(workspace.transportOptionsLoading).toBe(true);
    expect(first).toBe(second);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/transport-options'))).toHaveLength(1);
    transport.resolve(
      Response.json({ islandId: baseline.island.id, busRoutes: [], origins: [], destinations: [], assumptions: [] })
    );
    await first;
    expect(workspace.transportOptions?.islandId).toBe(baseline.island.id);
    expect(workspace.transportOptionsLoading).toBe(false);
  });

  it('discards transport options from the previously selected island even when its response finishes last', async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    fetcher.mockImplementation(async (url, init) =>
      String(url).includes('/transport-options')
        ? String(url).includes('island-1')
          ? old.promise
          : current.promise
        : Response.json(preview(body(init)))
    );
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const oldLoading = workspace.retryTransportOptions();
    const oldSignal = fetcher.mock.calls.find(([url]) => String(url).includes('/transport-options'))?.[1]?.signal;
    await workspace.open({ ...baseline, island: { ...baseline.island, id: 'island-2' } });
    expect(oldSignal?.aborted).toBe(true);
    const currentLoading = workspace.retryTransportOptions();
    current.resolve(
      Response.json({ islandId: 'island-2', busRoutes: [], origins: [], destinations: [], assumptions: [] })
    );
    await currentLoading;
    old.resolve(Response.json({ islandId: 'island-1', busRoutes: [], origins: [], destinations: [], assumptions: [] }));
    await oldLoading;
    expect(workspace.transportOptions?.islandId).toBe('island-2');
    expect(workspace.transportOptionsLoading).toBe(false);
    expect(workspace.transportOptionsError).toBeNull();
  });

  it('exposes a transport failure and lets the planner retry without changing the accepted proposal', async () => {
    let attempts = 0;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).includes('/transport-options')) {
        attempts += 1;
        return attempts === 1
          ? new Response(null, { status: 503 })
          : Response.json({
              islandId: baseline.island.id,
              busRoutes: [],
              origins: [],
              destinations: [],
              assumptions: []
            });
      }
      return Response.json(preview(body(init)));
    });
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.retryTransportOptions();
    expect(workspace.transportOptionsError).toContain('could not be loaded');
    const accepted = workspace.accepted;
    await workspace.retryTransportOptions();
    expect(attempts).toBe(2);
    expect(workspace.transportOptions?.islandId).toBe(baseline.island.id);
    expect(workspace.transportOptionsError).toBeNull();
    expect(workspace.accepted).toBe(accepted);
  });

  it('replaces suggested choices when a manual placement starts without changing accepted operations', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    await workspace.suggest(['transport'], islandGeometry);
    expect(workspace.suggestions).toHaveLength(1);

    await workspace.stage(addition, 'My manual stop');

    expect(workspace.suggestions).toEqual([]);
    expect(workspace.staged?.suggestions).toBe(false);
    expect(workspace.pendingPlacement?.label).toBe('My manual stop');
    expect(workspace.staged?.operations).toEqual([addition]);
    expect(workspace.operations).toEqual([]);
    expect(workspace.suggestionsAllowed).toBe(false);
    expect(workspace.confirm()).toBe(true);
    expect(workspace.operations).toEqual([addition]);
  });

  it.each(['close', 'island', 'baseline'] as const)('cancels a pending PDF export on %s changes', async (change) => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const pending = deferred<Response>();
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement });
    fetcher.mockReturnValueOnce(pending.promise);
    const exporting = workspace.downloadPdf();
    const signal = fetcher.mock.calls.at(-1)?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    if (change === 'close') workspace.suspend();
    else
      await workspace.open(
        change === 'island'
          ? { ...baseline, island: { ...baseline.island, id: 'island-2' } }
          : { ...baseline, baselineVersion: 'fixture-v2' }
      );
    expect(signal?.aborted).toBe(true);
    expect(workspace.exporting).toBe(false);
    pending.resolve(new Response('PDF', { headers: { 'content-type': 'application/pdf' } }));
    await exporting;
    expect(createElement).not.toHaveBeenCalled();
    expect(workspace.exportError).toBeNull();
  });

  it('does not download or overwrite a newer export when a canceled PDF body finishes late', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const oldBody = deferred<Blob>();
    const oldResponse = new Response('PDF');
    const readBlob = vi.spyOn(oldResponse, 'blob').mockReturnValue(oldBody.promise);
    fetcher.mockResolvedValueOnce(oldResponse);
    const oldExport = workspace.downloadPdf();
    await Promise.resolve();
    expect(readBlob).toHaveBeenCalledOnce();
    workspace.suspend();
    await workspace.open(baseline);
    const newResponse = deferred<Response>();
    fetcher.mockReturnValueOnce(newResponse.promise);
    const newExport = workspace.downloadPdf();
    oldBody.resolve(new Blob(['old PDF']));
    await oldExport;
    expect(workspace.exporting).toBe(true);
    expect(workspace.exportError).toBeNull();
    workspace.suspend();
    newResponse.resolve(new Response('new PDF'));
    await newExport;
  });

  it('retains the requested PDF filename if proposal settings change during generation', async () => {
    const workspace = new ProposalWorkspace();
    await workspace.open(baseline);
    const response = deferred<Response>();
    fetcher.mockReturnValueOnce(response.promise);
    const link = { href: '', download: '', click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => link) });
    vi.stubGlobal('setTimeout', vi.fn());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proposal');
    const exporting = workspace.downloadPdf();
    const request = body(fetcher.mock.calls.at(-1)?.[1]);
    workspace.settings.name = 'A different name';
    response.resolve(new Response('PDF'));
    await exporting;
    expect(request.proposal?.name).toBe('Hulhumalé access proposal');
    expect(link.download).toBe('Hulhumal-access-proposal.pdf');
    expect(link.click).toHaveBeenCalledOnce();
    expect(workspace.exporting).toBe(false);
  });
});

describe('proposal operation dependencies', () => {
  it('removes operations targeting a discarded draft addition and preserves unrelated changes and its input', () => {
    const operations: ScenarioOperation[] = [
      addition,
      { operationId: 'move', kind: 'move_service', serviceId: 'draft:add-1', coordinates: [73.001, 3] },
      { operationId: 'remove', kind: 'delete_service', serviceId: 'draft:add-1' },
      { operationId: 'other', kind: 'move_service', serviceId: 'existing', coordinates: [73, 3] }
    ];
    const original = JSON.stringify(operations);
    expect(withoutProposalOperation(operations, 'add-1').map((operation) => operation.operationId)).toEqual(['other']);
    expect(withoutProposalOperation(operations, 'move').map((operation) => operation.operationId)).toEqual([
      'add-1',
      'remove',
      'other'
    ]);
    expect(JSON.stringify(operations)).toBe(original);
  });
});
