import type { PublicResponseCache } from '../../src/lib/server/mobility/public-response-cache';

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicMapResponse } from '../../src/lib/server/mobility/public-map-response';

const dependencies = vi.hoisted(() => ({
  sourceVersion: vi.fn(),
  cache: null as PublicResponseCache | null
}));

vi.mock('../../src/lib/server/scoring/database-input', () => ({
  getScoringSourceVersion: dependencies.sourceVersion
}));
vi.mock('../../src/lib/server/mobility/public-response-cache', () => ({
  publicResponseCache: {
    response: (...args: Parameters<PublicResponseCache['response']>) => {
      if (!dependencies.cache) throw new Error('Test response cache is not configured.');
      return dependencies.cache.response(...args);
    }
  }
}));

let directory: string;
let Cache: typeof PublicResponseCache;
const request = () => new Request('http://localhost/api/map/islands');

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'datathon-public-map-'));
  ({ PublicResponseCache: Cache } = await vi.importActual<
    typeof import('../../src/lib/server/mobility/public-response-cache')
  >('../../src/lib/server/mobility/public-response-cache'));
  dependencies.cache = new Cache({ directory, modelVersion: 'wrapper-test-model' });
  dependencies.sourceVersion.mockReset().mockResolvedValue('source-v1');
});

afterEach(async () => {
  dependencies.cache = null;
  await rm(directory, { recursive: true, force: true });
});

describe('public map responses during source updates', () => {
  it('discards the changed-source calculation and persists only the retried current result', async () => {
    dependencies.sourceVersion
      .mockResolvedValue('source-v2')
      .mockResolvedValueOnce('source-v1')
      .mockResolvedValueOnce('source-v2');
    const compute = vi.fn().mockResolvedValueOnce({ score: 12 }).mockResolvedValue({ score: 34 });

    const response = await publicMapResponse(request(), 'map/islands', compute);
    expect(await response.json()).toEqual({ score: 34 });
    expect(response.headers.get('x-mobility-baseline-version')).toBe('source-v2');
    expect(compute).toHaveBeenCalledTimes(2);
    expect(await readdir(directory)).toHaveLength(1);

    // A fresh cache instance proves the discarded revision was never written to disk.
    const reloaded = new Cache({ directory, modelVersion: 'wrapper-test-model' });
    const oldRevision = vi.fn(async () => ({ score: 56 }));
    const old = await reloaded.response(request(), 'map/islands', 'source-v1', oldRevision);
    expect(await old.json()).toEqual({ score: 56 });
    expect(oldRevision).toHaveBeenCalledOnce();

    const repeated = await publicMapResponse(request(), 'map/islands', compute);
    expect(await repeated.json()).toEqual({ score: 34 });
    expect(repeated.headers.get('server-timing')).toContain('memory');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('bounds repeated source changes at three attempts and returns an uncached retryable 503', async () => {
    for (const revision of ['v1', 'v2', 'v2', 'v3', 'v3', 'v4']) {
      dependencies.sourceVersion.mockResolvedValueOnce(revision);
    }
    const compute = vi.fn(async () => ({ score: 42 }));

    const response = await publicMapResponse(request(), 'map/islands', compute);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('etag')).toBeNull();
    expect(await response.json()).toEqual({ error: 'Source data is being updated. Please retry.' });
    expect(compute).toHaveBeenCalledTimes(3);
    expect(dependencies.sourceVersion).toHaveBeenCalledTimes(6);
    expect(await readdir(directory)).toEqual([]);

    dependencies.sourceVersion.mockResolvedValue('v4');
    const recovered = await publicMapResponse(request(), 'map/islands', compute);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ score: 42 });
    expect(compute).toHaveBeenCalledTimes(4);
    expect(await readdir(directory)).toHaveLength(1);
  });

  it('propagates calculation errors without retrying or retaining a failed cache entry', async () => {
    const failure = new Error('Island services are unavailable');
    const compute = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ score: 42 });

    await expect(publicMapResponse(request(), 'map/islands', compute)).rejects.toBe(failure);
    expect(compute).toHaveBeenCalledOnce();
    expect(dependencies.sourceVersion).toHaveBeenCalledOnce();
    expect(await readdir(directory)).toEqual([]);

    const recovered = await publicMapResponse(request(), 'map/islands', compute);
    expect(await recovered.json()).toEqual({ score: 42 });
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('propagates a version lookup failure before calculating and permits a later recovery', async () => {
    const failure = new Error('Source metadata is unavailable');
    dependencies.sourceVersion.mockRejectedValueOnce(failure);
    const compute = vi.fn(async () => ({ score: 42 }));

    await expect(publicMapResponse(request(), 'map/islands', compute)).rejects.toBe(failure);
    expect(compute).not.toHaveBeenCalled();
    expect(await readdir(directory)).toEqual([]);

    expect(await (await publicMapResponse(request(), 'map/islands', compute)).json()).toEqual({ score: 42 });
    expect(compute).toHaveBeenCalledOnce();
  });

  it('does not publish a calculation if the final source validation fails', async () => {
    const failure = new Error('Source validation is unavailable');
    dependencies.sourceVersion.mockResolvedValueOnce('source-v1').mockRejectedValueOnce(failure);
    const compute = vi.fn(async () => ({ score: 42 }));

    await expect(publicMapResponse(request(), 'map/islands', compute)).rejects.toBe(failure);
    expect(compute).toHaveBeenCalledOnce();
    expect(dependencies.sourceVersion).toHaveBeenCalledTimes(2);
    expect(await readdir(directory)).toEqual([]);

    expect(await (await publicMapResponse(request(), 'map/islands', compute)).json()).toEqual({ score: 42 });
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
