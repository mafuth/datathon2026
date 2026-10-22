import type { ResidentialDemandPoint, ScoringSnapshot } from './types';

const calculationSnapshots = new WeakMap<ScoringSnapshot, ScoringSnapshot>();

export function withResidentialDemandPoints(
  snapshot: ScoringSnapshot,
  points: ResidentialDemandPoint[]
): ScoringSnapshot {
  const spatial = { ...snapshot, residentialDemandPoints: points };
  calculationSnapshots.set(spatial, calculationSnapshot(snapshot));
  return spatial;
}

/** Only loader-created spatial views share calculations with their immutable base. */
export function calculationSnapshot(snapshot: ScoringSnapshot): ScoringSnapshot {
  return calculationSnapshots.get(snapshot) ?? snapshot;
}
