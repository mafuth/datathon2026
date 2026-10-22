import { describe, expect, it, vi } from 'vitest';

import { createMapDataClient, publicMapPath } from '../../src/lib/mobility/map-data-client';

function snapshot(value: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    headers: {
      'cache-control': 'public, max-age=60, must-revalidate',
      etag: '"snapshot-1"',
      'x-mobility-baseline-version': 'baseline-1',
      ...headers
    }
  });
}

describe('public map snapshot client', () => {
  it('shares concurrent source requests and parsed values when revisiting an island', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(snapshot({ island: 'a' }));
    const client = createMapDataClient({ fetcher });
    const [first, second] = await Promise.all([
      client.request('/api/map/islands/a/services'),
      client.request('/api/map/islands/a/services')
    ]);
    const revisit = await client.request('/api/map/islands/a/services');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(revisit).toBe(first);
  });

  it('revalidates expired bodies with their ETag, reusing parsed JSON on 304', async () => {
    let clock = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ island: 'a' }, { age: '59' }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { 'cache-control': 'public, max-age=60' } }));
    const client = createMapDataClient({ fetcher, now: () => clock });
    const first = await client.request('/api/map/islands');
    clock = 999;
    expect(await client.request('/api/map/islands')).toBe(first);
    clock = 1000;
    expect(await client.request('/api/map/islands')).toBe(first);
    expect(fetcher).toHaveBeenLastCalledWith('/api/map/islands', {
      cache: 'no-cache',
      headers: { 'If-None-Match': '"snapshot-1"' }
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shares and revalidates connection geometry, clearing it when the baseline is invalidated', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ connections: ['ferry'] }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { 'cache-control': 'public, max-age=60' } }))
      .mockResolvedValueOnce(snapshot({ connections: ['ferry', 'flight'] }));
    const client = createMapDataClient({ fetcher });
    const path = '/api/map/islands/a/connections';
    const [first, concurrent] = await Promise.all([client.request(path), client.request(path)]);
    expect(concurrent).toBe(first);
    expect(await client.request(path)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await client.request(path, { refresh: true })).toBe(first);
    expect(fetcher).toHaveBeenLastCalledWith(path, {
      cache: 'no-cache',
      headers: { 'If-None-Match': '"snapshot-1"' }
    });
    client.invalidate();
    expect(await client.request(path)).toEqual({ connections: ['ferry', 'flight'] });
    expect(fetcher).toHaveBeenLastCalledWith(path, { cache: 'no-cache', headers: undefined });
    expect(publicMapPath(`${path}?live=true`)).toBeNull();
  });

  it('honors no-store and no-cache instead of extending freshness locally', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ sequence: 1 }, { 'cache-control': 'no-store' }))
      .mockResolvedValueOnce(snapshot({ sequence: 2 }, { 'cache-control': 'no-cache' }))
      .mockResolvedValueOnce(snapshot({ sequence: 3 }));
    const client = createMapDataClient({ fetcher });
    expect(await client.request('/api/map/analytics')).toEqual({ sequence: 1 });
    expect(await client.request('/api/map/analytics')).toEqual({ sequence: 2 });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toBeUndefined();
    expect(await client.request('/api/map/analytics')).toEqual({ sequence: 3 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not extend a native HTTP cache hit beyond its original Date freshness', async () => {
    let clock = 59_000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ score: 1 }, { date: 'Thu, 01 Jan 1970 00:00:00 GMT' }))
      .mockResolvedValueOnce(snapshot({ score: 2 }, { date: 'Thu, 01 Jan 1970 00:01:00 GMT' }));
    const client = createMapDataClient({ fetcher, now: () => clock });
    const original = await client.request('/api/map/analytics');
    clock = 59_999;
    expect(await client.request('/api/map/analytics')).toBe(original);
    clock = 60_000;
    expect(await client.request('/api/map/analytics')).toEqual({ score: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('invalidates other sources when the baseline changes and bypasses fresh HTTP entries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ score: 1 }))
      .mockResolvedValueOnce(snapshot({ island: 'a' }, { 'x-mobility-baseline-version': 'baseline-2' }))
      .mockResolvedValueOnce(snapshot({ score: 2 }, { 'x-mobility-baseline-version': 'baseline-2' }));
    const client = createMapDataClient({ fetcher });
    const changed = vi.fn();
    client.subscribeInvalidation(changed);
    await client.request('/api/map/analytics');
    await client.request('/api/map/islands');
    expect(await client.request('/api/map/analytics')).toEqual({ score: 2 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[2]?.[1]?.cache).toBe('no-cache');
    expect(fetcher.mock.calls[2]?.[1]?.headers).toBeUndefined();
  });

  it('never lets an older in-flight response repopulate a changed baseline', async () => {
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ profile: 'a' }))
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(snapshot({ islands: 2 }, { 'x-mobility-baseline-version': 'baseline-2' }))
      .mockResolvedValueOnce(snapshot({ score: 2 }, { 'x-mobility-baseline-version': 'baseline-2' }));
    const client = createMapDataClient({ fetcher });
    await client.request('/api/map/islands/a/profile');
    const analytics = client.request('/api/map/analytics');
    await client.request('/api/map/islands');
    resolveOld(snapshot({ score: 1 }));
    expect(await analytics).toEqual({ score: 2 });
    expect(await client.request('/api/map/analytics')).toEqual({ score: 2 });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('propagates failures without returning stale data and permits a retry', async () => {
    let clock = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(snapshot({ score: 1 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(snapshot({ score: 2 }));
    const client = createMapDataClient({ fetcher, now: () => clock });
    await client.request('/api/map/analytics');
    clock = 60_000;
    await expect(client.request('/api/map/analytics')).rejects.toThrow('503');
    expect(await client.request('/api/map/analytics')).toEqual({ score: 2 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('keeps parsed cache memory bounded, evicting the least recently used island', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => snapshot({ island: 'a' }));
    const client = createMapDataClient({ fetcher, maxEntries: 2 });
    await client.request('/api/map/islands/a/profile');
    await client.request('/api/map/islands/b/profile');
    await client.request('/api/map/islands/a/profile');
    await client.request('/api/map/islands/c/profile');
    await client.request('/api/map/islands/b/profile');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('does not retain a snapshot larger than the memory budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => snapshot({ big: 'x'.repeat(100) }));
    const client = createMapDataClient({ fetcher, maxBytes: 100 });
    await client.request('/api/map/islands');
    await client.request('/api/map/islands');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps live and scenario reads independent and fresh', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => snapshot({ scenario: 'fresh' }));
    const client = createMapDataClient({ fetcher });
    await Promise.all([client.request('/api/v1/scenarios/preview'), client.request('/api/v1/scenarios/preview')]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, options]) => options?.cache === 'no-store')).toBe(true);
    expect(publicMapPath('/api/map/islands?detail=true')).toBe('/api/map/islands?detail=true');
    expect(publicMapPath('/api/map/islands?live=true')).toBeNull();
  });
});
