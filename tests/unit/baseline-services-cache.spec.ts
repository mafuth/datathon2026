import type { IslandServicesResponse } from '../../src/lib/components/mobility/island-services';
import type { ScoringSnapshot } from '../../src/lib/server/scoring/types';

import { describe, expect, it, vi } from 'vitest';

import { BaselineServicesCache } from '../../src/lib/server/mobility/baseline-services-cache';

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

describe('baseline island services cache', () => {
  it('shares in-flight and completed baseline calculations by immutable snapshot and island', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    const cache = new BaselineServicesCache(compute);
    const source = snapshot();
    const first = cache.get('a', source);
    expect(cache.get('a', source)).toBe(first);
    const baseline = await first;
    expect(await cache.get('a', source)).toBe(baseline);
    await cache.get('b', source);
    await cache.get('a', { ...source });
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('evicts rejected calculations and retries them', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    compute.mockRejectedValueOnce(new Error('source unavailable'));
    const cache = new BaselineServicesCache(compute);
    const source = snapshot();
    await expect(cache.get('a', source)).rejects.toThrow('source unavailable');
    expect((await cache.get('a', source)).island.id).toBe('a');
    await cache.get('a', source);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('evicts least recently used entries at the entry limit', async () => {
    const compute = vi.fn(async (id: string) => result(id));
    const cache = new BaselineServicesCache(compute, { maxEntries: 2, maxBytes: 100_000 });
    const source = snapshot();
    await cache.get('a', source);
    await cache.get('b', source);
    await cache.get('a', source);
    await cache.get('c', source);
    await cache.get('a', source);
    expect(compute).toHaveBeenCalledTimes(3);
    await cache.get('b', source);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('enforces the serialized byte budget and avoids retaining oversized results', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(result('a')));
    const compute = vi.fn(async (id: string) => result(id, id === 'large' ? 'x'.repeat(bytes * 4) : ''));
    const cache = new BaselineServicesCache(compute, { maxEntries: 8, maxBytes: bytes + 10 });
    const source = snapshot();
    await cache.get('a', source);
    await cache.get('b', source);
    await cache.get('b', source);
    expect(compute).toHaveBeenCalledTimes(2);
    await cache.get('a', source);
    expect(compute).toHaveBeenCalledTimes(3);
    await cache.get('large', source);
    await cache.get('large', source);
    await cache.get('a', source);
    expect(compute).toHaveBeenCalledTimes(5);
  });

  it('does not let a late rejected evicted request remove its replacement', async () => {
    let rejectFirst!: (reason: Error) => void;
    const compute = vi.fn((id: string) =>
      id === 'a' && compute.mock.calls.length === 1
        ? new Promise<IslandServicesResponse>((_resolve, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve(result(id))
    );
    const cache = new BaselineServicesCache(compute, { maxEntries: 1, maxBytes: 100_000 });
    const source = snapshot();
    const first = cache.get('a', source);
    const rejected = expect(first).rejects.toThrow('late failure');
    await Promise.resolve();
    await cache.get('b', source);
    const replacement = await cache.get('a', source);
    rejectFirst(new Error('late failure'));
    await rejected;
    expect(await cache.get('a', source)).toBe(replacement);
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
