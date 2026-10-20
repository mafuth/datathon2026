import type { IslandScoreResult, ScoringSnapshot } from './types';

import { loadScoringSnapshot } from './database-input';
import { calculateIslandScore } from './factors';

export async function getIslandScore(
  islandId: string,
  snapshot: ScoringSnapshot | undefined = undefined
): Promise<IslandScoreResult> {
  const normalizedId = islandId.trim();
  if (!normalizedId) throw new Error('Island ID is required');
  return calculateIslandScore(normalizedId, snapshot ?? (await loadScoringSnapshot()));
}
