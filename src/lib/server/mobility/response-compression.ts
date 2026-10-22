import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

export function acceptsGzip(value: string | null): boolean {
  const encodings = (value ?? '')
    .toLowerCase()
    .split(',')
    .map((part) => part.trim().split(';'));
  const explicit = encodings.find(([name]) => name === 'gzip');
  const selected = explicit ?? encodings.find(([name]) => name === '*');
  return !!selected && !selected.slice(1).some((parameter) => /^q=0(?:\.0*)?$/.test(parameter.trim()));
}

export async function privateJsonResponse(request: Request, payload: unknown, status = 200): Promise<Response> {
  let body: Buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    vary: 'Accept-Encoding'
  });
  if (body.length >= 16_384 && acceptsGzip(request.headers.get('accept-encoding'))) {
    const compressed = await compress(body, { level: 1 });
    if (compressed.length < body.length) {
      body = compressed;
      headers.set('content-encoding', 'gzip');
    }
  }
  headers.set('content-length', String(body.length));
  return new Response(new Uint8Array(body), { status, headers });
}
