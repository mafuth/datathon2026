import type { RequestHandler } from '@sveltejs/kit';

import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { Atoll, Island } from '$lib/db/models';
import db from '$lib/server/database';
import { waitForMobilityApiDelay } from '$lib/server/mobility/api-delay';
import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { getIslandScore } from '$lib/server/scoring/island-score';

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type MapPayload = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: GeoJsonGeometry;
    properties: {
      id: string;
      name: string;
      atollName: string;
      centroid: [number, number];
      score: number | null;
      scoreStatus: 'numeric' | 'unavailable';
    };
  }>;
};

let overviewRequest: Promise<MapPayload> | null = null;
let detailRequest: Promise<MapPayload> | null = null;

async function buildMapPayload(): Promise<MapPayload> {
  const [islandRows, snapshot] = await Promise.all([
    db
      .select({ island: Island, atollName: Atoll.name })
      .from(Island)
      .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
      .where(eq(Island.islandType, 'inhabited')),
    loadScoringSnapshot()
  ]);
  const inhabitedIslands = islandRows.map(({ island, atollName }) => ({ ...island, atollName }));
  const scores = await Promise.all(
    inhabitedIslands.map(async (island) => {
      try {
        return [island.id, (await getIslandScore(island.id, snapshot)).overall.score] as const;
      } catch {
        return [island.id, null] as const;
      }
    })
  );
  const scoreByIsland = new Map(scores);
  return {
    type: 'FeatureCollection',
    features: inhabitedIslands.flatMap((island) => {
      try {
        const geometry = JSON.parse(island.geoJson) as GeoJsonGeometry;
        if (!geometry || typeof geometry.type !== 'string' || geometry.coordinates === undefined) return [];

        const score = scoreByIsland.get(island.id) ?? null;

        return [
          {
            type: 'Feature',
            id: island.id,
            geometry,
            properties: {
              id: island.id,
              name: island.name,
              atollName: island.atollName,
              centroid: [island.longitude, island.latitude],
              score,
              scoreStatus: typeof score === 'number' && Number.isFinite(score) ? 'numeric' : 'unavailable'
            }
          }
        ];
      } catch {
        return [];
      }
    })
  };
}

export const GET: RequestHandler = async ({ url }) => {
  await waitForMobilityApiDelay();

  const detail = url.searchParams.get('detail') === 'true';

  const request = detail ? (detailRequest ?? buildMapPayload()) : (overviewRequest ?? buildMapPayload());
  if (detail) detailRequest = request;
  else overviewRequest = request;

  try {
    const payload = await request;
    return json(payload);
  } finally {
    if (detail) detailRequest = null;
    else overviewRequest = null;
  }
};
