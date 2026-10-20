import type { IslandScoreResult, ScoreComponent } from '../src/lib/server/scoring/types';

import assert from 'node:assert/strict';

import { Island, Population } from '../src/lib/db/models';
import db from '../src/lib/server/database';
import { getIslandScore, getNationalScore } from '../src/lib/server/scoring';

function assertScore(value: number | null, label: string): void {
  if (value === null) return;
  assert(Number.isFinite(value), `${label} must be finite`);
  assert(value >= 0 && value <= 100, `${label} must be between 0 and 100`);
}

function assertComponent(component: ScoreComponent, label: string): void {
  assertScore(component.baseScore, `${label}.baseScore`);
  assertScore(component.score, `${label}.score`);
  assert(component.coverageRatio >= 0 && component.coverageRatio <= 1, `${label}.coverageRatio is invalid`);
  assert(['numeric', 'partial', 'unavailable'].includes(component.status), `${label}.status is invalid`);
}

function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  return numeric.length === 0
    ? null
    : Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2));
}

function assertIslandResult(result: IslandScoreResult): void {
  assert(result.islandId.length > 0, 'island ID is empty');
  assert(result.islandName.length > 0, `${result.islandId} has no name`);
  assertComponent(result.overall, `${result.islandId}.overall`);
  assertComponent(result.health, `${result.islandId}.health`);
  assertComponent(result.education, `${result.islandId}.education`);
  assertComponent(result.transport, `${result.islandId}.transport`);
  assertComponent(result.transport.land, `${result.islandId}.transport.land`);
  assertComponent(result.transport.marine, `${result.islandId}.transport.marine`);
  assertComponent(result.transport.air, `${result.islandId}.transport.air`);
  assertScore(result.crowdedness.score, `${result.islandId}.crowdedness`);
  assertScore(
    result.crowdedness.healthFactor === null ? null : result.crowdedness.healthFactor * 100,
    `${result.islandId}.crowding health factor`
  );
  assertScore(
    result.crowdedness.educationFactor === null ? null : result.crowdedness.educationFactor * 100,
    `${result.islandId}.crowding education factor`
  );
  assert(Array.isArray(result.health.breakdown), `${result.islandId} health breakdown is not an array`);
  assert(Array.isArray(result.education.breakdown), `${result.islandId} education breakdown is not an array`);
  assert(Array.isArray(result.transport.hubImpacts), `${result.islandId} hub impacts is not an array`);
  for (const hub of result.transport.hubImpacts) {
    assertScore(hub.factor === null ? null : hub.factor * 100, `${result.islandId}.${hub.hubId}.factor`);
    assertScore(hub.scoreImpact, `${result.islandId}.${hub.hubId}.scoreImpact`);
    assert(hub.totalDemand === null || hub.totalDemand >= 0, `${result.islandId}.${hub.hubId}.totalDemand is invalid`);
  }
  if (result.airportAccess.source === 'direct_land_connection') {
    assert(result.airportAccess.airportIslandId, `${result.islandId} inherited airport has no source island`);
    assert(result.airportAccess.available, `${result.islandId} inherited airport is not available`);
  }
}

const islands = await db.select().from(Island);
const population = await db.select().from(Population);
const inhabited = islands.filter((island) => island.islandType === 'inhabited');
const uninhabited = islands.filter((island) => island.islandType !== 'inhabited');
assert(inhabited.length > 0, 'database has no inhabited islands');

const national = await getNationalScore();
assert.equal(national.islandCount, islands.length);
assert.equal(national.inhabitedIslandCount, inhabited.length);
assert.equal(national.scores.length, inhabited.length);
assert.equal(new Set(national.scores.map((result) => result.islandId)).size, inhabited.length);
assert(national.scores.every((result) => inhabited.some((island) => island.id === result.islandId)));
assert(national.scores.every((result) => !uninhabited.some((island) => island.id === result.islandId)));

for (const result of national.scores) assertIslandResult(result);

const numericScores = national.scores
  .map((result) => result.overall.score)
  .filter((score): score is number => score !== null);
const expectedNational =
  numericScores.length === 0
    ? null
    : Number((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length).toFixed(2));
assert.equal(national.score, expectedNational, 'national score is not the arithmetic mean of island scores');
assert.equal(national.health.score, average(national.scores.map((result) => result.health.score)));
assert.equal(national.education.score, average(national.scores.map((result) => result.education.score)));
assert.equal(national.transport.score, average(national.scores.map((result) => result.transport.score)));
assert.equal(
  national.scoredIslandCount + national.unavailableIslandCount,
  national.inhabitedIslandCount,
  'national island status counts do not reconcile'
);

const representativeIds = [
  inhabited[0]?.id,
  inhabited.find((island) => island.landAreaKm2 !== null)?.id,
  national.scores.find((result) => result.transport.hubImpacts.length > 0)?.islandId,
  national.scores.find((result) => result.airportAccess.source === 'direct_land_connection')?.islandId,
  uninhabited[0]?.id
].filter((id): id is string => Boolean(id));
for (const islandId of new Set(representativeIds)) assertIslandResult(await getIslandScore(islandId));

await assert.rejects(() => getIslandScore('__missing_island__'), /was not found/);

const counts = {
  numericOverall: national.scores.filter((result) => result.overall.status === 'numeric').length,
  partialOverall: national.scores.filter((result) => result.overall.status === 'partial').length,
  unavailableOverall: national.scores.filter((result) => result.overall.status === 'unavailable').length,
  withCrowdedness: national.scores.filter((result) => result.crowdedness.score !== null).length,
  withExternalHealthDemand: national.scores.filter((result) => (result.externalDemand.inboundHealthDemand ?? 0) > 0)
    .length,
  withHubPressure: national.scores.filter((result) => result.transport.hubImpacts.length > 0).length,
  withOwnAirport: national.scores.filter((result) => result.airportAccess.source === 'own_airport').length,
  withInheritedAirport: national.scores.filter((result) => result.airportAccess.source === 'direct_land_connection')
    .length,
  islandsWithPopulation: inhabited.filter((island) => population.some((row) => row.islandId === island.id)).length,
  islandsWithoutPopulation: inhabited.filter((island) => !population.some((row) => row.islandId === island.id)).length,
  islandsWithLandArea: inhabited.filter((island) => island.landAreaKm2 !== null).length,
  islandsWithoutLandArea: inhabited.filter((island) => island.landAreaKm2 === null).length,
  unavailableDetails: national.scores
    .filter((result) => result.overall.status === 'unavailable')
    .map((result) => ({
      islandId: result.islandId,
      islandName: result.islandName,
      limitations: result.limitations,
      evidence: result.evidence
    }))
};

console.log(
  JSON.stringify(
    {
      totalIslands: islands.length,
      inhabitedIslands: inhabited.length,
      uninhabitedIslands: uninhabited.length,
      nationalScore: national.score,
      nationalStatus: national.status,
      scoredIslands: national.scoredIslandCount,
      unavailableIslands: national.unavailableIslandCount,
      counts
    },
    null,
    2
  )
);
