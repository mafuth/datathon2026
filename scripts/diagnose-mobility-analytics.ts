import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Atoll, Island, Population, Service, TransportConnection } from '../src/lib/db/models';
import db from '../src/lib/server/database';
import { confirmedServiceMappings } from '../src/lib/server/mobility/reviewed-service-overlay';
import { classifyZeroScore } from '../src/lib/server/scoring/analytics-coverage';
import { getNationalScore } from '../src/lib/server/scoring/national-score';

type RecordValue = Record<string, unknown>;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function text(record: RecordValue, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

const review = readJson<{
  entries: Array<RecordValue & { service_id?: string; island_id?: string; disposition?: string }>;
}>(resolve('data/mobility/derived/service-island-mapping-review.json'));
const overrides = readJson<{
  entries: Array<RecordValue & { service_id?: string; island_id?: string; disposition?: string }>;
}>(resolve('data/mobility/derived/service-island-reviewed-overrides.json'));
const mappings = confirmedServiceMappings(
  review.entries.filter(
    (entry) =>
      typeof entry.service_id === 'string' &&
      typeof entry.island_id === 'string' &&
      typeof entry.disposition === 'string'
  ) as never,
  overrides.entries.filter(
    (entry) =>
      typeof entry.service_id === 'string' &&
      typeof entry.island_id === 'string' &&
      typeof entry.disposition === 'string'
  ) as never
);
const baseline = readJson<{
  services: Array<{
    id: string;
    islandId: string | null;
    serviceType: string;
    subtype: string;
    name: string | null;
  }>;
}>(resolve('data/mobility/normalized/current-db-baseline.json'));
const canonicalFacilities = baseline.services.map((service) => {
  const sourceCategory = service.serviceType === 'education' ? 'school' : service.subtype;
  return {
    record: {
      id: service.id,
      category: sourceCategory,
      name: service.name,
      island_id: service.islandId
    },
    id: service.id,
    islandId: service.islandId ?? mappings.get(service.id) ?? null,
    wasUnmapped: service.islandId === null
  };
});

const [islands, atolls, population, services, connections, national] = await Promise.all([
  db.select().from(Island),
  db.select().from(Atoll),
  db.select().from(Population),
  db.select().from(Service),
  db.select().from(TransportConnection),
  getNationalScore()
]);

const atollNameById = new Map(atolls.map((atoll) => [atoll.id, atoll.name]));
const populationByIsland = new Map<string, number>();
for (const row of population) {
  if (row.ageCategory === 'total') populationByIsland.set(row.islandId, row.amount);
}

const serviceTypes = ['health', 'education', 'transport'] as const;
const diagnosticIslands = national.scores.map((score) => {
  const island = islands.find((row) => row.id === score.islandId);
  const atollName = island ? (atollNameById.get(island.atollId) ?? island.atollId) : 'unknown';
  const islandServices = services.filter((service) => service.islandId === score.islandId);
  const islandConnections = connections.filter(
    (connection) => connection.fromIslandId === score.islandId || connection.toIslandId === score.islandId
  );
  const canonicalForIsland = canonicalFacilities.filter((facility) => facility.islandId === score.islandId);
  const canonicalUnmappedForIsland = canonicalFacilities.filter((facility) => {
    if (!facility.wasUnmapped || facility.islandId !== null || !facility.id) return false;
    const context = facility.record.location_context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) return false;
    const contextRecord = context as RecordValue;
    const contextAtoll = text(contextRecord, 'proposed_atoll') ?? text(contextRecord, 'atoll_code');
    const contextIsland = text(contextRecord, 'island_name');
    return (
      (contextAtoll === atollName || normalize(contextAtoll ?? '') === normalize(atollName)) &&
      (!contextIsland || normalize(contextIsland) === normalize(island?.name ?? ''))
    );
  });
  const categoryRows = serviceTypes.map((category) => {
    const component = score[category];
    const databaseServiceCount = islandServices.filter((service) => service.serviceType === category).length;
    const canonicalMappedServiceCount = canonicalForIsland.filter((facility) => {
      const sourceCategory = text(facility.record, 'category');
      return category === 'health'
        ? sourceCategory === 'hospital' || sourceCategory === 'health_center' || sourceCategory === 'clinic'
        : category === 'education'
          ? sourceCategory === 'school'
          : sourceCategory === 'airport';
    }).length;
    const canonicalUnmappedServiceCount = canonicalUnmappedForIsland.filter((facility) => {
      const sourceCategory = text(facility.record, 'category');
      return category === 'health'
        ? sourceCategory === 'hospital' || sourceCategory === 'health_center' || sourceCategory === 'clinic'
        : category === 'education'
          ? sourceCategory === 'school'
          : sourceCategory === 'airport';
    }).length;
    const evidence = {
      databaseServiceCount,
      canonicalMappedServiceCount,
      canonicalUnmappedServiceCount,
      transportConnectionCount: islandConnections.length
    };
    return {
      score: component.score,
      status: component.status,
      coverageRatio: component.coverageRatio,
      evidenceCount: component.evidenceCount,
      limitations: component.limitations,
      evidence,
      zeroClassification: component.score === 0 ? classifyZeroScore(category, evidence) : null
    };
  });
  return {
    id: score.islandId,
    name: score.islandName,
    atollName,
    population: populationByIsland.get(score.islandId) ?? null,
    services: Object.fromEntries(categoryRows.map((row, index) => [serviceTypes[index], row])),
    transportConnections: islandConnections.length
  };
});

const artifact = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: {
    database: 'local.db',
    canonicalFacilities: 'data/mobility/normalized/current-db-baseline.json',
    analytics: '/api/map/analytics (same getNationalScore contract)'
  },
  summary: {
    inhabitedIslands: diagnosticIslands.length,
    zeroScores: Object.fromEntries(
      serviceTypes.map((category) => [
        category,
        diagnosticIslands.filter((island) => island.services[category].score === 0).length
      ])
    ),
    classifications: Object.fromEntries(
      serviceTypes.map((category) => [
        category,
        Object.fromEntries(
          ['missing_service', 'missing_island_mapping', 'missing_connection', 'score_semantics'].map(
            (classification) => [
              classification,
              diagnosticIslands.filter((island) => island.services[category].zeroClassification === classification)
                .length
            ]
          )
        )
      ])
    )
  },
  islands: diagnosticIslands
};

writeFileSync(
  resolve('data/mobility/derived/mobility-analytics-gap-diagnostic.json'),
  `${JSON.stringify(artifact, null, 2)}\n`
);
console.log(JSON.stringify(artifact.summary, null, 2));
