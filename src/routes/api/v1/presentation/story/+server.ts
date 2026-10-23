import type { RequestHandler } from './$types';

import { json } from '@sveltejs/kit';

import { mobilityFacade } from '$lib/server/mobility/mobility-facade';

export const GET: RequestHandler = async () => {
  try {
    return json(await mobilityFacade.getPresentationStory());
  } catch (error) {
    console.error('Presentation story request failed:', error);
    return json(
      { code: 'PRESENTATION_STORY_UNAVAILABLE', error: 'Presentation story is unavailable.' },
      { status: 500 }
    );
  }
};
