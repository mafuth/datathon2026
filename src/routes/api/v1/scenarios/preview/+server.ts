import type { RequestHandler } from '@sveltejs/kit';

import * as v from 'valibot';

import { scenarioPreviewRequestSchema } from '$lib/mobility/scenario-contracts';
import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { privateJsonResponse } from '$lib/server/mobility/response-compression';
import { ScenarioDomainError } from '$lib/server/mobility/scenario-engine';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJsonResponse(request, { code: 'INVALID_INPUT', error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = v.safeParse(scenarioPreviewRequestSchema, body);
  if (!parsed.success) {
    return privateJsonResponse(
      request,
      { code: 'INVALID_INPUT', error: 'Scenario preview input is invalid.', issues: parsed.issues },
      400
    );
  }

  try {
    return privateJsonResponse(request, await mobilityFacade.previewScenario(parsed.output));
  } catch (error) {
    if (error instanceof ScenarioDomainError) {
      return privateJsonResponse(request, { code: error.code, error: error.message }, error.status);
    }
    console.error('Scenario preview request failed:', error);
    return privateJsonResponse(
      request,
      { code: 'SCENARIO_UNAVAILABLE', error: 'Scenario preview is unavailable.' },
      500
    );
  }
};
