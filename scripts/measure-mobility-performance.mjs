import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { brotliDecompressSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib';

const usage = `Measure serial mobility API response latency, payload bytes and HTTP cache behavior.

  node scripts/measure-mobility-performance.mjs [options]

  --url <origin>     Application origin (default: http://127.0.0.1:4173)
  --runs <count>     Sequential samples per endpoint, 1-20 (default: 3)
  --island <id>      Add a specific island instead of discovering Malé/Hulhumalé
  --output <file>    Also save the JSON report
  --help            Show this help

The first observed sample is not necessarily a cold server or disk cache. Restart
the server or compare a fresh-cache deployment separately to measure that boundary.
Wire bytes are response body bytes; gzipBytes is a reproducible local gzip size.`;

function argumentsFor(values) {
  const options = { url: 'http://127.0.0.1:4173', runs: 3, island: null, output: null, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (['--url', '--runs', '--island', '--output'].includes(flag)) {
      const value = values[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
      options[flag.slice(2)] = flag === '--runs' ? Number(value) : value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  const origin = new URL(options.url);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('--url must be an HTTP(S) origin without credentials, path, query, or fragment.');
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 20)
    throw new Error('--runs must be an integer between 1 and 20.');
  options.url = origin.origin;
  return options;
}

function request(url, etag) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const pending = client.get(
      url,
      {
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip',
          'user-agent': 'DatathonMobilityMeasure/1.0',
          ...(etag ? { 'if-none-match': etag } : {})
        },
        signal: AbortSignal.timeout(120_000)
      },
      (response) => {
        const firstByteMs = performance.now() - started;
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          try {
            const totalMs = performance.now() - started;
            const wire = Buffer.concat(chunks);
            const encoding = response.headers['content-encoding'] ?? 'identity';
            const decoded = !wire.length
              ? wire
              : encoding === 'gzip'
                ? gunzipSync(wire)
                : encoding === 'br'
                  ? brotliDecompressSync(wire)
                  : encoding === 'deflate'
                    ? inflateSync(wire)
                    : wire;
            if (response.statusCode !== 200 && response.statusCode !== 304)
              throw new Error(`HTTP ${response.statusCode}: ${decoded.toString('utf8', 0, 200)}`);
            resolve({
              status: response.statusCode,
              firstByteMs: Math.round(firstByteMs * 100) / 100,
              totalMs: Math.round(totalMs * 100) / 100,
              wireBytes: wire.length,
              decodedBytes: decoded.length,
              gzipBytes: decoded.length ? gzipSync(decoded, { level: 6 }).length : 0,
              encoding,
              contentLength: response.headers['content-length'] ?? null,
              cacheControl: response.headers['cache-control'] ?? null,
              cache:
                response.headers['x-mobility-cache'] ??
                response.headers['server-timing']?.match(/desc="([^"]+)"/)?.[1] ??
                null,
              etag: response.headers.etag ?? null,
              dataVersion:
                response.headers['x-mobility-baseline-version'] ?? response.headers['x-data-version'] ?? null,
              serverTiming: response.headers['server-timing'] ?? null,
              vary: response.headers.vary ?? null,
              payload: decoded.length ? JSON.parse(decoded.toString('utf8')) : null
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    pending.on('error', reject);
  });
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) return console.log(usage);
  const results = [];
  let map;
  const paths = ['/api/map/islands', '/api/map/islands?detail=true', '/api/map/analytics'];
  async function measure(path) {
    const samples = [];
    for (let index = 0; index < options.runs; index += 1) {
      try {
        const sample = await request(new URL(path, options.url));
        if (path === '/api/map/islands') map ??= sample.payload;
        const metrics = { ...sample };
        delete metrics.payload;
        samples.push(metrics);
        console.log(JSON.stringify({ path, sample: index + 1, ...metrics }));
      } catch (error) {
        const failed = { path, sample: index + 1, error: error instanceof Error ? error.message : String(error) };
        samples.push(failed);
        console.log(JSON.stringify(failed));
        process.exitCode = 1;
      }
    }
    let conditional = null;
    const etag = samples.findLast((sample) => sample.etag)?.etag;
    if (etag) {
      try {
        const metrics = await request(new URL(path, options.url), etag);
        delete metrics.payload;
        conditional = metrics;
        console.log(JSON.stringify({ path, conditional: true, ...metrics }));
      } catch (error) {
        conditional = { error: error instanceof Error ? error.message : String(error) };
        process.exitCode = 1;
      }
    }
    const valid = samples.filter((sample) => !sample.error);
    const sortedTimes = valid.map((sample) => sample.totalMs).sort((left, right) => left - right);
    const middle = Math.floor(sortedTimes.length / 2);
    const median = sortedTimes.length
      ? sortedTimes.length % 2
        ? sortedTimes[middle]
        : (sortedTimes[middle - 1] + sortedTimes[middle]) / 2
      : null;
    results.push({
      path,
      samples,
      conditional,
      minMs: sortedTimes[0] ?? null,
      medianMs: median === null ? null : Math.round(median * 100) / 100,
      maxMs: sortedTimes.at(-1) ?? null
    });
  }
  for (const path of paths) await measure(path);
  const ids = options.island
    ? [options.island]
    : (map?.features ?? []).flatMap((feature) => {
        const name = normalizeName(feature.properties?.name);
        const id = feature.id ?? feature.properties?.id;
        return ['male', 'hulhumale'].includes(name) && typeof id === 'string' ? [id] : [];
      });
  for (const id of new Set(ids)) {
    const prefix = `/api/map/islands/${encodeURIComponent(id)}`;
    await measure(`${prefix}/services`);
    await measure(`${prefix}/profile`);
    await measure(`/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(id)}`);
  }
  if (!ids.length) {
    console.warn('No featured island IDs found; island endpoints were not measured.');
    process.exitCode = 1;
  }
  const report = {
    origin: options.url,
    runs: options.runs,
    completedAt: new Date().toISOString(),
    note: 'Observed samples; first sample does not prove a cold server or disk cache.',
    results
  };
  if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      summary: results.map(({ path, minMs, medianMs, maxMs, conditional }) => ({
        path,
        minMs,
        medianMs,
        maxMs,
        conditionalStatus: conditional?.status ?? null
      }))
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
