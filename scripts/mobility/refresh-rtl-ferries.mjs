import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const baseUrl = 'https://bo.rtl.mv:4455/maldives/api/booking';
const outputPath = resolve(process.env.RTL_FERRY_OUTPUT_PATH ?? 'data/mobility/transport/rtl-ferry-coverage.json');
const manifestPath = resolve(process.env.RTL_FERRY_MANIFEST_PATH ?? 'data/mobility/manifest.json');
const rawRoot = resolve(process.env.RTL_FERRY_RAW_ROOT ?? 'data/mobility/raw/rtl-ferries');
const baselinePath = resolve(
  process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json'
);
const referencePath = process.env.RTL_FERRY_REFERENCE_ARTIFACT
  ? resolve(process.env.RTL_FERRY_REFERENCE_ARTIFACT)
  : null;
const userAgent = 'MobilitySandboxMV/0.1 (public RTL ferry snapshot)';
const requestTimeoutMs = 120_000;
const maxRetries = 3;

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function checksum(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function request(url, { binary = false } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: binary ? 'application/json' : 'application/json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (response.ok) return binary ? Buffer.from(await response.arrayBuffer()) : await response.json();
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxRetries) {
        throw new Error(`${url} returned HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt === maxRetries) throw error;
    }
    await sleep(500 * 2 ** attempt);
  }
  throw new Error(`Unable to fetch ${url}`);
}

async function mapConcurrent(values, limit, operation) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

async function readJsonIfPresent(path) {
  if (!path) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function atollCode(stopName) {
  const separator = String(stopName ?? '').indexOf('.');
  return separator < 0 ? null : String(stopName).slice(0, separator).trim().toUpperCase();
}

function localStopName(stopName) {
  const separator = String(stopName ?? '').indexOf('.');
  return separator < 0 ? String(stopName ?? '').trim() : String(stopName).slice(separator + 1).trim();
}

function reconcileStops(stopRecords, baseline) {
  const atollNames = new Map(baseline.atolls.map((atoll) => [String(atoll.id).toUpperCase(), atoll.name]));
  const candidates = new Map();
  for (const island of baseline.islands) {
    const key = `${String(island.atollId).toUpperCase()}:${normalize(island.name)}`;
    const entries = candidates.get(key) ?? [];
    entries.push(island);
    candidates.set(key, entries);
  }

  return stopRecords.map((stop) => {
    const name = String(stop.name ?? '').trim();
    const code = atollCode(name);
    const atollName = code ? atollNames.get(code) ?? null : null;
    const matches = code ? candidates.get(`${code}:${normalize(localStopName(name))}`) ?? [] : [];
    const status = matches.length === 1 ? 'matched_exact_atoll_name' : matches.length > 1 ? 'ambiguous' : 'unmatched';
    const match = matches.length === 1 ? matches[0] : null;
    return {
      rtl_stop_name: name,
      rtl_stop_code: stop.code == null ? null : String(stop.code),
      atoll_code: code,
      atoll_name: atollName,
      latitude: numeric(stop.latitude),
      longitude: numeric(stop.longitude),
      official_island_id: match?.id ?? null,
      official_island_name: match?.name ?? null,
      official_atoll: atollName,
      reconciliation_status: status
    };
  });
}

function routeStops(value) {
  return String(value ?? '')
    .split(',')
    .map((stop) => stop.trim())
    .filter(Boolean);
}

function routeScheduleEntries(rawEntries, referenceEntries = []) {
  return rawEntries.map((entry, index) => ({
    operating_days: referenceEntries[index]?.operating_days ?? null,
    effective_from: referenceEntries[index]?.effective_from ?? null,
    stop_timings: (entry.scheduleStopTimings ?? []).map((timing) => ({
      stopName: String(timing.stopName ?? ''),
      dvstopName: timing.dvstopName == null ? null : String(timing.dvstopName),
      timing: String(timing.timing ?? ''),
      order: Number(timing.order)
    }))
  }));
}

function validateArtifact(artifact) {
  if (artifact.routes.length !== artifact.coverage.route_count) throw new Error('RTL route count is inconsistent');
  const routeCodes = new Set();
  if (artifact.routes.some((route) => !route.route_id || !route.route_code || route.stop_names.length === 0)) {
    throw new Error('RTL route is missing an ID, code, or stop names');
  }
  for (const route of artifact.routes) {
    if (routeCodes.has(route.route_code)) throw new Error(`Duplicate RTL route code: ${route.route_code}`);
    routeCodes.add(route.route_code);
    for (const entry of route.schedule_entries) {
      if (entry.stop_timings.length === 0) throw new Error(`RTL route ${route.route_code} has an empty schedule entry`);
      if (entry.stop_timings.some((timing) => !timing.stopName || !timing.timing || !Number.isInteger(timing.order))) {
        throw new Error(`RTL route ${route.route_code} has invalid schedule timing data`);
      }
    }
  }
  for (const stop of artifact.islands) {
    if (stop.reconciliation_status !== 'matched_exact_atoll_name' && stop.official_island_id !== null) {
      throw new Error(`RTL stop ${stop.rtl_stop_name} has an invalid official island mapping`);
    }
  }
}

async function atomicWrite(path, content) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, path);
}

const retrievedAt = new Date().toISOString();
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const reference = await readJsonIfPresent(referencePath);
const referenceByCode = new Map((reference?.routes ?? []).map((route) => [route.route_code, route]));
const backofficeUrl = `${baseUrl}/v1/ferries/backofficeinfo`;
const backoffice = await request(backofficeUrl);
const zones = (backoffice.ferryZones ?? []).map((zone) => ({
  zone_code: String(zone.code),
  zone_name: String(zone.name ?? zone.description ?? zone.code)
}));
if (zones.length === 0) throw new Error('RTL backoffice response did not contain ferry zones');

const routeResults = await Promise.all(
  zones.map(async (zone) => ({
    zone,
    routes: await request(`${baseUrl}/v1/ferryTrip/allRoutes?zoneCode=${encodeURIComponent(zone.zone_code)}`)
  }))
);
const routeCards = [...new Map(routeResults.flatMap((result) => result.routes).map((route) => [route.routeId, route])).values()];
const schedules = await mapConcurrent(routeCards, 4, async (route) => ({
  routeId: route.routeId,
  entries: await request(`${baseUrl}/v1/ferryTrip/schedules/${encodeURIComponent(route.routeId)}`)
}));
const scheduleByRouteId = new Map(schedules.map((schedule) => [schedule.routeId, schedule.entries]));

const sourceExports = [];
for (const zone of zones) {
  const response = await request(`${baseUrl}/v2/ferryTrip/allSchedules/${encodeURIComponent(zone.zone_code)}`);
  const encoded = String(response.content ?? '');
  let pdf = Buffer.from(encoded, 'base64');
  if (pdf.subarray(0, 4).toString() !== '%PDF') {
    pdf = Buffer.from(pdf.toString('utf8').trim(), 'base64');
  }
  if (pdf.subarray(0, 4).toString() !== '%PDF') throw new Error(`RTL zone ${zone.zone_code} did not return a PDF`);
  const path = join(rawRoot, `zone-${zone.zone_code}-schedule.pdf`);
  await mkdir(rawRoot, { recursive: true });
  await writeFile(path, pdf);
  sourceExports.push({
    zone_code: zone.zone_code,
    path: `raw/rtl-ferries/zone-${zone.zone_code}-schedule.pdf`,
    source_url: `${baseUrl}/v2/ferryTrip/allSchedules/${zone.zone_code}`,
    sha256: checksum(pdf),
    bytes: pdf.length
  });
}

const stopByName = new Map((backoffice.ferryStops ?? []).map((stop) => [String(stop.name).trim(), stop]));
const activeStopNames = new Set(routeCards.flatMap((route) => routeStops(route.stops)));
const islands = reconcileStops(
  [...activeStopNames].map((name) => stopByName.get(name) ?? { name }),
  baseline
);
const routes = routeCards.map((route) => {
  const stopNames = routeStops(route.stops);
  const referenceRoute = referenceByCode.get(String(route.routeName));
  const liveEntries = scheduleByRouteId.get(route.routeId) ?? [];
  const entries = liveEntries.length > 0 ? liveEntries : referenceRoute?.schedule_entries ?? [];
  return {
    route_id: Number(route.routeId),
    route_code: String(route.routeName),
    route_name: String(route.description ?? route.routeName),
    zone_code: String(route.zoneCode),
    zone_name: String(route.zoneName ?? zones.find((zone) => zone.zone_code === String(route.zoneCode))?.zone_name ?? ''),
    color: route.color == null ? null : String(route.color),
    origin_stop: stopNames[0] ?? null,
    destination_stop: stopNames.at(-1) ?? null,
    stop_names: stopNames,
    stop_names_dv: String(route.dvstops ?? '')
      .split(',')
      .map((stop) => stop.trim())
      .filter(Boolean),
    schedule_entries: routeScheduleEntries(entries, referenceRoute?.schedule_entries ?? [])
  };
});

const matchedOfficialIslandCount = islands.filter((stop) => stop.reconciliation_status === 'matched_exact_atoll_name').length;
const unmatchedStopCount = islands.filter((stop) => stop.reconciliation_status === 'unmatched').length;
const ambiguousStopCount = islands.filter((stop) => stop.reconciliation_status === 'ambiguous').length;
const scheduleEntryCount = routes.reduce((sum, route) => sum + route.schedule_entries.length, 0);
const scheduleStopTimeCount = routes.reduce(
  (sum, route) => sum + route.schedule_entries.reduce((entrySum, entry) => entrySum + entry.stop_timings.length, 0),
  0
);
const metadataFromReference = routes.some((route) =>
  route.schedule_entries.some((entry) => entry.operating_days === null || entry.effective_from === null)
);
const quality = {
  metadata_alignment_status: metadataFromReference ? 'reference_snapshot_or_missing' : 'reference_snapshot',
  warnings: metadataFromReference
    ? ['Live PDF metadata was not parsed; schedule metadata was retained from the reference snapshot where available.']
    : ['Schedule metadata was retained from the verified reference snapshot while live route and timing JSON was refreshed.'],
  source_pdf_count: sourceExports.length
};
const artifact = {
  schema_version: 'rtl_ferry_coverage.v1',
  operator: 'Road Development Corporation (RTL) / MTCC ferry service',
  retrieved_at: retrievedAt,
  access_class: 'open_json_and_open_pdf_export',
  source: {
    backoffice_info_url: backofficeUrl,
    route_catalogue_url: `${baseUrl}/v1/ferryTrip/allRoutes?zoneCode={zoneCode}`,
    route_schedule_url: `${baseUrl}/v1/ferryTrip/schedules/{routeId}`,
    zone_schedule_pdf_url: `${baseUrl}/v2/ferryTrip/allSchedules/{zoneCode}`,
    operator_site: 'https://www.rtl.mv/'
  },
  coverage: {
    zone_count: zones.length,
    route_count: routes.length,
    covered_island_count: islands.length,
    matched_official_island_count: matchedOfficialIslandCount,
    unmatched_stop_count: unmatchedStopCount,
    ambiguous_stop_count: ambiguousStopCount
  },
  zones: zones.map((zone) => ({ ...zone, route_count: routes.filter((route) => route.zone_code === zone.zone_code).length })),
  islands,
  routes,
  source_exports: sourceExports,
  quality: {
    ...quality,
    schedule_entry_count: scheduleEntryCount,
    schedule_stop_time_count: scheduleStopTimeCount
  }
};
validateArtifact(artifact);
const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
await atomicWrite(outputPath, artifactText);
const manifest = {
  path: 'transport/rtl-ferry-coverage.json',
  sourcePath: referencePath ? 'external-reference-snapshot' : null,
  sourceUrl: backofficeUrl,
  copiedAt: retrievedAt,
  sourceRetrievedAt: retrievedAt,
  sourceChecksum: checksum(artifactText),
  schemaVersion: artifact.schema_version,
  artifactVersion: `rtl-ferry-coverage-${retrievedAt.slice(0, 10)}`,
  parserVersion: 'rtl-ferry-refresh-v1',
  recordCount: routes.length,
  knownLimitations: quality.warnings,
  usedByMvp: true
};
const manifestValue = (await readJsonIfPresent(manifestPath)) ?? {};
manifestValue.rtlFerries = manifest;
await atomicWrite(manifestPath, `${JSON.stringify(manifestValue, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      retrieved_at: retrievedAt,
      zone_count: zones.length,
      route_count: routes.length,
      covered_stop_count: islands.length,
      matched_stop_count: matchedOfficialIslandCount,
      unmatched_stop_count: unmatchedStopCount,
      ambiguous_stop_count: ambiguousStopCount,
      schedule_entry_count: scheduleEntryCount,
      schedule_stop_time_count: scheduleStopTimeCount,
      source_pdf_count: sourceExports.length,
      output: outputPath
    },
    null,
    2
  )
);
