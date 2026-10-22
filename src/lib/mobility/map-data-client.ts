type CacheEntry = {
  value: unknown;
  etag: string | null;
  expires: number;
  bytes: number;
  cacheControl: string;
};
type Flight = { epoch: number; promise: Promise<unknown> };
type Options = {
  fetcher?: typeof fetch;
  now?: () => number;
  maxBytes?: number;
  maxEntries?: number;
};

/** Only immutable public map snapshots share parsed bodies; scenario/live requests stay independent. */
export function publicMapPath(path: string): string | null {
  const [pathname, query = ''] = path.split('?');
  if (!/^\/api\/map\/(?:analytics|islands(?:\/[^/?]+\/(?:profile|services|connections))?)$/.test(pathname)) return null;
  const parameters = new URLSearchParams(query);
  if ([...parameters].some(([key, value]) => pathname !== '/api/map/islands' || key !== 'detail' || value !== 'true'))
    return null;
  parameters.sort();
  const search = parameters.toString();
  return `${pathname}${search ? `?${search}` : ''}`;
}

export function createMapDataClient({
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  maxBytes = 32 * 1024 * 1024,
  maxEntries = 20
}: Options = {}) {
  const memory = new Map<string, CacheEntry>();
  const flights = new Map<string, Flight>();
  const listeners = new Set<() => void>();
  let bytes = 0;
  let epoch = 0;
  let baselineVersion: string | null = null;

  function invalidate(version: string | null = null): void {
    epoch += 1;
    memory.clear();
    bytes = 0;
    baselineVersion = version;
  }

  function remember(path: string, entry: CacheEntry): void {
    bytes -= memory.get(path)?.bytes ?? 0;
    memory.delete(path);
    if (entry.bytes > maxBytes) return;
    memory.set(path, entry);
    bytes += entry.bytes;
    while (memory.size > maxEntries || bytes > maxBytes) {
      const oldest = memory.keys().next().value;
      if (oldest === undefined) break;
      bytes -= memory.get(oldest)?.bytes ?? 0;
      memory.delete(oldest);
    }
  }

  async function read(path: string, refresh: boolean, requestEpoch: number, retries = 0): Promise<unknown> {
    const previous = memory.get(path);
    const response = await fetcher(path, {
      // Browser HTTP caching persists compressed bytes across reloads, with the server's validators.
      cache: refresh || previous || epoch > 0 ? 'no-cache' : 'default',
      headers: previous?.etag ? { 'If-None-Match': previous.etag } : undefined
    });
    if (requestEpoch !== epoch) {
      if (retries >= 2) throw new Error('Map sources changed while loading. Please retry.');
      return read(path, true, epoch, retries + 1);
    }
    const version = response.headers.get('x-mobility-baseline-version');
    if (version && baselineVersion && version !== baselineVersion) {
      invalidate(version);
      requestEpoch = epoch;
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          console.error('Map source refresh failed.', error);
        }
      }
    } else if (version) baselineVersion = version;

    if (response.status === 304 && !previous) {
      if (retries >= 2) throw new Error('The cached map snapshot is unavailable. Please retry.');
      return read(path, true, epoch, retries + 1);
    }
    if (!response.ok && response.status !== 304)
      throw new Error(`Map data request failed with status ${response.status}`);
    const text = response.status === 304 ? null : await response.text();
    const value: unknown = text === null ? previous!.value : JSON.parse(text);
    if (requestEpoch !== epoch) {
      if (retries >= 2) throw new Error('Map sources changed while loading. Please retry.');
      return read(path, true, epoch, retries + 1);
    }
    const cacheControl =
      response.headers.get('cache-control') ?? (response.status === 304 ? previous?.cacheControl : '') ?? '';
    const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl)?.[1];
    const responseDate = Date.parse(response.headers.get('date') ?? '');
    const apparentAge = Number.isFinite(responseDate) ? Math.max(0, (now() - responseDate) / 1000) : 0;
    const age = Math.max(apparentAge, Number(response.headers.get('age')) || 0);
    const ttl =
      /\bno-cache\b/i.test(cacheControl) || maxAge === undefined
        ? 0
        : Math.max(0, Math.min(60, Number(maxAge) - age)) * 1000;
    if (!/\bno-store\b/i.test(cacheControl)) {
      remember(path, {
        value,
        etag: response.headers.get('etag') ?? (response.status === 304 ? previous?.etag : null) ?? null,
        expires: now() + ttl,
        bytes: text === null ? previous!.bytes : text.length * 2,
        cacheControl
      });
    } else {
      bytes -= memory.get(path)?.bytes ?? 0;
      memory.delete(path);
    }
    return value;
  }

  async function request<T>(path: string, { refresh = false }: { refresh?: boolean } = {}): Promise<T> {
    const key = publicMapPath(path);
    if (!key) {
      const response = await fetcher(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json() as Promise<T>;
    }
    const cached = memory.get(key);
    if (!refresh && cached && cached.expires > now()) {
      memory.delete(key);
      memory.set(key, cached);
      return cached.value as T;
    }
    let flight = flights.get(key);
    if (!flight || flight.epoch !== epoch) {
      const current: Flight = { epoch, promise: Promise.resolve() };
      current.promise = read(key, refresh, epoch).finally(() => {
        if (flights.get(key) === current) flights.delete(key);
      });
      flights.set(key, current);
      flight = current;
    }
    return flight.promise as Promise<T>;
  }

  return {
    request,
    invalidate,
    subscribeInvalidation(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
