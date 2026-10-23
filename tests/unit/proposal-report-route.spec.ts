import type { RequestHandler } from '@sveltejs/kit';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

import { POST } from '../../src/routes/api/v1/scenarios/report.pdf/+server';

const createProposalReport = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/mobility/mobility-facade', () => ({
  mobilityFacade: { createProposalReport }
}));

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

describe('proposal report PDF endpoint', () => {
  beforeEach(() => {
    createProposalReport.mockReset();
  });

  it('rejects malformed JSON without invoking the report service', async () => {
    const response = await POST(event('{'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'INVALID_INPUT',
      error: 'Request body must be valid JSON.'
    });
    expect(createProposalReport).not.toHaveBeenCalled();
  });

  it.each([
    ['missing required fields', {}],
    ['negative annual limit', { ...input, proposal: { ...input.proposal, annualLimit: -1 } }],
    [
      'negative operation estimate',
      {
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
      }
    ]
  ])('rejects %s', async (_description, body) => {
    const response = await POST(event(JSON.stringify(body)));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      code: 'INVALID_INPUT',
      error: 'Proposal report input is invalid.'
    });
    expect(payload.issues).toBeInstanceOf(Array);
    expect(createProposalReport).not.toHaveBeenCalled();
  });

  it('returns canonical PDF bytes with download and security headers', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\ncanonical bytes');
    createProposalReport.mockResolvedValue(bytes);

    const response = await POST(event(JSON.stringify(input)));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Hulhumale-review.pdf"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(createProposalReport).toHaveBeenCalledOnce();
    expect(createProposalReport).toHaveBeenCalledWith(input);
  });

  it('ignores client-computed extras and passes only parsed canonical input', async () => {
    createProposalReport.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const clientInput = {
      ...input,
      costs: { capital: 1, annual: 2, withinBudget: false },
      impact: { score: 999 },
      proposal: { ...input.proposal, serverTotal: -1 }
    };

    await POST(event(JSON.stringify(clientInput)));

    expect(createProposalReport).toHaveBeenCalledWith(input);
  });

  it.each([
    ['ISLAND_NOT_FOUND', 404],
    ['SERVICE_NOT_FOUND', 404],
    ['SERVICE_NOT_ON_SELECTED_ISLAND', 422],
    ['SERVICE_ALREADY_DELETED', 422],
    ['SERVICE_CATALOG_MISMATCH', 422],
    ['ADD_OUTSIDE_ISLAND', 422],
    ['SERVICE_ID_COLLISION', 409],
    ['UPGRADE_NOT_ELIGIBLE', 422],
    ['DOWNGRADE_NOT_ELIGIBLE', 422],
    ['MOVE_OUTSIDE_ISLAND', 422],
    ['BASELINE_VERSION_MISMATCH', 409],
    ['OPERATION_CONFLICT', 409],
    ['PROPOSAL_COST_UNAVAILABLE', 422],
    ['PROPOSAL_BUDGET_EXCEEDED', 422]
  ] as const)('maps the %s domain error', async (code, status) => {
    createProposalReport.mockRejectedValue(new ScenarioDomainError(code, 'Review the current proposal.', status));

    const response = await POST(event(JSON.stringify(input)));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      code,
      error: 'Review the current proposal.'
    });
  });

  it('returns a stable unavailable response for unexpected errors', async () => {
    const error = new Error('PDF renderer failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createProposalReport.mockRejectedValue(error);

    const response = await POST(event(JSON.stringify(input)));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: 'PROPOSAL_REPORT_UNAVAILABLE',
      error: 'The proposal report is unavailable. Retry the current proposal review.'
    });
    expect(consoleError).toHaveBeenCalledWith('Proposal report generation failed:', error);
    consoleError.mockRestore();
  });
});
