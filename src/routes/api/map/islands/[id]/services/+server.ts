import type { RequestHandler } from '@sveltejs/kit';

import { waitForMobilityApiDelay } from '$lib/server/mobility/api-delay';
import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { publicMapResponse } from '$lib/server/mobility/public-map-response';
import { IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

export const GET: RequestHandler = async ({ params, request }) => {
  await waitForMobilityApiDelay();

  try {
    return await publicMapResponse(request, `map/islands/${params.id}/services`, () =>
      mobilityFacade.getIslandServices(params.id ?? '')
    );
  } catch (error) {
    if (error instanceof IslandServicesNotFoundError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }
    console.error('Island services request failed:', error);
    return new Response(JSON.stringify({ error: 'Island services are unavailable.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
