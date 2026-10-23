import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';

import { mobilityFacade } from '$lib/server/mobility/mobility-facade';

export const GET: RequestHandler = async () => {
  try {
    return json(await mobilityFacade.getConnectionNetwork());
  } catch (error) {
    console.error('Connection network request failed:', error);
    return json(
      { code: 'CONNECTION_NETWORK_UNAVAILABLE', error: 'Connection network is unavailable.' },
      { status: 500 }
    );
  }
};
