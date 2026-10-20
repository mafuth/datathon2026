import type { RequestHandler } from '@sveltejs/kit';

import * as v from 'valibot';

import { scenarioPreviewRequestSchema } from '$lib/mobility/scenario-contracts';
import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ code: 'INVALID_INPUT', error: 'Request body must be valid JSON.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  const parsed = v.safeParse(scenarioPreviewRequestSchema, body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ code: 'INVALID_INPUT', error: 'Scenario preview input is invalid.', issues: parsed.issues }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    return new Response(JSON.stringify(await mobilityFacade.previewScenario(parsed.output)), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    if (error instanceof ScenarioDomainError) {
      return new Response(JSON.stringify({ code: error.code, error: error.message }), {
        status: error.status,
        headers: { 'content-type': 'application/json' }
      });
    }
    console.error('Scenario preview request failed:', error);
    return new Response(JSON.stringify({ code: 'SCENARIO_UNAVAILABLE', error: 'Scenario preview is unavailable.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
