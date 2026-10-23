import type { ScoringSnapshot } from '$lib/server/scoring/types';

import { createHash } from 'node:crypto';

// Loaded and projected scoring snapshots are immutable. Reusing their version
// avoids sorting and serializing the entire national dataset for every preview.
const versions = new WeakMap<ScoringSnapshot, string>();

export function proposalBaselineVersion(snapshot: ScoringSnapshot): string {
  const cached = versions.get(snapshot);
  if (cached) return cached;
  const digest = createHash('sha256');
  const sections = Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right));
  for (const [name, rows] of sections) {
    digest.update(`${name.length}:${name}`);
    const sorted = (rows ?? [])
      .map((row) =>
        JSON.stringify(row, (_key, value: unknown) => {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
          return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
        })
      )
      .sort();
    for (const row of sorted) digest.update(`${row.length}:${row}`);
  }
  const version = `proposal-baseline-v2:${digest.digest('hex').slice(0, 24)}`;
  versions.set(snapshot, version);
  return version;
}
