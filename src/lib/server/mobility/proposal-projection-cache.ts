import type { IslandServicesResponse } from '$components/mobility/island-services';
import type { ScenarioOperation } from '$lib/mobility/scenario-contracts';
import type { ScoringSnapshot } from '$lib/server/scoring/types';

import { createHash } from 'node:crypto';

type ProjectionLoader = typeof import('$lib/server/scoring/island-services').getIslandServices;
type CacheEntry = { request: Promise<IslandServicesResponse>; bytes: number };

function operationDigest(operations: readonly ScenarioOperation[]): string {
  const canonical = JSON.stringify(operations, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, (value as Record<string, unknown>)[key]])
        )
      : value
  );
  return createHash('sha256').update(canonical).digest('hex');
}

/** Private computed island services only. Validation, settings and cost quotes remain request-local. */
export class ProposalProjectionCache {
  private readonly snapshots = new WeakMap<ScoringSnapshot, number>();
  private readonly entries = new Map<string, CacheEntry>();
  private nextSnapshotId = 0;
  private bytes = 0;

  constructor(
    private readonly load: ProjectionLoader,
    private readonly limits = { maxEntries: 24, maxBytes: 48 * 1024 * 1024 }
  ) {}

  get(
    islandId: string,
    baseline: ScoringSnapshot,
    operations: readonly ScenarioOperation[],
    projected: ScoringSnapshot,
    islandContext?: Parameters<ProjectionLoader>[2],
    reference?: Parameters<ProjectionLoader>[3]
  ): Promise<IslandServicesResponse> {
    let snapshotId = this.snapshots.get(baseline);
    if (snapshotId === undefined) {
      snapshotId = this.nextSnapshotId++;
      this.snapshots.set(baseline, snapshotId);
    }
    const key = JSON.stringify([snapshotId, islandId, operationDigest(operations)]);
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.request;
    }

    const entry: CacheEntry = { bytes: 0, request: undefined! };
    entry.request = Promise.resolve()
      .then(() => this.load(islandId, projected, islandContext, reference))
      .then((value) => {
        if (this.entries.get(key) !== entry) return value;
        const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
        if (bytes > this.limits.maxBytes) {
          this.remove(key);
          return value;
        }
        entry.bytes = bytes;
        this.bytes += bytes;
        this.trim();
        return value;
      })
      .catch((failure: unknown) => {
        if (this.entries.get(key) === entry) this.remove(key);
        throw failure;
      });
    this.entries.set(key, entry);
    this.trim();
    return entry.request;
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
  }

  private trim(): void {
    while (this.entries.size > this.limits.maxEntries || this.bytes > this.limits.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }
}
