import { writeFile } from 'node:fs/promises';

const usage = `Warm the running application's public mobility API and its persistent cache.

  node scripts/precompute-mobility.mjs [options]

  --url <origin>     Application origin (default: http://127.0.0.1:4173)
  --all-islands      Warm every island's services, profile and connections (two workers)
  --output <file>    Also save the JSON execution report
  --help            Show this help

The application must already be running. This command only makes public GET
requests; it does not modify source data or precompute private proposal drafts.`;

function argumentsFor(values) {
  const options = { url: 'http://127.0.0.1:4173', allIslands: false, output: null, help: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--all-islands') options.allIslands = true;
    else if (value === '--url' || value === '--output') {
      const next = values[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} requires a value.`);
      options[value === '--url' ? 'url' : 'output'] = next;
    } else throw new Error(`Unknown option: ${value}`);
  }
  const origin = new URL(options.url);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error('--url must be an HTTP(S) origin without credentials.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('--url must be an origin without a path, query, or fragment.');
  options.url = origin.origin;
  return options;
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
  const started = performance.now();
  const results = [];
  async function warm(path) {
    const requestedAt = performance.now();
    let result;
    let payload;
    try {
      const response = await fetch(`${options.url}${path}`, {
        headers: { accept: 'application/json', 'user-agent': 'DatathonMobilityPrecompute/1.0' },
        signal: AbortSignal.timeout(120_000)
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Expected application/json.');
      payload = JSON.parse(body);
      result = {
        path,
        status: 'ready',
        httpStatus: response.status,
        milliseconds: Math.round(performance.now() - requestedAt),
        decodedBytes: Buffer.byteLength(body),
        cache:
          response.headers.get('x-mobility-cache') ??
          response.headers.get('server-timing')?.match(/desc="([^"]+)"/)?.[1] ??
          null,
        dataVersion: response.headers.get('x-mobility-baseline-version') ?? response.headers.get('x-data-version'),
        serverTiming: response.headers.get('server-timing'),
        etag: response.headers.get('etag')
      };
    } catch (error) {
      result = {
        path,
        status: 'failed',
        milliseconds: Math.round(performance.now() - requestedAt),
        error: error instanceof Error ? error.message : String(error)
      };
    }
    results.push(result);
    console.log(JSON.stringify(result));
    return payload;
  }

  // Use the actual HTTP contract so the server owns calculations, keys and writes.
  const overview = await warm('/api/map/islands');
  const detail = await warm('/api/map/islands?detail=true');
  await warm('/api/map/analytics');
  const map = Array.isArray(overview?.features) ? overview : detail;
  if (!Array.isArray(map?.features)) {
    const failure = {
      path: 'island-discovery',
      status: 'failed',
      error: 'Neither map response provided island features; island warmup was skipped.'
    };
    results.push(failure);
    console.log(JSON.stringify(failure));
  }
  const islands = [
    ...new Map(
      (map?.features ?? []).flatMap((feature) => {
        const id = feature.id ?? feature.properties?.id;
        const name = normalizeName(feature.properties?.name);
        return typeof id === 'string' ? [[id, { id, name }]] : [];
      })
    ).values()
  ];
  const featured = islands.filter((island) => island.name === 'male' || island.name === 'hulhumale');
  if (!featured.length && !options.allIslands) {
    const failure = {
      path: 'featured-island-discovery',
      status: 'failed',
      error: 'No Malé/Hulhumalé features found; featured island warmup was skipped.'
    };
    results.push(failure);
    console.log(JSON.stringify(failure));
  }
  const selected = options.allIslands ? islands : featured;
  const jobs = selected.flatMap((island) => {
    const prefix = `/api/map/islands/${encodeURIComponent(island.id)}`;
    return [`${prefix}/services`, `${prefix}/profile`, `${prefix}/connections`];
  });
  for (const island of featured)
    jobs.push(`/api/v1/scenarios/transport-options?islandId=${encodeURIComponent(island.id)}`);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const index = next++;
      await warm(jobs[index]);
    }
  }
  await Promise.all([worker(), worker()]);
  const failed = results.filter((result) => result.status === 'failed');
  const report = {
    origin: options.url,
    allIslands: options.allIslands,
    workers: 2,
    completedAt: new Date().toISOString(),
    milliseconds: Math.round(performance.now() - started),
    ready: results.length - failed.length,
    failed: failed.length,
    results
  };
  if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ summary: { ...report, results: undefined } }));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
