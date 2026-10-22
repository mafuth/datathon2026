import type { IslandServicesResponse } from '$components/mobility/island-services';
import type { ScoringSnapshot } from '$lib/server/scoring/types';

type BaselineLoader = (islandId: string, snapshot: ScoringSnapshot) => Promise<IslandServicesResponse>;
type CacheEntry = { request: Promise<IslandServicesResponse>; bytes: number };

/** Only immutable baseline calculations belong here; user draft projections stay request-local. */
export class BaselineServicesCache {
  private readonly snapshots = new WeakMap<ScoringSnapshot, number>();
  private readonly entries = new Map<string, CacheEntry>();
  private nextSnapshotId = 0;
  private bytes = 0;

  constructor(
    private readonly load: BaselineLoader,
    private readonly limits = { maxEntries: 8, maxBytes: 12 * 1024 * 1024 }
  ) {}

  get(islandId: string, snapshot: ScoringSnapshot): Promise<IslandServicesResponse> {
    let snapshotId = this.snapshots.get(snapshot);
    if (snapshotId === undefined) {
      snapshotId = this.nextSnapshotId++;
      this.snapshots.set(snapshot, snapshotId);
    }
    const key = JSON.stringify([snapshotId, islandId]);
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.request;
    }

    const entry: CacheEntry = { bytes: 0, request: undefined! };
    entry.request = Promise.resolve()
      .then(() => this.load(islandId, snapshot))
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
      .catch((error: unknown) => {
        if (this.entries.get(key) === entry) this.remove(key);
        throw error;
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
