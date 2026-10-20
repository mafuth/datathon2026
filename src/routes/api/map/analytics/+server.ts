import type { RequestHandler } from '@sveltejs/kit';
import type { TransportDemandResult } from '$lib/server/scoring/types';

import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { Atoll, Island } from '$lib/db/models';
import db from '$lib/server/database';
import { buildAnalyticsRankings } from '$lib/server/scoring/analytics-rankings';
import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { populationForIsland, totalPopulation } from '$lib/server/scoring/demand-allocation';
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

function demandMetricDto(metric: {
  local: number;
  inbound: number;
  outbound: number;
  unserved: number;
  combined: number;
  demandPercent: number | null;
  outboundPercent: number | null;
}) {
  return {
    local: metric.local,
    inbound: metric.inbound,
    outbound: metric.outbound,
    unserved: metric.unserved,
    combined: metric.combined,
    demandPercent: metric.demandPercent === null ? null : metric.demandPercent * 100,
    outboundPercent: metric.outboundPercent === null ? null : metric.outboundPercent * 100
  };
}

function optionalDemandMetricDto(metric: Parameters<typeof demandMetricDto>[0] | undefined) {
  return metric ? demandMetricDto(metric) : null;
}

function demandDto(
  demand: {
    population: number | null;
    health: Parameters<typeof demandMetricDto>[0];
    education: Parameters<typeof demandMetricDto>[0];
    healthByNeed: Record<string, Parameters<typeof demandMetricDto>[0]>;
    educationByNeed: Record<string, Parameters<typeof demandMetricDto>[0]>;
    inboundSources: Array<{ originIslandId: string; health: number; education: number; total: number }>;
  },
  islandById: Map<string, { name: string; atollName: string }>
) {
  return {
    population: demand.population,
    health: demandMetricDto(demand.health),
    education: demandMetricDto(demand.education),
    healthCareDemand: {
      children: optionalDemandMetricDto(demand.healthByNeed.maternal_child),
      elderly: optionalDemandMetricDto(demand.healthByNeed.chronic_elderly)
    },
    healthByNeed: Object.fromEntries(
      Object.entries(demand.healthByNeed).map(([key, value]) => [key, demandMetricDto(value)])
    ),
    educationByNeed: Object.fromEntries(
      Object.entries(demand.educationByNeed).map(([key, value]) => [key, demandMetricDto(value)])
    ),
    inboundSources: demand.inboundSources.map((source) => ({
      ...source,
      originName: islandById.get(source.originIslandId)?.name ?? source.originIslandId,
      originAtollName: islandById.get(source.originIslandId)?.atollName ?? 'Unknown atoll'
    })),
    localTotal: demand.health.local + demand.education.local,
    inboundTotal: demand.health.inbound + demand.education.inbound,
    outboundTotal: demand.health.outbound + demand.education.outbound,
    unservedTotal: demand.health.unserved + demand.education.unserved,
    combinedTotal: demand.health.combined + demand.education.combined
  };
}

function transportDemandDto(demand: TransportDemandResult) {
  return {
    workingDemand: demand.workingDemand,
    studentDemand: demand.studentDemand,
    elderlyDemand: demand.elderlyDemand,
    careTransferDemand: demand.careTransferDemand,
    totalDemand: demand.totalDemand,
    averageLoad: demand.averageLoad,
    score: demand.score,
    modes: demand.modes,
    stops: demand.stops.map((stop) => ({
      stopId: stop.stopId,
      stopName: stop.stopName,
      subtype: stop.subtype,
      mode: stop.mode,
      connectedIslandIds: stop.connectedIslandIds,
      localDemand: stop.localDemand,
      connectedDemand: stop.connectedDemand,
      workingDemand: stop.workingDemand,
      studentDemand: stop.studentDemand,
      elderlyDemand: stop.elderlyDemand,
      careTransferDemand: stop.careTransferDemand,
      totalDemand: stop.totalDemand,
      capacity: stop.capacity,
      loadRatio: stop.loadRatio,
      score: stop.score
    }))
  };
}

function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  return numeric.length === 0
    ? null
    : Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2));
}

function aggregateTransportDemand(results: TransportDemandResult[]) {
  const mode = (key: 'land' | 'marine' | 'air') => ({
    stopCount: results.reduce((sum, result) => sum + result.modes[key].stopCount, 0),
    totalDemand: average(results.map((result) => result.modes[key].totalDemand)) ?? 0,
    careTransferDemand: average(results.map((result) => result.modes[key].careTransferDemand)) ?? 0,
    averageLoad: average(results.map((result) => result.modes[key].averageLoad)),
    score: average(results.map((result) => result.modes[key].score))
  });
  return {
    workingDemand: average(results.map((result) => result.workingDemand)) ?? 0,
    studentDemand: average(results.map((result) => result.studentDemand)) ?? 0,
    elderlyDemand: average(results.map((result) => result.elderlyDemand)) ?? 0,
    careTransferDemand: average(results.map((result) => result.careTransferDemand)) ?? 0,
    totalDemand: average(results.map((result) => result.totalDemand)) ?? 0,
    averageLoad: average(results.map((result) => result.averageLoad)),
    score: average(results.map((result) => result.score)),
    modes: { land: mode('land'), marine: mode('marine'), air: mode('air') }
  };
}

export const GET: RequestHandler = async () => {
  const [national, snapshot, islandRows] = await Promise.all([
    getNationalScore(),
    loadScoringSnapshot(),
    db
      .select({
        id: Island.id,
        name: Island.name,
        atollName: Atoll.name,
        longitude: Island.longitude,
        latitude: Island.latitude
      })
      .from(Island)
      .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
  ]);

  const atollByIsland = new Map(islandRows.map((row) => [row.id, row.atollName]));
  const islandById = new Map(islandRows.map((row) => [row.id, row]));
  const nationalTransportDemand = aggregateTransportDemand(national.scores.map((result) => result.transport.demand));
  const populationByIsland = new Map<string, number>();
  const population = { total: 0, children: 0, adolescents: 0, youth: 0, elderly: 0 };

  for (const record of snapshot.population) {
    if (record.ageCategory === 'total') populationByIsland.set(record.islandId, record.amount);
  }
  for (const island of snapshot.islands.filter((record) => record.islandType === 'inhabited')) {
    const records = populationForIsland(snapshot, island.id);
    const total = populationByIsland.get(island.id) ?? totalPopulation(records) ?? 0;
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
        pressure: result.crowdedness.pressure,
        populationDensity: result.crowdedness.populationDensity,
        landAreaKm2: result.crowdedness.landAreaKm2
      },
      transportModes: {
        land: componentDto(result.transport.land),
        marine: componentDto(result.transport.marine),
        air: componentDto(result.transport.air)
      },
      transportDemand: transportDemandDto(result.transport.demand),
      demand: {
        score:
          result.externalDemand.healthFactor === null || result.externalDemand.educationFactor === null
            ? null
            : ((result.externalDemand.healthFactor + result.externalDemand.educationFactor) / 2) * 100,
        status: result.externalDemand.status,
        coverageRatio: result.externalDemand.status === 'unavailable' ? 0 : 1,
        ...demandDto(result.demand, islandById),
        inboundHealthPressure: result.externalDemand.inboundHealthPressure,
        inboundEducationPressure: result.externalDemand.inboundEducationPressure,
        healthPressure: result.externalDemand.healthPressure,
        educationPressure: result.externalDemand.educationPressure
      },
      evidence: result.evidence,
      limitations: result.limitations
    };
  });

  const rankingInputs = islands.map((island) => ({
    id: island.id,
    overall: island.overall.score,
    health: island.health.score,
    education: island.education.score,
    transport: island.transport.score,
    demand: island.demand.inboundTotal,
    outboundDemand: island.demand.outboundTotal,
    pressure: Math.max(island.demand.healthPressure ?? 0, island.demand.educationPressure ?? 0)
  }));
  const rankings = buildAnalyticsRankings(rankingInputs);

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
      demand: demandDto(national.demand, islandById),
      transportDemand: nationalTransportDemand,
      limitations: national.limitations
    },
    population,
    islands,
    rankings
  });
};
