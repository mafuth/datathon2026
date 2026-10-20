import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';

import { getIslandServices, IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json(await getIslandServices(params.id ?? ''));
  } catch (error) {
    if (error instanceof IslandServicesNotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }
    console.error('Island services request failed:', error);
    return json({ error: 'Island services are unavailable.' }, { status: 500 });
  }
};
