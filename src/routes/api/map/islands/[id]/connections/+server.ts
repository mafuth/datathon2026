import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';

import { waitForMobilityApiDelay } from '$lib/server/mobility/api-delay';
import { publicMapResponse } from '$lib/server/mobility/public-map-response';
import { getIslandConnections, IslandConnectionsNotFoundError } from '$lib/server/scoring/island-connections';

export const GET: RequestHandler = async ({ params, request }) => {
  await waitForMobilityApiDelay();
  try {
    return await publicMapResponse(request, `map/islands/${params.id}/connections`, () =>
      getIslandConnections(params.id ?? '')
    );
  } catch (error) {
    if (error instanceof IslandConnectionsNotFoundError) return json({ error: error.message }, { status: 404 });
    console.error('Island connections request failed:', error);
    return json({ error: 'Island connections are unavailable.' }, { status: 500 });
  }
};
