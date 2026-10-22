import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableName } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../../src/lib/server/database', () => ({ default: { select: () => ({ from: database.from }) } }));

let directory: string;
let normalized: string;
let databasePath: string;
let tables: Record<string, unknown[]>;
let clock: number;

beforeEach(() => {
  vi.resetModules();
  directory = mkdtempSync(join(tmpdir(), 'datathon-scoring-cache-'));
  normalized = join(directory, 'data/mobility/normalized');
  mkdirSync(normalized, { recursive: true });
  databasePath = join(directory, 'fixture.db');
  writeFileSync(databasePath, 'fixture');
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
  vi.stubEnv('DATABASE_URL', `file:${databasePath}`);
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  tables = {};
  database.from.mockReset();
  database.from.mockImplementation((table) => Promise.resolve(tables[getTableName(table)] ?? []));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('scoring source cache', () => {
  it('checks local source versions without reading database rows and shares base/spatial loads', async () => {
    const { getScoringSourceVersion, loadScoringSnapshot } =
      await import('../../src/lib/server/scoring/database-input');
    const version = await getScoringSourceVersion();
    expect(database.from).not.toHaveBeenCalled();
    const [base, spatial] = await Promise.all([
      loadScoringSnapshot(),
      loadScoringSnapshot({ includeResidentialDemandPoints: true })
    ]);
    expect(database.from).toHaveBeenCalledTimes(7);
    expect(base.residentialDemandPoints).toBeUndefined();
    expect(spatial.residentialDemandPoints).toEqual([]);
    expect(spatial.islands).toBe(base.islands);
    expect(await loadScoringSnapshot()).toBe(base);
    expect(await loadScoringSnapshot({ includeResidentialDemandPoints: true })).toBe(spatial);
    expect(await getScoringSourceVersion()).toBe(version);
    expect(database.from).toHaveBeenCalledTimes(7);
  });

  it('invalidates snapshots immediately for database writes and WAL writes, ignoring reader SHM metadata', async () => {
    const { getScoringSourceVersion, loadScoringSnapshot } =
      await import('../../src/lib/server/scoring/database-input');
    const original = await loadScoringSnapshot();
    const originalVersion = await getScoringSourceVersion();
    writeFileSync(`${databasePath}-shm`, 'reader-lock');
    expect(await loadScoringSnapshot()).toBe(original);
    writeFileSync(`${databasePath}-wal`, 'transaction-1');
    const walSnapshot = await loadScoringSnapshot();
    expect(walSnapshot).not.toBe(original);
    expect(await getScoringSourceVersion()).not.toBe(originalVersion);
    const walVersion = await getScoringSourceVersion();
    utimesSync(databasePath, new Date(2_000_000), new Date(2_000_000));
    expect(await loadScoringSnapshot()).not.toBe(walSnapshot);
    expect(await getScoringSourceVersion()).not.toBe(walVersion);
    expect(database.from).toHaveBeenCalledTimes(21);
  });

  it('refreshes parsed RTL and residential artifacts when files change or appear', async () => {
    const { loadScoringSnapshot } = await import('../../src/lib/server/scoring/database-input');
    const empty = await loadScoringSnapshot({ includeResidentialDemandPoints: true });
    writeFileSync(
      join(normalized, 'rtl-bus.json'),
      JSON.stringify({
        stops: [{ id: 'rtl:bus-stop:1', island_id: 'island-1', latitude: 3, longitude: 73 }],
        routes: [{ id: 'route-1', stop_ids: ['1'] }]
      })
    );
    writeFileSync(
      join(normalized, 'osm-sample-fixture.json'),
      JSON.stringify({
        island: { id: 'island-1' },
        elements: [{ type: 'way', id: 1, tags: { building: 'house' }, center: { lat: 3, lon: 73 } }]
      })
    );
    const refreshed = await loadScoringSnapshot({ includeResidentialDemandPoints: true });
    expect(refreshed).not.toBe(empty);
    expect(refreshed.transportStops[0].routeIds).toEqual(['route-1']);
    expect(refreshed.residentialDemandPoints).toEqual([
      { id: 'osm-building:island-1:1', islandId: 'island-1', coordinates: [73, 3], weight: 1 }
    ]);
    rmSync(join(normalized, 'osm-sample-fixture.json'));
    const removed = await loadScoringSnapshot({ includeResidentialDemandPoints: true });
    expect(removed.residentialDemandPoints).toEqual([]);
    expect(removed.transportStops).toEqual(refreshed.transportStops);
  });

  it('revalidates remote rows after fifteen seconds, preserving unchanged identity and tracking atoll-only edits', async () => {
    vi.stubEnv('DATABASE_URL', 'libsql://cache-test.invalid');
    tables.atoll = [{ id: 'atoll-1', name: 'Original' }];
    const { getScoringSourceVersion, loadScoringSnapshot } =
      await import('../../src/lib/server/scoring/database-input');
    const original = await loadScoringSnapshot();
    const version = await getScoringSourceVersion();
    clock += 14_999;
    expect(await loadScoringSnapshot()).toBe(original);
    expect(database.from).toHaveBeenCalledTimes(8);
    clock += 2;
    expect(await loadScoringSnapshot()).toBe(original);
    expect(await getScoringSourceVersion()).toBe(version);
    expect(database.from).toHaveBeenCalledTimes(16);
    tables.atoll = [{ id: 'atoll-1', name: 'Updated' }];
    clock += 15_001;
    expect(await getScoringSourceVersion()).not.toBe(version);
    expect(await loadScoringSnapshot()).not.toBe(original);
    expect(database.from).toHaveBeenCalledTimes(24);
  });

  it('retries failed database loads instead of retaining a rejected request', async () => {
    database.from.mockRejectedValueOnce(new Error('database unavailable'));
    const { loadScoringSnapshot } = await import('../../src/lib/server/scoring/database-input');
    await expect(loadScoringSnapshot()).rejects.toThrow('database unavailable');
    const recovered = await loadScoringSnapshot();
    expect(recovered.islands).toEqual([]);
    expect(await loadScoringSnapshot()).toBe(recovered);
    expect(database.from).toHaveBeenCalledTimes(14);
  });

  it('discards rows read while the local source changes and retries against the new stamp', async () => {
    database.from.mockImplementationOnce(() => {
      writeFileSync(`${databasePath}-wal`, 'concurrent-transaction');
      return Promise.resolve([]);
    });
    const { getScoringSourceVersion, loadScoringSnapshot } =
      await import('../../src/lib/server/scoring/database-input');
    const before = await getScoringSourceVersion();
    const current = await loadScoringSnapshot();
    expect(database.from).toHaveBeenCalledTimes(14);
    expect(await getScoringSourceVersion()).not.toBe(before);
    expect(await loadScoringSnapshot()).toBe(current);
  });
});
