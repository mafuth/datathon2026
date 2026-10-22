import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';

import { waitForMobilityApiDelay } from '$lib/server/mobility/api-delay';
import { publicMapResponse } from '$lib/server/mobility/public-map-response';
import { getIslandProfile, IslandProfileNotFoundError } from '$lib/server/scoring/island-profile';

export const GET: RequestHandler = async ({ params, request }) => {
  await waitForMobilityApiDelay();

  try {
    return await publicMapResponse(request, `map/islands/${params.id}/profile`, () =>
      getIslandProfile(params.id ?? '')
    );
  } catch (error) {
    if (error instanceof IslandProfileNotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }
    console.error('Island profile request failed:', error);
    return json({ error: 'Island profile is unavailable.' }, { status: 500 });
  }
};
