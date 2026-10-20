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

const inheritedAirport = nationalScore.scores.find(
  (result) => result.airportAccess.source === 'direct_land_connection'
);
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
