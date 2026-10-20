import assert from 'node:assert/strict';

import { Island } from '../src/lib/db/models';
import db from '../src/lib/server/database';
import { getIslandScore, getNationalScore } from '../src/lib/server/scoring';

function assertScore(value: number | null, label: string): void {
  if (value === null) return;
  assert(Number.isFinite(value), `${label} must be finite`);
  assert(value >= 0 && value <= 100, `${label} must be between 0 and 100`);
}

const islands = await db.select().from(Island);
const inhabited = islands.filter((island) => island.islandType === 'inhabited');
assert(inhabited.length > 0, 'no inhabited islands found in database');

const requestedIslandId = process.argv[2]?.trim() || inhabited[0].id;
const islandScore = await getIslandScore(requestedIslandId);
const repeatedScore = await getIslandScore(requestedIslandId);

assert.equal(islandScore.islandId, requestedIslandId);
assert.deepEqual(islandScore, repeatedScore, 'repeated island scoring must be deterministic');
assertScore(islandScore.overall.score, 'island overall score');
assertScore(islandScore.health.score, 'island health score');
assertScore(islandScore.education.score, 'island education score');
assertScore(islandScore.transport.score, 'island transport score');
assertScore(islandScore.transport.land.score, 'island land score');
assertScore(islandScore.transport.marine.score, 'island marine score');
assertScore(islandScore.transport.air.score, 'island air score');
assertScore(islandScore.crowdedness.score, 'island crowdedness score');
assert(islandScore.health.breakdown.length > 0, 'health breakdown is missing');
assert(islandScore.education.breakdown.length > 0, 'education breakdown is missing');
assert(Array.isArray(islandScore.transport.hubImpacts), 'transport hub breakdown is missing');
assert(Array.isArray(islandScore.transport.demand.stops), 'transport stop demand is missing');
assertScore(islandScore.transport.demand.score, 'transport demand score');
assert(
  islandScore.transport.demand.averageLoad === null || islandScore.transport.demand.averageLoad >= 0,
  'transport average load is invalid'
);
assert(
  islandScore.demand.health.demandPercent === null || islandScore.demand.health.demandPercent <= 1,
  'health demand exceeds 100%'
);
assert(
  islandScore.demand.education.demandPercent === null || islandScore.demand.education.demandPercent <= 1,
  'education demand exceeds 100%'
);
assert(
  islandScore.demand.health.outboundPercent === null || islandScore.demand.health.outboundPercent <= 1,
  'outbound health demand exceeds 100%'
);
assert(Array.isArray(islandScore.demand.inboundSources), 'inbound demand sources are missing');

const laamuGan = await getIslandScore('island:692');
assert(laamuGan.evidence.transportServices > 0, 'Laamu Gan transport services were not seeded');
assert(laamuGan.evidence.transportConnections > 0, 'Laamu Gan transport connections were not seeded');
assert((laamuGan.transport.score ?? 0) > 0, 'Laamu Gan transport score is unexpectedly zero');
assert((laamuGan.transport.marine.score ?? 0) > 0, 'Laamu Gan marine transport score is unexpectedly zero');
assert.equal(laamuGan.airportAccess.source, 'land_connection', 'Laamu Gan airport access is not land-connected');
assert.equal(laamuGan.airportAccess.airportIslandId, 'island:706', 'Laamu Gan airport source is not Kadhdhoo');

const nationalScore = await getNationalScore();
assert.equal(nationalScore.islandCount, islands.length);
assert.equal(nationalScore.inhabitedIslandCount, inhabited.length);
assert.equal(nationalScore.scores.length, inhabited.length);
assertScore(nationalScore.score, 'national score');
assertScore(nationalScore.health.score, 'national health score');
assertScore(nationalScore.education.score, 'national education score');
assertScore(nationalScore.transport.score, 'national transport score');
assert(nationalScore.scoredIslandCount <= nationalScore.inhabitedIslandCount);
assert.equal(
  nationalScore.scoredIslandCount + nationalScore.unavailableIslandCount,
  nationalScore.inhabitedIslandCount
);

const inheritedAirport = nationalScore.scores.find((result) => result.airportAccess.source === 'land_connection');
if (inheritedAirport) {
  assert(inheritedAirport.airportAccess.airportIslandId, 'inherited airport has no source island');
}
assert(
  nationalScore.scores.some((result) => result.transport.hubImpacts.length > 0),
  'no transport hub demand impacts were calculated'
);
assert(
  nationalScore.scores.some((result) => (result.externalDemand.inboundHealthDemand ?? 0) > 0),
  'no cross-island health demand was calculated'
);

await assert.rejects(() => getIslandScore('__missing_island__'), /was not found/);

console.log(
  JSON.stringify(
    {
      testedIsland: islandScore.islandId,
      islandStatus: islandScore.overall.status,
      islandScore: islandScore.overall.score,
      crowdednessScore: islandScore.crowdedness.score,
      airportAccess: islandScore.airportAccess,
      hubImpactCount: islandScore.transport.hubImpacts.length,
      nationalStatus: nationalScore.status,
      nationalScore: nationalScore.score,
      inhabitedIslandCount: nationalScore.inhabitedIslandCount,
      scoredIslandCount: nationalScore.scoredIslandCount
    },
    null,
    2
  )
);
