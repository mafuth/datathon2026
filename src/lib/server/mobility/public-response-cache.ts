import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

import { acceptsGzip } from './response-compression';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const MAX_ITEM_BYTES = 32 * 1024 * 1024;
const MAX_MEMORY_BYTES = 96 * 1024 * 1024;
const MAX_DISK_BYTES = 256 * 1024 * 1024;
const MAX_DISK_ITEMS = 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60_000;
const MAX_FINGERPRINT_FILES = 4096;

type Entry = { body: Buffer; compressed: Buffer; etag: string; baseline: string; origin: 'disk' | 'computed' };
type CacheOptions = { directory?: string; maxMemoryBytes?: number; modelVersion?: string };

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

const fileFingerprints = new Map<string, { stamp: string; digest: string }>();

async function fileFingerprint(path: string): Promise<string> {
  const info = await stat(path, { bigint: true });
  const stamp = `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  const cached = fileFingerprints.get(path);
  if (cached?.stamp === stamp) {
    fileFingerprints.delete(path);
    fileFingerprints.set(path, cached);
    return cached.digest;
  }
  const fingerprint = { stamp, digest: digest(await readFile(path)) };
  fileFingerprints.delete(path);
  fileFingerprints.set(path, fingerprint);
  while (fileFingerprints.size > MAX_FINGERPRINT_FILES) {
    const oldest = fileFingerprints.keys().next().value;
    if (oldest === undefined) break;
    fileFingerprints.delete(oldest);
  }
  return fingerprint.digest;
}

async function codeFiles(directory: string, compiled = false): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? codeFiles(path, compiled)
          : (compiled ? /\.js$/ : /\.(?:ts|js)$/).test(entry.name)
            ? [path]
            : [];
      })
    );
    return files.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function publicResponseModelFingerprint(
  options: { root?: string; production?: boolean } = {}
): Promise<string> {
  const root = resolve(options.root ?? process.cwd());
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const compiled = production
    ? (
        await Promise.all(
          ['build/server', '.svelte-kit/output/server'].map((directory) => codeFiles(resolve(root, directory), true))
        )
      ).flat()
    : [];
  // Production must identify the running build even when the source tree has
  // changed since compilation. Cover both adapter-node and Vite preview output.
  const files = compiled.length
    ? compiled
    : (
        await Promise.all(
          ['src/lib/server', 'src/lib/mobility', 'src/lib/db/models', 'src/lib/config', 'src/routes/api'].map(
            (directory) => codeFiles(resolve(root, directory))
          )
        )
      ).flat();
  const hash = createHash('sha256').update('public-mobility-json-v3');
  // Reuse unchanged file digests in development without a stale-time window.
  // Metadata still invalidates edits immediately, including same-size rewrites.
  const sorted = files.sort();
  for (let index = 0; index < sorted.length; index += 8) {
    const paths = sorted.slice(index, index + 8);
    const fingerprints = await Promise.all(paths.map((path) => fileFingerprint(path)));
    for (const [offset, path] of paths.entries()) {
      hash.update(relative(root, path).replaceAll('\\', '/')).update('\0').update(fingerprints[offset]).update('\0');
    }
  }
  for (const filename of ['package.json', 'pnpm-lock.yaml']) {
    try {
      const fingerprint = await fileFingerprint(resolve(root, filename));
      hash.update(filename).update('\0').update(fingerprint).update('\0');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return hash.digest('hex');
}

let modelVersionRequest: Promise<string> | undefined;
function modelVersion(): Promise<string> {
  if (modelVersionRequest) return modelVersionRequest;
  const request = publicResponseModelFingerprint();
  modelVersionRequest = request;
  void request.catch(() => {
    // A transient IO failure must not poison all future production cache reads.
    if (modelVersionRequest === request) modelVersionRequest = undefined;
  });
  if (process.env.NODE_ENV !== 'production') {
    // Development modules can change without restarting the process.
    void request
      .finally(() => {
        if (modelVersionRequest === request) modelVersionRequest = undefined;
      })
      .catch(() => {});
  }
  return request;
}

/** Only deterministic public baseline GETs belong here. Drafts and reports do not. */
export class PublicResponseCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<Entry>>();
  private bytes = 0;
  private directory: string;
  private maxMemoryBytes: number;
  private configuredModelVersion?: string;
  private nextPruneAt = 0;
  private pruning: Promise<void> | undefined;

  constructor(options: CacheOptions = {}) {
    this.directory = options.directory ?? process.env.MOBILITY_CACHE_DIR ?? resolve('data/mobility/.cache/public');
    this.maxMemoryBytes = options.maxMemoryBytes ?? MAX_MEMORY_BYTES;
    this.configuredModelVersion = options.modelVersion;
  }

  private remember(key: string, entry: Entry) {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.body.length + previous.compressed.length;
    this.entries.delete(key);
    const size = entry.body.length + entry.compressed.length;
    if (size > this.maxMemoryBytes) return;
    this.entries.set(key, entry);
    this.bytes += size;
    while (this.bytes > this.maxMemoryBytes) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].body.length + oldest[1].compressed.length;
    }
  }

  private async read(key: string, baseline: string): Promise<Entry | undefined> {
    try {
      const path = join(this.directory, `${key}.json`);
      const info = await stat(path);
      if (info.size > MAX_ITEM_BYTES + 1024 || Date.now() - info.mtimeMs > MAX_AGE_MS) return;
      const stored = await readFile(path);
      const split = stored.indexOf(10);
      if (split < 0 || split > 1024) return;
      const metadata = JSON.parse(stored.subarray(0, split).toString()) as {
        key: string;
        sha: string;
        encoding?: string;
      };
      if (metadata.key !== key || (metadata.encoding !== undefined && metadata.encoding !== 'gzip')) return;
      const bytes = stored.subarray(split + 1);
      const body = metadata.encoding === 'gzip' ? await decompress(bytes, { maxOutputLength: MAX_ITEM_BYTES }) : bytes;
      const sha = digest(body);
      if (metadata.sha !== sha || body.length > MAX_ITEM_BYTES) return;
      const entry: Entry = {
        body,
        compressed: metadata.encoding === 'gzip' ? bytes : await compress(body),
        etag: `W/"${sha}"`,
        baseline,
        origin: 'disk'
      };
      // Upgrade old plain cache files once, retaining precomputed results.
      if (metadata.encoding === undefined) await this.persist(key, entry);
      return entry;
    } catch {
      return;
    }
  }

  private async persist(key: string, entry: Entry): Promise<void> {
    let temporary: string | undefined;
    try {
      await mkdir(this.directory, { recursive: true });
      const path = join(this.directory, `${key}.json`);
      temporary = `${path}.${randomUUID()}.tmp`;
      const metadata = JSON.stringify({ key, sha: digest(entry.body), encoding: 'gzip' });
      const handle = await open(temporary, 'wx');
      try {
        await handle.writeFile(Buffer.concat([Buffer.from(`${metadata}\n`), entry.compressed]));
      } finally {
        await handle.close();
      }
      await rename(temporary, path);
      temporary = undefined;
      this.schedulePrune();
    } catch {
      // An unwritable/ephemeral cache directory must never prevent a response.
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => {});
    }
  }

  private schedulePrune() {
    if (this.pruning || Date.now() < this.nextPruneAt) return;
    this.nextPruneAt = Date.now() + PRUNE_INTERVAL_MS;
    // Directory scans and eviction are maintenance, not response work.
    this.pruning = this.prune()
      .catch(() => {})
      .finally(() => {
        this.pruning = undefined;
      });
  }

  private async prune() {
    const files = (await readdir(this.directory)).filter((file) => /^[a-f0-9]{64}\.json$/.test(file));
    const items: Array<{ path: string; size: number; modified: number }> = [];
    // Leave filesystem capacity for requests while pruning a populated cache.
    for (let index = 0; index < files.length; index += 8) {
      const batch = await Promise.all(
        files.slice(index, index + 8).map(async (file) => {
          const path = join(this.directory, file);
          try {
            const info = await stat(path);
            return [{ path, size: info.size, modified: info.mtimeMs }];
          } catch (error) {
            // Another process may already have evicted this entry.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
          }
        })
      );
      items.push(...batch.flat());
    }
    items.sort((a, b) => b.modified - a.modified);
    let bytes = 0;
    for (const [index, item] of items.entries()) {
      bytes += item.size;
      if (index >= MAX_DISK_ITEMS || bytes > MAX_DISK_BYTES || Date.now() - item.modified > MAX_AGE_MS) {
        await rm(item.path, { force: true });
      }
    }
  }

  async response(
    request: Request,
    resource: string,
    baseline: string,
    compute: () => Promise<unknown>
  ): Promise<Response> {
    const start = performance.now();
    const version = this.configuredModelVersion ?? (await modelVersion());
    const key = digest(JSON.stringify([version, baseline, resource]));
    let entry = this.entries.get(key);
    let cache = 'memory';
    if (entry) this.remember(key, entry);
    else {
      let work = this.pending.get(key);
      cache = work ? 'shared' : 'miss';
      if (!work) {
        work = (async () => {
          const disk = await this.read(key, baseline);
          if (disk) return disk;
          const body = Buffer.from(JSON.stringify(await compute()));
          const result: Entry = {
            body,
            compressed: await compress(body),
            etag: `W/"${digest(body)}"`,
            baseline,
            origin: 'computed'
          };
          if (body.length <= MAX_ITEM_BYTES) await this.persist(key, result);
          return result;
        })();
        this.pending.set(key, work);
      }
      try {
        entry = await work;
        this.remember(key, entry);
      } finally {
        if (this.pending.get(key) === work) this.pending.delete(key);
      }
      if (cache === 'miss') cache = entry.origin;
    }
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, must-revalidate',
      vary: 'Accept-Encoding',
      etag: entry.etag,
      'x-mobility-baseline-version': entry.baseline,
      'server-timing': `mobility;dur=${(performance.now() - start).toFixed(1)};desc="${cache}"`
    });
    const matches = request.headers
      .get('if-none-match')
      ?.split(',')
      .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === entry.etag.replace(/^W\//, ''));
    if (matches) return new Response(null, { status: 304, headers });
    const compressed = acceptsGzip(request.headers.get('accept-encoding'));
    const body = compressed ? entry.compressed : entry.body;
    if (compressed) headers.set('content-encoding', 'gzip');
    headers.set('content-length', String(body.length));
    return new Response(new Uint8Array(body), { headers });
  }
}

export const publicResponseCache = new PublicResponseCache();
