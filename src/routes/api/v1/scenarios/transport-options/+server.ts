import type { RequestHandler } from './$types';

import { json } from '@sveltejs/kit';

import { mobilityFacade } from '$lib/server/mobility/mobility-facade';
import { ProposalTransportError } from '$lib/server/mobility/proposal-transport';

export const GET: RequestHandler = async ({ url }) => {
  const islandId = url.searchParams.get('islandId')?.trim();
  if (!islandId) return json({ code: 'INVALID_INPUT', error: 'islandId is required.' }, { status: 400 });

  try {
    return json(await mobilityFacade.getProposalTransportOptions(islandId));
  } catch (error) {
    if (error instanceof ProposalTransportError) {
      return json({ code: error.code, error: error.message }, { status: error.status });
    }
    console.error('Proposal transport options request failed:', error);
    return json({ code: 'TRANSPORT_UNAVAILABLE', error: 'Transport options are unavailable.' }, { status: 500 });
  }
};
