import type { IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type { ScenarioOperation } from '../../src/lib/mobility/scenario-contracts';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it, vi } from 'vitest';

import { ProposalProjectionCache } from '../../src/lib/server/mobility/proposal-projection-cache';

const snapshot = (): ScoringSnapshot => ({
  islands: [],
  population: [],
  vehicleCounts: [],
  services: [],
  connections: [],
  routes: [],
  transportStops: [],
  routeStops: []
});
const addition: ScenarioOperation = {
  operationId: 'new-stop',
  kind: 'add_service',
  serviceType: 'transport',
  subtype: 'bus_stop',
  coordinates: [73, 3]
};
function result(id: string, padding = ''): IslandServicesResponse {
  return {
    status: 'partial',
    island: { id, name: id, atollName: 'Atoll', centroid: [73, 3] },
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
    limitations: [padding]
  };
}

describe('private proposal projection computations', () => {
  it('shares in-flight and completed computations for canonical operations, preserving source inputs', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    const cache = new ProposalProjectionCache(compute);
    const baseline = snapshot();
    const projected = snapshot();
    const original = JSON.stringify({ baseline, projected, addition });
    const first = cache.get('a', baseline, [addition], projected);
    const reordered: ScenarioOperation = {
      coordinates: [73, 3],
      subtype: 'bus_stop',
      serviceType: 'transport',
      kind: 'add_service',
      operationId: 'new-stop'
    };

    expect(cache.get('a', baseline, [reordered], snapshot())).toBe(first);
    expect(await cache.get('a', baseline, [{ ...addition }], snapshot())).toBe(await first);
    expect(compute).toHaveBeenCalledExactlyOnceWith('a', projected);
    expect(JSON.stringify({ baseline, projected, addition })).toBe(original);
  });

  it('invalidates for new baseline identity, island, operation order, coordinates and scoped estimates', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    const cache = new ProposalProjectionCache(compute, { maxEntries: 20, maxBytes: 100_000 });
    const baseline = snapshot();
    const second: ScenarioOperation = { ...addition, operationId: 'second' };
    await cache.get('a', baseline, [addition], snapshot());
    await cache.get('a', { ...baseline }, [addition], snapshot());
    await cache.get('b', baseline, [addition], snapshot());
    await cache.get('a', baseline, [{ ...addition, coordinates: [73.001, 3] }], snapshot());
    await cache.get(
      'a',
      baseline,
      [{ ...addition, estimate: { capital: 10, annual: 1, basis: 'Scoped work' } }],
      snapshot()
    );
    await cache.get('a', baseline, [addition, second], snapshot());
    await cache.get('a', baseline, [second, addition], snapshot());
    expect(compute).toHaveBeenCalledTimes(7);
  });

  it('retries rejected projections and does not reuse failed results', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    compute.mockRejectedValueOnce(new Error('projection unavailable'));
    const cache = new ProposalProjectionCache(compute);
    const baseline = snapshot();
    await expect(cache.get('a', baseline, [addition], snapshot())).rejects.toThrow('projection unavailable');
    const recovered = await cache.get('a', baseline, [addition], snapshot());
    expect(await cache.get('a', baseline, [addition], snapshot())).toBe(recovered);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('evicts the least recently used computation at the entry limit', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    const cache = new ProposalProjectionCache(compute, { maxEntries: 2, maxBytes: 100_000 });
    const baseline = snapshot();
    for (const id of ['a', 'b', 'a', 'c', 'a']) await cache.get(id, baseline, [addition], snapshot());
    expect(compute).toHaveBeenCalledTimes(3);
    await cache.get('b', baseline, [addition], snapshot());
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('bounds retained bytes and does not retain oversized results', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(result('a')));
    const compute = vi.fn(async (id: string) => result(id, id === 'large' ? 'x'.repeat(bytes * 4) : ''));
    const cache = new ProposalProjectionCache(compute, { maxEntries: 8, maxBytes: bytes + 10 });
    const baseline = snapshot();
    for (const id of ['a', 'b', 'b', 'a', 'large', 'large', 'a']) await cache.get(id, baseline, [addition], snapshot());
    expect(compute).toHaveBeenCalledTimes(5);
  });

  it('keeps a replacement cached when an evicted request fails late', async () => {
    let rejectFirst!: (reason: Error) => void;
    const compute = vi.fn((id: string) =>
      id === 'a' && compute.mock.calls.length === 1
        ? new Promise<IslandServicesResponse>((_resolve, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve(result(id))
    );
    const cache = new ProposalProjectionCache(compute, { maxEntries: 1, maxBytes: 100_000 });
    const baseline = snapshot();
    const first = cache.get('a', baseline, [addition], snapshot());
    const rejected = expect(first).rejects.toThrow('late failure');
    await Promise.resolve();
    await cache.get('b', baseline, [addition], snapshot());
    const replacement = await cache.get('a', baseline, [addition], snapshot());
    rejectFirst(new Error('late failure'));
    await rejected;
    expect(await cache.get('a', baseline, [addition], snapshot())).toBe(replacement);
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
