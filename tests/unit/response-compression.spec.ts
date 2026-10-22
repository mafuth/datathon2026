import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { acceptsGzip, privateJsonResponse } from '../../src/lib/server/mobility/response-compression';

const request = (encoding?: string) =>
  new Request('http://localhost/api/v1/scenarios/preview', {
    method: 'POST',
    headers: encoding ? { 'accept-encoding': encoding } : {}
  });
const payload = {
  name: 'Hulhumalé accessibility proposal',
  features: Array.from({ length: 500 }, (_, index) => ({
    type: 'Feature',
    id: index,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [73.5, 4.2],
          [73.501, 4.2],
          [73.501, 4.201],
          [73.5, 4.2]
        ]
      ]
    },
    properties: { healthWeight: 0.125, educationWeight: 0.25, transportWeight: 0.5 }
  }))
};

describe('private proposal JSON compression', () => {
  it('negotiates gzip while respecting explicit exclusions over wildcard support', () => {
    for (const value of ['gzip', 'br, GZIP;q=0.5', '*', 'gzip;q=1, *;q=0']) expect(acceptsGzip(value)).toBe(true);
    for (const value of [null, '', 'br', 'gzip;q=0', 'gzip;q=0.00, *;q=1', '*;q=0'])
      expect(acceptsGzip(value)).toBe(false);
  });

  it('compresses a large private preview without changing any canonical JSON or caching it publicly', async () => {
    const original = JSON.stringify(payload);
    const response = await privateJsonResponse(request('gzip, br'), payload);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
    expect(response.headers.has('etag')).toBe(false);
    expect(gunzipSync(bytes).toString('utf8')).toBe(original);
    expect(bytes.length).toBeLessThan(Buffer.byteLength(original) / 4);
  });

  it('keeps uncompressed clients and small stable error responses intact and private', async () => {
    const plain = await privateJsonResponse(request('gzip;q=0, *;q=1'), payload);
    expect(plain.headers.has('content-encoding')).toBe(false);
    expect(await plain.json()).toEqual(payload);
    const error = { code: 'INVALID_INPUT', error: 'Scenario preview input is invalid.' };
    const small = await privateJsonResponse(request('gzip'), error, 400);
    expect(small.status).toBe(400);
    expect(small.headers.has('content-encoding')).toBe(false);
    expect(small.headers.get('cache-control')).toBe('private, no-store');
    expect(await small.json()).toEqual(error);
  });
});
