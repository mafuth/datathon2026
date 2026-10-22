import { getScoringSourceVersion } from '$lib/server/scoring/database-input';

import { publicResponseCache } from './public-response-cache';

class SourceChanged extends Error {}

/** Do not persist a result under an earlier source revision during an import. */
export async function publicMapResponse(
  request: Request,
  resource: string,
  compute: () => Promise<unknown>
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const version = await getScoringSourceVersion();
    try {
      return await publicResponseCache.response(request, resource, version, async () => {
        const payload = await compute();
        if ((await getScoringSourceVersion({ fresh: true })) !== version) throw new SourceChanged();
        return payload;
      });
    } catch (error) {
      if (!(error instanceof SourceChanged)) throw error;
    }
  }
  return new Response(JSON.stringify({ error: 'Source data is being updated. Please retry.' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}
