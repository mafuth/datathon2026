import type { ScoringSnapshot, TransportRouteStop, TransportStop } from './types';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';

import { Island, Population, Service, TransportConnection, TransportRoute } from '../../db/models';
import db from '../database';

type RtlBusArtifact = {
  routes?: Array<{ id?: unknown; stop_ids?: unknown }>;
  stops?: Array<{
    id?: unknown;
    source_stop_id?: unknown;
    name?: unknown;
    island_id?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  }>;
};

let rtlBusStopsCache: { transportStops: TransportStop[]; routeStops: TransportRouteStop[] } | undefined;

function rtlBusStops(): { transportStops: TransportStop[]; routeStops: TransportRouteStop[] } {
  const empty = { transportStops: [], routeStops: [] };
  if (rtlBusStopsCache) return rtlBusStopsCache;
  const path = resolve(process.cwd(), 'data/mobility/normalized/rtl-bus.json');
  if (!existsSync(path)) {
    rtlBusStopsCache = empty;
    return empty;
  }

  const artifact = JSON.parse(readFileSync(path, 'utf8')) as RtlBusArtifact;
  const stops = new Map<string, TransportStop>();
  for (const stop of artifact.stops ?? []) {
    const sourceStopId = typeof stop.source_stop_id === 'string' ? stop.source_stop_id : null;
    const id = typeof stop.id === 'string' ? stop.id : sourceStopId ? `rtl:bus-stop:${sourceStopId}` : null;
    const islandId = typeof stop.island_id === 'string' ? stop.island_id : null;
    if (!id || !islandId) continue;
    stops.set(id, {
      id,
      name: typeof stop.name === 'string' ? stop.name : null,
      islandId,
      subtype: 'bus_stop',
      latitude: typeof stop.latitude === 'number' ? stop.latitude : null,
      longitude: typeof stop.longitude === 'number' ? stop.longitude : null,
      routeIds: []
    });
  }

  const routeStops: TransportRouteStop[] = [];
  for (const route of artifact.routes ?? []) {
    const routeId = typeof route.id === 'string' ? route.id : null;
    const stopIds = Array.isArray(route.stop_ids) ? route.stop_ids : [];
    if (!routeId) continue;
    stopIds.forEach((rawStopId, sequence) => {
      const sourceStopId = typeof rawStopId === 'string' ? rawStopId : String(rawStopId);
      const stopId = sourceStopId.startsWith('rtl:bus-stop:') ? sourceStopId : `rtl:bus-stop:${sourceStopId}`;
      const stop = stops.get(stopId);
      if (!stop) return;
      if (!stop.routeIds.includes(routeId)) stop.routeIds.push(routeId);
      routeStops.push({ routeId, stopId, islandId: stop.islandId, sequence });
    });
  }

  rtlBusStopsCache = { transportStops: [...stops.values()], routeStops };
  return rtlBusStopsCache;
}

function databaseTransportStops(services: ScoringSnapshot['services']): TransportStop[] {
  const transportSubtypes = new Set([
    'bus_station',
    'bus_stop',
    'public_transport',
    'port',
    'jetty',
    'airport',
    'air_terminal',
    'helipad'
  ]);
  return services.flatMap((service) => {
    if (service.serviceType !== 'transport' || !service.islandId || !transportSubtypes.has(service.subtype)) return [];
    return [
      {
        id: service.id,
        name: service.name,
        islandId: service.islandId,
        subtype: service.subtype,
        latitude: service.latitude,
        longitude: service.longitude,
        routeIds: []
      }
    ];
  });
}

export async function loadScoringSnapshot(): Promise<ScoringSnapshot> {
  const [islands, population, services, connections, routes] = await Promise.all([
    db.select().from(Island),
    db.select().from(Population),
    db.select().from(Service),
    db.select().from(TransportConnection),
    db.select().from(TransportRoute)
  ]);

  const rtl = rtlBusStops();
  const stops = new Map(databaseTransportStops(services).map((stop) => [stop.id, stop]));
  for (const stop of rtl.transportStops) {
    const existing = stops.get(stop.id);
    if (existing) {
      existing.routeIds = [...new Set([...existing.routeIds, ...stop.routeIds])];
    } else {
      stops.set(stop.id, stop);
    }
  }

  return {
    islands,
    population,
    services,
    connections,
    routes,
    transportStops: [...stops.values()],
    routeStops: rtl.routeStops
  };
}

export async function loadIsland(islandId: string) {
  const rows = await db.select().from(Island).where(eq(Island.id, islandId)).limit(1);
  return rows[0] ?? null;
}
