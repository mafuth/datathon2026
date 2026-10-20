export type ZeroScoreClassification =
  'missing_service' | 'missing_island_mapping' | 'missing_connection' | 'score_semantics';

export type CoverageEvidence = {
  databaseServiceCount: number;
  canonicalMappedServiceCount: number;
  canonicalUnmappedServiceCount: number;
  transportConnectionCount: number;
};

export function classifyZeroScore(
  category: 'health' | 'education' | 'transport',
  evidence: CoverageEvidence
): ZeroScoreClassification {
  if (evidence.databaseServiceCount > 0 || evidence.canonicalMappedServiceCount > 0) return 'score_semantics';
  if (evidence.canonicalUnmappedServiceCount > 0) return 'missing_island_mapping';
  if (category === 'transport' && evidence.transportConnectionCount === 0) return 'missing_connection';
  return 'missing_service';
}
