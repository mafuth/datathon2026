import type { RequestHandler } from '@sveltejs/kit';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

import { POST } from '../../src/routes/api/v1/scenarios/report.pdf/+server';

const report = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/mobility/mobility-facade', () => ({ mobilityFacade: { createProposalReport: report } }));

function event(body: string): Parameters<RequestHandler>[0] {
  return {
    request: new Request('http://localhost/api/v1/scenarios/report.pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
  } as Parameters<RequestHandler>[0];
}

const input = {
  baselineVersion: 'fixture-v1',
  selectedIslandId: 'island-1',
  operations: [],
  proposal: { name: 'Hulhumalé / review', capitalLimit: 50_000_000, annualLimit: 12_000_000 }
};

describe('canonical proposal PDF endpoint', () => {
  beforeEach(() => {
    report.mockReset();
  });

  it('validates requests before invoking the report service', async () => {
    const malformed = await POST(event('{'));
    expect(malformed.status).toBe(400);
    const invalid = await POST(event(JSON.stringify({ ...input, proposal: { ...input.proposal, annualLimit: -1 } })));
    expect(invalid.status).toBe(400);
    const invalidEstimate = await POST(
      event(
        JSON.stringify({
          ...input,
          operations: [
            {
              operationId: 'clinic',
              kind: 'add_service',
              serviceType: 'health',
              subtype: 'clinic',
              coordinates: [73, 3],
              estimate: { capital: -1, annual: 0, basis: 'Invalid amount' }
            }
          ]
        })
      )
    );
    expect(invalidEstimate.status).toBe(400);
    expect(report).not.toHaveBeenCalled();
  });

  it('exports only the fresh server report and prevents caching', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\ncanonical bytes');
    report.mockResolvedValue(bytes);
    const response = await POST(
      event(JSON.stringify({ ...input, costs: { capital: 0, annual: 0, withinBudget: true } }))
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="[a-zA-Z0-9_-]+\.pdf"$/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(report).toHaveBeenCalledWith(input);
  });

  it.each([
    ['ISLAND_NOT_FOUND', 404],
    ['TRANSPORT_NOT_FOUND', 404],
    ['BASELINE_VERSION_MISMATCH', 409],
    ['PROPOSAL_BUDGET_EXCEEDED', 422],
    ['PROPOSAL_COST_UNAVAILABLE', 422]
  ] as const)('returns stable %s domain errors without exporting stale evidence', async (code, status) => {
    report.mockRejectedValue(new ScenarioDomainError(code, 'Review the current proposal.', status));
    const response = await POST(event(JSON.stringify(input)));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code, error: 'Review the current proposal.' });
  });
});
