import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';

import { getIslandProfile, IslandProfileNotFoundError } from '$lib/server/scoring/island-profile';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json(await getIslandProfile(params.id ?? ''));
  } catch (error) {
    if (error instanceof IslandProfileNotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }
    console.error('Versioned island profile request failed:', error);
    return json({ error: 'Island profile is unavailable.' }, { status: 500 });
  }
};
