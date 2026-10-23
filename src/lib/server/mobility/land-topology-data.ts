import type { TransportConnection } from '../../db/models/transport-connection';
import type { LandGeometrySource, LandIsland } from './land-topology';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLandTopologyResolver, LAND_INFRASTRUCTURE_TYPES, mergeLandConnections } from './land-topology';

type NormalizedConnection = {
  id: string;
  from_island_id: string;
  to_island_id: string;
  connection_type: string;
  directionality: string;
  distance_m: number | null;
  geometry: LandGeometrySource['geometry'];
  source: string;
  source_object_id: string;
  modeled: boolean;
  score_eligible?: boolean;
};
type CrossingArtifact = {
  elements: Array<{
    id: string;
    tags: Record<string, string>;
    crossings: Array<{ vertex_range: number[]; coordinates: number[][] }>;
  }>;
  way_tags?: Record<string, Record<string, string>>;
};

function artifact<T>(path: string, fallback: T): T {
  const absolute = resolve(process.cwd(), path);
  return existsSync(absolute) ? (JSON.parse(readFileSync(absolute, 'utf8')) as T) : fallback;
}

// A read-only overlay shared by ingestion and all scoring/network consumers.
// Baseline AIR/ferry records are deliberately not imported by this land resolver.
export function loadLandTopology(islands: LandIsland[], connections: TransportConnection[]): TransportConnection[] {
  const resolveLand = createLandTopologyResolver(islands);
  const baseline = artifact<{ transportConnections: TransportConnection[] }>(
    process.env.MOBILITY_BASELINE_PATH ?? 'data/mobility/normalized/current-db-baseline.json',
    { transportConnections: [] }
  );
  const normalized = artifact<{ connections: NormalizedConnection[] }>(
    process.env.MOBILITY_OSM_CONNECTIONS_PATH ?? 'data/mobility/normalized/transport-connections.json',
    { connections: [] }
  );
  const osm = artifact<CrossingArtifact>('data/mobility/normalized/osm-land-crossings.json', { elements: [] });
  const rtl = artifact<{ routes: Array<{ id: string; geometry: LandGeometrySource['geometry'] }> }>(
    'data/mobility/normalized/rtl-bus.json',
    { routes: [] }
  );
  const land = new Map<string, TransportConnection>();
  for (const connection of baseline.transportConnections)
    if (LAND_INFRASTRUCTURE_TYPES.has(connection.connectionType)) land.set(connection.id, connection);
  for (const connection of normalized.connections) {
    if (!LAND_INFRASTRUCTURE_TYPES.has(connection.connection_type)) continue;
    land.set(connection.id, {
      id: connection.id,
      routeId: null,
      fromIslandId: connection.from_island_id,
      toIslandId: connection.to_island_id,
      connectionType: connection.connection_type,
      directionality: connection.directionality,
      sequence: null,
      distanceM: connection.distance_m,
      geoJson: JSON.stringify(connection.geometry),
      source: connection.source,
      sourceObjectId: connection.source_object_id,
      modeled: connection.modeled,
      scoreEligible: connection.score_eligible ?? true
    });
  }
  // Current database evidence/eligibility wins over an older packaged row.
  for (const connection of connections)
    if (LAND_INFRASTRUCTURE_TYPES.has(connection.connectionType)) land.set(connection.id, connection);
  const resolved: TransportConnection[] = [];
  const databaseIds = new Set(connections.map((link) => link.id));
  for (const connection of [...land.values()].sort(
    (a, b) => Number(databaseIds.has(b.id)) - Number(databaseIds.has(a.id)) || a.id.localeCompare(b.id)
  )) {
    const geometry = connection.geoJson ? (JSON.parse(connection.geoJson) as LandGeometrySource['geometry']) : null;
    const tags = osm.way_tags?.[connection.sourceObjectId];
    const pieces =
      geometry && !connection.modeled
        ? resolveLand({
            id: connection.id,
            source: connection.source,
            sourceObjectId: connection.sourceObjectId,
            connectionType: connection.connectionType as LandGeometrySource['connectionType'],
            directionality:
              tags?.oneway === 'yes'
                ? 'forward'
                : connection.directionality === 'forward'
                  ? 'forward'
                  : 'bidirectional',
            geometry,
            scoreEligible: connection.scoreEligible
          })
        : [];
    if (!pieces.length) {
      resolved.push(connection);
      continue;
    }
    // Retain stable IDs for the common one-leg case. Multiple parcels receive
    // deterministic leg IDs instead of a shortcut across intermediate islands.
    if (pieces.length === 1) {
      pieces[0].id = connection.id;
      pieces[0].geoJson = connection.geoJson;
      if (connection.distanceM !== null && connection.distanceM > 0) pieces[0].distanceM = connection.distanceM;
    }
    resolved.push(...pieces);
  }
  for (const element of osm.elements) {
    for (const crossing of element.crossings) {
      const reversed = element.tags.oneway === '-1';
      const coordinates = reversed ? [...crossing.coordinates].reverse() : crossing.coordinates;
      resolved.push(
        ...resolveLand({
          id: `${element.id}:vertices:${crossing.vertex_range.join('-')}`,
          source: 'OpenStreetMap',
          sourceObjectId: element.id,
          connectionType: 'land_link',
          directionality: ['yes', '1', 'true', '-1'].includes(element.tags.oneway) ? 'forward' : 'bidirectional',
          geometry: { type: 'LineString', coordinates }
        })
      );
    }
  }
  for (const route of rtl.routes)
    resolved.push(
      ...resolveLand({
        id: `${route.id}:roadshape`,
        source: 'RTL',
        sourceObjectId: `${route.id}:roadshape`,
        connectionType: 'land_link',
        directionality: 'forward',
        geometry: route.geometry
      })
    );
  return mergeLandConnections(
    connections.filter((link) => !LAND_INFRASTRUCTURE_TYPES.has(link.connectionType)),
    resolved,
    new Set(islands.map((island) => island.id))
  );
}
