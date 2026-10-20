import type { ScoringSnapshot } from './types';

import { eq } from 'drizzle-orm';

import { Island, Population, Service, TransportConnection, TransportRoute } from '../../db/models';
import db from '../database';

export async function loadScoringSnapshot(): Promise<ScoringSnapshot> {
  const [islands, population, services, connections, routes] = await Promise.all([
    db.select().from(Island),
    db.select().from(Population),
    db.select().from(Service),
    db.select().from(TransportConnection),
    db.select().from(TransportRoute)
  ]);

  return { islands, population, services, connections, routes };
}

export async function loadIsland(islandId: string) {
  const rows = await db.select().from(Island).where(eq(Island.id, islandId)).limit(1);
  return rows[0] ?? null;
}
