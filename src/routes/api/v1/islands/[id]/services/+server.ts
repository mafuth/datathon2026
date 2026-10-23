import type { RequestHandler } from '@sveltejs/kit';

import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { IslandServicesNotFoundError } from '$lib/server/scoring/island-services';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const includeResidentialDemandPoints = url.searchParams.get('includeResidentialDemandPoints') !== 'false';
    return new Response(
      JSON.stringify(await mobilityFacade.getIslandServices(params.id ?? '', { includeResidentialDemandPoints })),
      {
        headers: { 'content-type': 'application/json' }
      }
    );
  } catch (error) {
    if (error instanceof IslandServicesNotFoundError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }
    console.error('Versioned island services request failed:', error);
    return new Response(JSON.stringify({ error: 'Island services are unavailable.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
