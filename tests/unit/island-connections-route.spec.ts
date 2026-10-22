import type { IslandConnectionsResponse } from '../../src/lib/mobility/island-connections';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IslandConnectionsNotFoundError } from '../../src/lib/server/scoring/island-connections';
import { GET } from '../../src/routes/api/map/islands/[id]/connections/+server';

const dependencies = vi.hoisted(() => ({ get: vi.fn(), cache: vi.fn(), delay: vi.fn() }));
vi.mock('../../src/lib/server/mobility/api-delay', () => ({ waitForMobilityApiDelay: dependencies.delay }));
vi.mock('../../src/lib/server/mobility/public-map-response', () => ({ publicMapResponse: dependencies.cache }));
vi.mock('../../src/lib/server/scoring/island-connections', () => ({
  getIslandConnections: dependencies.get,
  IslandConnectionsNotFoundError: class extends Error {}
}));

const payload: IslandConnectionsResponse = {
  islandId: 'a',
  islandName: 'Selected',
  center: [73, 3],
  routes: { type: 'FeatureCollection', features: [] },
  inbound: { type: 'FeatureCollection', features: [] },
  summary: { routeCount: 0, inboundSourceCount: 0, mappedInboundSourceCount: 0, maxInboundDemand: 0 },
  limitations: []
};

function request(id: string | undefined) {
  return GET({
    params: { id },
    request: new Request(`http://localhost/api/map/islands/${id ?? ''}/connections`)
  } as Parameters<typeof GET>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.delay.mockResolvedValue(undefined);
  dependencies.get.mockResolvedValue(payload);
  dependencies.cache.mockImplementation(async (_request: Request, _key: string, compute: () => Promise<unknown>) =>
    Response.json(await compute(), { headers: { 'x-mobility-baseline-version': 'fixture' } })
  );
});

describe('public selected island connections endpoint', () => {
  it('uses the baseline response cache and retains the public response shape', async () => {
    const response = await request('a');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get('x-mobility-baseline-version')).toBe('fixture');
    expect(dependencies.cache).toHaveBeenCalledWith(
      expect.any(Request),
      'map/islands/a/connections',
      expect.any(Function)
    );
    expect(dependencies.get).toHaveBeenCalledWith('a');
  });

  it.each(['unknown', undefined])('returns a stable 404 for a missing or unknown island (%s)', async (id) => {
    dependencies.get.mockRejectedValueOnce(new IslandConnectionsNotFoundError('Island was not found.'));
    const response = await request(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Island was not found.' });
    expect(dependencies.get).toHaveBeenCalledWith(id ?? '');
  });

  it('returns a stable error without leaking failure details', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    dependencies.get.mockRejectedValueOnce(new Error('internal calculation failure'));
    try {
      const response = await request('a');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Island connections are unavailable.' });
      expect(errorLog).toHaveBeenCalledOnce();
    } finally {
      errorLog.mockRestore();
    }
  });
});
