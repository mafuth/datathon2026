import type { DemandAllocationResult, IslandScoreResult, ScoringSnapshot } from './types';

import { loadScoringSnapshot } from './database-input';
import { buildDemandAllocation } from './demand-allocation';
import { calculateIslandScore } from './factors';

const islandScoreCache = new WeakMap<
  ScoringSnapshot,
  WeakMap<DemandAllocationResult, Map<string, IslandScoreResult>>
>();

export async function getIslandScore(
  islandId: string,
  snapshot: ScoringSnapshot | undefined = undefined,
  demandAllocations: DemandAllocationResult | undefined = undefined
): Promise<IslandScoreResult> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new Error('Island ID is required');
  const scoringSnapshot = snapshot ?? (await loadScoringSnapshot());
  const scoringDemandAllocations = demandAllocations ?? buildDemandAllocation(scoringSnapshot);
  let byAllocation = islandScoreCache.get(scoringSnapshot);
  if (!byAllocation) {
    byAllocation = new WeakMap<DemandAllocationResult, Map<string, IslandScoreResult>>();
    islandScoreCache.set(scoringSnapshot, byAllocation);
  }
  let byIsland = byAllocation.get(scoringDemandAllocations);
  if (!byIsland) {
    byIsland = new Map<string, IslandScoreResult>();
    byAllocation.set(scoringDemandAllocations, byIsland);
  }
  const cached = byIsland.get(normalizedId);
  if (cached) return cached;

  const result = calculateIslandScore(normalizedId, scoringSnapshot, scoringDemandAllocations);
  byIsland.set(normalizedId, result);
  return result;
}
