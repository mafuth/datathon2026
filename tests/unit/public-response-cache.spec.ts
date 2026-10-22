import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PublicResponseCache,
  publicResponseModelFingerprint
} from '../../src/lib/server/mobility/public-response-cache';

let directory: string;
const request = (headers?: HeadersInit) => new Request('http://localhost/api/map/analytics', { headers });
const payload = { score: 42, limitations: ['Observed source data'], values: Array(1000).fill('unchanged') };

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'datathon-response-cache-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const cache = (modelVersion = 'model-v1', maxMemoryBytes?: number) =>
  new PublicResponseCache({ directory, modelVersion, maxMemoryBytes });

async function sourceFile(path: string, contents: string) {
  const target = join(directory, path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, contents);
}

describe('public baseline model fingerprint', () => {
  it('identifies both production outputs and ignores uncompiled source edits', async () => {
    await sourceFile('build/server/index.js', 'export const score = 1;');
    await sourceFile('.svelte-kit/output/server/index.js', 'export const score = 1;');
    await sourceFile('src/lib/server/scoring.ts', 'export const score = 1;');
    const fingerprint = () => publicResponseModelFingerprint({ root: directory, production: true });
    const before = await fingerprint();

    await sourceFile('src/lib/server/scoring.ts', 'export const score = 2;');
    expect(await fingerprint()).toBe(before);
    await sourceFile('build/server/index.js', 'export const score = 2;');
    const adapterChanged = await fingerprint();
    expect(adapterChanged).not.toBe(before);
    await sourceFile('.svelte-kit/output/server/index.js', 'export const score = 2;');
    expect(await fingerprint()).not.toBe(adapterChanged);
  });

  it('invalidates production results after manifest and dependency lock changes', async () => {
    await sourceFile('build/server/index.js', 'export const score = 1;');
    await sourceFile('package.json', '{"dependencies":{"drizzle-orm":"1"}}');
    await sourceFile('pnpm-lock.yaml', 'lockfileVersion: 1');
    const fingerprint = () => publicResponseModelFingerprint({ root: directory, production: true });
    const before = await fingerprint();

    await sourceFile('package.json', '{"dependencies":{"drizzle-orm":"2"}}');
    const manifestChanged = await fingerprint();
    expect(manifestChanged).not.toBe(before);
    await sourceFile('pnpm-lock.yaml', 'lockfileVersion: 2');
    expect(await fingerprint()).not.toBe(manifestChanged);
  });

  it('rechecks development sources while ignoring stale compiled outputs', async () => {
    await sourceFile('build/server/index.js', 'export const score = 1;');
    await sourceFile('src/lib/server/scoring.ts', 'export const score = 1;');
    const fingerprint = () => publicResponseModelFingerprint({ root: directory, production: false });
    const before = await fingerprint();

    await sourceFile('build/server/index.js', 'export const score = 2;');
    expect(await fingerprint()).toBe(before);
    await sourceFile('src/lib/server/scoring.ts', 'export const score = 2;');
    expect(await fingerprint()).not.toBe(before);
  });

  it('falls back to available sources when production outputs are absent', async () => {
    await sourceFile('src/lib/server/scoring.ts', 'export const score = 1;');
    const fingerprint = () => publicResponseModelFingerprint({ root: directory, production: true });
    const before = await fingerprint();

    await sourceFile('src/lib/server/scoring.ts', 'export const score = 2;');
    expect(await fingerprint()).not.toBe(before);
  });
});

describe('public baseline response cache', () => {
  it('coalesces concurrent calculations and returns independent responses', async () => {
    const store = cache();
    const compute = vi.fn(async () => payload);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => store.response(request(), 'analytics', 'data-v1', compute))
    );
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(Array(5).fill(payload));
    expect(compute).toHaveBeenCalledTimes(1);
    const hit = await store.response(request(), 'analytics', 'data-v1', compute);
    expect(hit.headers.get('server-timing')).toContain('memory');
    expect(hit.headers.get('x-mobility-baseline-version')).toBe('data-v1');
  });

  it('reuses verified disk results after a process/cache restart', async () => {
    await cache().response(request(), 'analytics', 'data-v1', async () => payload);
    const compute = vi.fn(async () => {
      throw new Error('Should already be precomputed');
    });
    const hit = await cache().response(request(), 'analytics', 'data-v1', compute);
    expect(await hit.json()).toEqual(payload);
    expect(hit.headers.get('server-timing')).toContain('disk');
    expect(compute).not.toHaveBeenCalled();
  });

  it('stores the compressed representation and reuses it byte-for-byte after restart', async () => {
    const first = await cache().response(
      request({ 'accept-encoding': 'gzip' }),
      'analytics',
      'data-v1',
      async () => payload
    );
    const original = Buffer.from(await first.arrayBuffer());
    const [file] = (await readdir(directory)).filter((name) => name.endsWith('.json'));
    const stored = await readFile(join(directory, file));
    const split = stored.indexOf(10);
    const metadata = JSON.parse(stored.subarray(0, split).toString());
    expect(metadata.encoding).toBe('gzip');
    expect(stored.subarray(split + 1)).toEqual(original);
    expect(stored.length).toBeLessThan(Buffer.byteLength(JSON.stringify(payload)) / 4);

    const compute = vi.fn(async () => payload);
    const restored = await cache().response(request({ 'accept-encoding': 'gzip' }), 'analytics', 'data-v1', compute);
    expect(Buffer.from(await restored.arrayBuffer())).toEqual(original);
    expect(restored.headers.get('etag')).toBe(first.headers.get('etag'));
    expect(compute).not.toHaveBeenCalled();

    // Existing precomputed plain files stay readable and are upgraded once.
    delete metadata.encoding;
    await writeFile(join(directory, file), `${JSON.stringify(metadata)}\n${JSON.stringify(payload)}`);
    const legacy = await cache().response(request(), 'analytics', 'data-v1', compute);
    expect(await legacy.json()).toEqual(payload);
    const upgraded = await readFile(join(directory, file));
    expect(JSON.parse(upgraded.subarray(0, upgraded.indexOf(10)).toString()).encoding).toBe('gzip');
    expect(compute).not.toHaveBeenCalled();
  });

  it('invalidates results when sources, model code or resource change', async () => {
    const compute = vi.fn(async () => payload);
    const store = cache();
    await store.response(request(), 'overview', 'data-v1', compute);
    await store.response(request(), 'detail', 'data-v1', compute);
    await store.response(request(), 'overview', 'data-v2', compute);
    await cache('model-v2').response(request(), 'overview', 'data-v1', compute);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('rebuilds corrupt disk entries and never caches rejected calculations', async () => {
    const store = cache();
    const compute = vi.fn(async () => payload);
    await store.response(request(), 'analytics', 'data-v1', compute);
    const [file] = await readdir(directory);
    await writeFile(join(directory, file), '{"key":"tampered"}\ninvalid');
    expect(await (await cache().response(request(), 'analytics', 'data-v1', compute)).json()).toEqual(payload);
    const failed = vi.fn(async () => {
      throw new Error('Unavailable');
    });
    await expect(store.response(request(), 'errors', 'data-v1', failed)).rejects.toThrow('Unavailable');
    await expect(store.response(request(), 'errors', 'data-v1', failed)).rejects.toThrow('Unavailable');
    expect(failed).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('negotiates compression and conditional requests without changing the JSON', async () => {
    const store = cache();
    const compute = vi.fn(async () => payload);
    const compressed = await store.response(request({ 'accept-encoding': 'br, gzip' }), 'analytics', 'v1', compute);
    expect(compressed.headers.get('content-encoding')).toBe('gzip');
    expect(JSON.parse(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString())).toEqual(payload);
    const disabled = await store.response(
      request({ 'accept-encoding': 'gzip;q=0, *;q=1' }),
      'analytics',
      'v1',
      compute
    );
    expect(disabled.headers.get('content-encoding')).toBeNull();
    const conditional = await store.response(
      request({ 'if-none-match': compressed.headers.get('etag')! }),
      'analytics',
      'v1',
      compute
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe('');
    expect(conditional.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keeps serving when disk is unavailable and falls back to disk when memory is bounded', async () => {
    const file = join(directory, 'not-a-directory');
    await writeFile(file, 'occupied');
    const unavailable = new PublicResponseCache({ directory: file, modelVersion: 'v1' });
    expect(await (await unavailable.response(request(), 'analytics', 'v1', async () => payload)).json()).toEqual(
      payload
    );
    const bounded = cache('model-v1', 1);
    const compute = vi.fn(async () => payload);
    await bounded.response(request(), 'analytics', 'v1', compute);
    const hit = await bounded.response(request(), 'analytics', 'v1', compute);
    expect(hit.headers.get('server-timing')).toContain('disk');
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
