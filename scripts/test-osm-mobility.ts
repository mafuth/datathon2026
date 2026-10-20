import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Island, Service } from '../src/lib/db/models';
import db from '../src/lib/server/database';

type Baseline = {
  islands: Array<{ id: string; islandType: string }>;
  services: Array<{
    id: string;
    islandId: string | null;
    latitude: number | null;
    longitude: number | null;
    name: string | null;
  }>;
};
type Patch = {
  patched_existing: Array<{ serviceId: string; fields: string[] }>;
  added_missing: string[];
};
type Coverage = {
  summary: {
    inhabited_islands: number;
    baseline: number;
    explicit_osm: number;
    inferred_ferry_endpoint: number;
    missing: number;
  };
  islands: Array<{ islandId: string; evidence: string }>;
};
type OSMServices = {
  services: Array<{
    id: string;
    latitude: number;
    longitude: number;
    service_type: string;
  }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const baseline = readJson<Baseline>(resolve('data/mobility/normalized/current-db-baseline.json'));
const patch = readJson<Patch>(resolve('data/mobility/derived/osm-service-patch.json'));
const coverage = readJson<Coverage>(resolve('data/mobility/derived/osm-marine-coverage.json'));
const osmServices = readJson<OSMServices>(resolve('data/mobility/normalized/osm-services.json')).services;
const strict = process.argv.includes('--strict') || process.env.MOBILITY_REQUIRE_INHABITED_MARINE === 'true';

assert.equal(
  new Set(osmServices.map((service) => service.id)).size,
  osmServices.length,
  'OSM service IDs are duplicated'
);
assert(
  osmServices.every(
    (service) =>
      Number.isFinite(service.latitude) &&
      Number.isFinite(service.longitude) &&
      service.latitude >= -90 &&
      service.latitude <= 90 &&
      service.longitude >= -180 &&
      service.longitude <= 180
  ),
  'OSM service coordinates are invalid'
);

const baselineById = new Map(baseline.services.map((service) => [service.id, service]));
for (const patchRow of patch.patched_existing) {
  const baselineService = baselineById.get(patchRow.serviceId);
  assert(baselineService, `Patched service is not in the baseline: ${patchRow.serviceId}`);
  if (patchRow.fields.includes('islandId')) assert.equal(baselineService.islandId, null);
  if (patchRow.fields.includes('coordinates')) {
    assert.equal(baselineService.latitude, null);
    assert.equal(baselineService.longitude, null);
  }
  if (patchRow.fields.includes('name')) assert.equal(baselineService.name, null);
}
assert(
  patch.added_missing.every((id) => id.startsWith('osm:')),
  'Added service is not OSM-sourced'
);

const inhabitedCount = baseline.islands.filter((island) => island.islandType === 'inhabited').length;
assert.equal(coverage.summary.inhabited_islands, inhabitedCount);
assert.equal(coverage.islands.length, inhabitedCount);
if (strict) assert.equal(coverage.summary.missing, 0, 'Inhabited islands are missing OSM marine evidence');

const [islands, services] = await Promise.all([db.select().from(Island), db.select().from(Service)]);
assert.equal(islands.length, baseline.islands.length);
assert(services.length >= baseline.services.length);
const ganMarine = services.filter(
  (service) =>
    service.islandId === 'island:692' &&
    service.serviceType === 'transport' &&
    ['port', 'jetty'].includes(service.subtype)
);
assert(ganMarine.length > 0, 'Laamu Gan has no seeded marine facility');

console.log(
  JSON.stringify(
    {
      baselineServices: baseline.services.length,
      osmServices: osmServices.length,
      patchedExisting: patch.patched_existing.length,
      addedMissing: patch.added_missing.length,
      inhabitedIslands: inhabitedCount,
      marineCoverage: coverage.summary,
      seededServices: services.length,
      ganMarineServices: ganMarine.length,
      strict
    },
    null,
    2
  )
);
