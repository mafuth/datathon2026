import type { ProposalSettings } from './proposal-planning';

import * as v from 'valibot';

import { DEFAULT_PROPOSAL_SETTINGS } from './proposal-planning';
import { scenarioPreviewRequestSchema } from './scenario-contracts';

const DEFAULTS_KEY = 'mobility:proposal:defaults:v1';
const proposalSettingsSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  capitalLimit: v.pipe(
    v.number(),
    v.check((value: number) => Number.isFinite(value)),
    v.minValue(0),
    v.maxValue(1_000_000_000_000)
  ),
  annualLimit: v.pipe(
    v.number(),
    v.check((value: number) => Number.isFinite(value)),
    v.minValue(0),
    v.maxValue(1_000_000_000_000)
  )
});

const draftSchema = v.pipe(
  v.object({
    version: v.literal(1),
    ...scenarioPreviewRequestSchema.entries,
    cursor: v.pipe(v.number(), v.integer(), v.minValue(0)),
    savedAt: v.pipe(v.string(), v.isoTimestamp())
  }),
  v.check((draft) => draft.cursor <= draft.operations.length, 'Invalid history position.'),
  v.check(
    (draft) => new Set(draft.operations.map((operation) => operation.operationId)).size === draft.operations.length,
    'Duplicate operation identifiers.'
  )
);

export type ProposalDraft = v.InferOutput<typeof draftSchema>;
export type DraftReadResult =
  | { status: 'ready'; draft: ProposalDraft }
  | { status: 'empty' }
  | { status: 'invalid' | 'unavailable'; message: string };

function draftKey(islandId: string): string {
  return `mobility:proposal:v1:${encodeURIComponent(islandId)}`;
}

export function readProposalDraft(islandId: string): DraftReadResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(draftKey(islandId));
  } catch {
    return {
      status: 'unavailable',
      message: 'Browser storage is unavailable. Changes are kept only for this session.'
    };
  }
  if (raw === null) return { status: 'empty' };
  try {
    if (raw.length > 250_000) throw new Error('Draft exceeds storage limit.');
    const parsed = v.safeParse(draftSchema, JSON.parse(raw));
    if (!parsed.success || parsed.output.selectedIslandId !== islandId) throw new Error('Invalid draft.');
    return { status: 'ready', draft: parsed.output };
  } catch {
    return {
      status: 'invalid',
      message: 'The saved draft is invalid or uses an unsupported format. It has not been overwritten.'
    };
  }
}

export function saveProposalDraft(draft: ProposalDraft): string | null {
  try {
    window.localStorage.setItem(draftKey(draft.selectedIslandId), JSON.stringify(draft));
    return null;
  } catch {
    return 'Could not autosave in this browser. Changes are kept only for this session.';
  }
}

export function readProposalDefaults(): ProposalSettings {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return { ...DEFAULT_PROPOSAL_SETTINGS };
    const parsed = v.safeParse(proposalSettingsSchema, JSON.parse(raw));
    return parsed.success ? parsed.output : { ...DEFAULT_PROPOSAL_SETTINGS };
  } catch {
    return { ...DEFAULT_PROPOSAL_SETTINGS };
  }
}

export function saveProposalDefaults(settings: ProposalSettings): string | null {
  try {
    window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(settings));
    return null;
  } catch {
    return 'Could not save proposal defaults in this browser.';
  }
}

export function restoreProposalDefaults(): ProposalSettings {
  try {
    window.localStorage.removeItem(DEFAULTS_KEY);
  } catch {
    return { ...DEFAULT_PROPOSAL_SETTINGS };
  }
  return { ...DEFAULT_PROPOSAL_SETTINGS };
}

export function proposalExportFilename(atoll: string, island: string, date = new Date()): string {
  const slug = (value: string, fallback: string) =>
    value
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || fallback;
  return `${slug(atoll, 'atoll')}-${slug(island, 'island')}-draft-proposal-${date.toISOString().slice(0, 10)}.pdf`;
}
