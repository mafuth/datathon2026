import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';
import * as v from 'valibot';

import { scenarioPreviewRequestSchema } from '$lib/mobility/scenario-contracts';
import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: 'INVALID_INPUT', error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const parsed = v.safeParse(scenarioPreviewRequestSchema, body);
  if (!parsed.success) {
    return json(
      { code: 'INVALID_INPUT', error: 'Proposal report input is invalid.', issues: parsed.issues },
      { status: 400 }
    );
  }
  try {
    const bytes = await mobilityFacade.createProposalReport(parsed.output);
    const fileName =
      (parsed.output.proposal?.name || 'proposal-review')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'proposal-review';
    return new Response(new Uint8Array(bytes).buffer, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${fileName}.pdf"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch (error) {
    if (error instanceof ScenarioDomainError) {
      return json({ code: error.code, error: error.message }, { status: error.status });
    }
    console.error('Proposal report generation failed:', error);
    return json(
      {
        code: 'PROPOSAL_REPORT_UNAVAILABLE',
        error: 'The proposal report is unavailable. Retry the current proposal review.'
      },
      { status: 500 }
    );
  }
};
