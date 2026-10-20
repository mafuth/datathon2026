import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { Atoll, Island } from '$lib/db/models';
import db from '$lib/server/database';
import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getNationalScore } from '$lib/server/scoring/national-score';

type NumberValue = number | null;

function populationValue(records: Array<{ ageCategory: string; amount: number }>, category: string): number {
  return records.find((record) => record.ageCategory === category)?.amount ?? 0;
}

function componentDto(component: {
  score: NumberValue;
  coverageRatio: number;
  status: string;
  denominatorPopulation: NumberValue;
  numericPopulation: NumberValue;
  evidenceCount: number;
  limitations: string[];
}) {
  return {
    score: component.score,
    coverageRatio: component.coverageRatio,
    status: component.status,
    denominatorPopulation: component.denominatorPopulation,
    numericPopulation: component.numericPopulation,
    evidenceCount: component.evidenceCount,
    limitations: component.limitations
  };
}

export const GET: RequestHandler = async () => {
  const [national, snapshot, islandRows] = await Promise.all([
    getNationalScore(),
    loadScoringSnapshot(),
    db
      .select({ id: Island.id, atollName: Atoll.name, longitude: Island.longitude, latitude: Island.latitude })
      .from(Island)
      .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
  ]);

  const atollByIsland = new Map(islandRows.map((row) => [row.id, row.atollName]));
  const islandById = new Map(islandRows.map((row) => [row.id, row]));
  const populationByIsland = new Map<string, number>();
  const population = { total: 0, children: 0, adolescents: 0, youth: 0, elderly: 0 };

  for (const record of snapshot.population) {
    if (record.ageCategory === 'total') populationByIsland.set(record.islandId, record.amount);
  }
  for (const island of snapshot.islands.filter((record) => record.islandType === 'inhabited')) {
    const records = snapshot.population.filter((record) => record.islandId === island.id);
    const total = populationByIsland.get(island.id) ?? records.reduce((sum, record) => sum + record.amount, 0);
    population.total += total;
    population.children +=
      populationValue(records, 'child_population_0_14') || populationValue(records, 'child_population_0_17');
    population.adolescents += populationValue(records, 'adolescent_population_10_19');
    population.youth +=
      populationValue(records, 'youth_population_18_35') || populationValue(records, 'youth_population_15_24');
    population.elderly += populationValue(records, 'elderly_population_65_plus');
  }

  const islands = national.scores.map((result) => {
    const island = islandById.get(result.islandId);

    return {
      id: result.islandId,
      name: result.islandName,
      atollName: atollByIsland.get(result.islandId) ?? 'Unknown atoll',
      centroid: island ? ([island.longitude, island.latitude] as [number, number]) : undefined,
      population: result.overall.denominatorPopulation,
      overall: componentDto(result.overall),
      health: componentDto(result.health),
      education: componentDto(result.education),
      transport: componentDto(result.transport),
      crowdedness: {
        score: result.crowdedness.score,
        population: result.crowdedness.population,
        pressure: result.crowdedness.pressure
      },
      demand: {
        health: result.externalDemand.inboundHealthDemand,
        education: result.externalDemand.inboundEducationDemand,
        total: (result.externalDemand.inboundHealthDemand ?? 0) + (result.externalDemand.inboundEducationDemand ?? 0),
        healthPressure: result.externalDemand.healthPressure,
        educationPressure: result.externalDemand.educationPressure
      },
      evidence: result.evidence,
      limitations: result.limitations
    };
  });

  return json({
    national: {
      score: national.score,
      status: national.status,
      islandCount: national.islandCount,
      inhabitedIslandCount: national.inhabitedIslandCount,
      scoredIslandCount: national.scoredIslandCount,
      partialIslandCount: national.partialIslandCount,
      unavailableIslandCount: national.unavailableIslandCount,
      categories: {
        health: componentDto(national.health),
        education: componentDto(national.education),
        transport: componentDto(national.transport),
        crowdedness: componentDto(national.crowdedness),
        externalDemand: componentDto(national.externalDemand)
      },
      limitations: national.limitations
    },
    population,
    islands
  });
};
