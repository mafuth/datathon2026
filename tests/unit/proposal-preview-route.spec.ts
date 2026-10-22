import type { RequestHandler } from '@sveltejs/kit';

import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

import { POST } from '../../src/routes/api/v1/scenarios/preview/+server';

const preview = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/mobility/mobility-facade', () => ({ mobilityFacade: { previewScenario: preview } }));

const input = { baselineVersion: 'fixture-v1', selectedIslandId: 'island-1', operations: [] };
function event(body: string, encoding = 'gzip'): Parameters<RequestHandler>[0] {
  return {
    request: new Request('http://localhost/api/v1/scenarios/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': encoding },
      body
    })
  } as Parameters<RequestHandler>[0];
}

describe('private canonical proposal preview response', () => {
  beforeEach(() => {
    preview.mockReset();
  });

  it('validates malformed and invalid requests before computing, retaining private stable errors', async () => {
    for (const body of ['{', JSON.stringify({ ...input, operations: 'invalid' })]) {
      const response = await POST(event(body));
      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect((await response.json()).code).toBe('INVALID_INPUT');
    }
    expect(preview).not.toHaveBeenCalled();
  });

  it('negotiates compression of the canonical result and strips client-computed fields', async () => {
    const result = {
      status: 'draft',
      draftOnly: true,
      persisted: false,
      evidence: 'Hulhumalé native evidence '.repeat(2000)
    };
    preview.mockResolvedValue(result);
    const response = await POST(event(JSON.stringify({ ...input, costs: { capital: 0, withinBudget: true } })));
    expect(preview).toHaveBeenCalledExactlyOnceWith(input);
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8'))).toEqual(result);
  });

  it.each([
    ['ISLAND_NOT_FOUND', 404],
    ['BASELINE_VERSION_MISMATCH', 409],
    ['ADD_OUTSIDE_ISLAND', 422]
  ] as const)('keeps %s errors stable and private', async (code, status) => {
    preview.mockRejectedValue(new ScenarioDomainError(code, 'Review the current proposal.', status));
    const response = await POST(event(JSON.stringify(input)));
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ code, error: 'Review the current proposal.' });
  });
});
