import type { ScoringSnapshot } from './types';

function groupByIsland<T extends { islandId: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (row.islandId === null) continue;
    const existing = grouped.get(row.islandId);
    if (existing) existing.push(row);
    else grouped.set(row.islandId, [row]);
  }
  return grouped;
}

const populationIndexes = new WeakMap<ScoringSnapshot['population'], Map<string, ScoringSnapshot['population']>>();
const serviceIndexes = new WeakMap<ScoringSnapshot['services'], Map<string, ScoringSnapshot['services']>>();
const islandIndexes = new WeakMap<ScoringSnapshot['islands'], Map<string, ScoringSnapshot['islands'][number]>>();

export function indexedPopulation(snapshot: ScoringSnapshot) {
  let index = populationIndexes.get(snapshot.population);
  if (!index) populationIndexes.set(snapshot.population, (index = groupByIsland(snapshot.population)));
  return index;
}

export function indexedServices(snapshot: ScoringSnapshot) {
  let index = serviceIndexes.get(snapshot.services);
  if (!index) serviceIndexes.set(snapshot.services, (index = groupByIsland(snapshot.services)));
  return index;
}

export function indexedIslands(snapshot: ScoringSnapshot) {
  let index = islandIndexes.get(snapshot.islands);
  if (!index)
    islandIndexes.set(snapshot.islands, (index = new Map(snapshot.islands.map((island) => [island.id, island]))));
  return index;
}
