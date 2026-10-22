import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';
import * as v from 'valibot';

import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { ProposalTransportError } from '$lib/server/mobility/proposal-transport';
import { publicMapResponse } from '$lib/server/mobility/public-map-response';

export const GET: RequestHandler = async ({ url, request }) => {
  const parsed = v.safeParse(v.pipe(v.string(), v.minLength(1), v.maxLength(160)), url.searchParams.get('islandId'));
  if (!parsed.success)
    return json({ code: 'INVALID_INPUT', error: 'A selected island ID is required.' }, { status: 400 });
  try {
    return await publicMapResponse(request, `transport-options/${parsed.output}`, () =>
      mobilityFacade.getProposalTransportOptions(parsed.output)
    );
  } catch (error) {
    if (error instanceof ProposalTransportError)
      return json({ code: error.code, error: error.message }, { status: error.status });
    console.error('Transport proposal options failed:', error);
    return json(
      { code: 'TRANSPORT_UNAVAILABLE', error: 'Transport planning options are temporarily unavailable.' },
      { status: 503 }
    );
  }
};
