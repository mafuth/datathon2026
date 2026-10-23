import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readProposalDefaults,
  readProposalDraft,
  restoreProposalDefaults,
  saveProposalDefaults,
  saveProposalDraft
} from '../../src/lib/mobility/proposal-draft';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
});

describe('proposal browser persistence', () => {
  it('uses built-in budget defaults and can save and restore browser-wide defaults', () => {
    expect(readProposalDefaults()).toMatchObject({ capitalLimit: 50_000_000, annualLimit: 12_000_000 });
    expect(
      saveProposalDefaults({ name: 'Default proposal', capitalLimit: 70_000_000, annualLimit: 9_000_000 })
    ).toBeNull();
    expect(readProposalDefaults()).toEqual({
      name: 'Default proposal',
      capitalLimit: 70_000_000,
      annualLimit: 9_000_000
    });
    expect(restoreProposalDefaults()).toMatchObject({ capitalLimit: 50_000_000, annualLimit: 12_000_000 });
  });

  it('persists proposal settings inside each island draft', () => {
    const draft = {
      version: 1 as const,
      selectedIslandId: 'island:1',
      baselineVersion: 'baseline-v1',
      operations: [],
      proposal: { name: 'Saved island plan', capitalLimit: 65_000_000, annualLimit: 8_000_000 },
      cursor: 0,
      savedAt: '2026-10-23T00:00:00.000Z'
    };
    expect(saveProposalDraft(draft)).toBeNull();
    expect(readProposalDraft('island:1')).toEqual({ status: 'ready', draft });
  });
});
