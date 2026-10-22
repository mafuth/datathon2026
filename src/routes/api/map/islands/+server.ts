import type { RequestHandler } from '@sveltejs/kit';

import { eq } from 'drizzle-orm';

import { Atoll, Island } from '$lib/db/models';
import db from '$lib/server/database';
import { waitForMobilityApiDelay } from '$lib/server/mobility/api-delay';
import { detailGeometry, overviewGeometry } from '$lib/server/mobility/overview-geometry';
import { publicMapResponse } from '$lib/server/mobility/public-map-response';
import { loadScoringSnapshot } from '$lib/server/scoring/database-input';
import { buildDemandAllocation } from '$lib/server/scoring/demand-allocation';
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
      employmentScore: number | null;
      sustainabilityScore: number | null;
      pollutionPressure: number | null;
      scoreStatus: 'numeric' | 'unavailable';
    };
  }>;
};

async function buildMapPayload(detail: boolean): Promise<MapPayload> {
  const [islandRows, snapshot] = await Promise.all([
    db
      .select({ island: Island, atollName: Atoll.name })
      .from(Island)
      .innerJoin(Atoll, eq(Island.atollId, Atoll.id))
      .where(eq(Island.islandType, 'inhabited')),
    loadScoringSnapshot()
  ]);
  const inhabitedIslands = islandRows.map(({ island, atollName }) => ({ ...island, atollName }));
  const demandAllocations = buildDemandAllocation(snapshot);
  const scores = await Promise.all(
    inhabitedIslands.map(async (island) => {
      try {
        const result = await getIslandScore(island.id, snapshot, demandAllocations);
        return [
          island.id,
          {
            overall: result.overall.score,
            employment: result.employment.score,
            sustainability: result.sustainability.score,
            pollutionPressure: result.sustainability.pollutionPressure
          }
        ] as const;
      } catch {
        return [island.id, { overall: null, employment: null, sustainability: null, pollutionPressure: null }] as const;
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

        const islandScores = scoreByIsland.get(island.id) ?? {
          overall: null,
          employment: null,
          sustainability: null,
          pollutionPressure: null
        };
        const score = islandScores.overall;

        return [
          {
            type: 'Feature',
            id: island.id,
            geometry: detail ? detailGeometry(geometry) : overviewGeometry(geometry),
            properties: {
              id: island.id,
              name: island.name,
              atollName: island.atollName,
              centroid: [island.longitude, island.latitude],
              score,
              employmentScore: islandScores.employment,
              sustainabilityScore: islandScores.sustainability,
              pollutionPressure: islandScores.pollutionPressure,
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

export const GET: RequestHandler = async ({ url, request }) => {
  await waitForMobilityApiDelay();

  const detail = url.searchParams.get('detail') === 'true';

  return publicMapResponse(request, `map/islands/${detail ? 'detail' : 'overview'}`, () => buildMapPayload(detail));
};
