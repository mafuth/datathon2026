import type { Service, TransportConnection } from '../../db/models';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let groundAirportIds: Set<string> | undefined;

function evidencedGroundAirportIds(): Set<string> {
  if (groundAirportIds) return groundAirportIds;
  const path = resolve(process.cwd(), 'data/mobility/normalized/airport-evidence.json');
  const artifact = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as {
        aerodromes: Array<{ id: string; tags: Record<string, string> }>;
      })
    : { aerodromes: [] };
  groundAirportIds = new Set(
    artifact.aerodromes
      .filter(
        ({ tags }) =>
          tags.aeroway === 'aerodrome' &&
          /^[A-Z]{4}$/.test(tags.icao ?? '') &&
          tags['aerodrome:type'] !== 'seaplane' &&
          tags.surface !== 'water' &&
          tags.man_made !== 'raft'
      )
      .map(({ id }) => id)
  );
  return groundAirportIds;
}

export function isGroundAirport(service: Pick<Service, 'id' | 'serviceType' | 'subtype'>): boolean {
  return (
    service.serviceType === 'transport' &&
    service.subtype === 'airport' &&
    (!service.id.startsWith('osm:') || evidencedGroundAirportIds().has(service.id))
  );
}

// The historical airport-star generator treated every aerodrome (including
// waterdromes/rafts) as a domestic airport. Retain actual route records and valid
// modeled gateway links; airport presence alone never creates a new air service.
export function retainEvidencedAirportLinks(
  links: TransportConnection[],
  services: Array<Pick<Service, 'id' | 'serviceType' | 'subtype'> & { islandId?: string | null }>
): TransportConnection[] {
  const airports = new Map(services.filter(isGroundAirport).map((service) => [service.id, service.islandId]));
  const airportIslands = new Set(airports.values());
  return links.filter(
    (link) =>
      !link.modeled ||
      link.connectionType !== 'air' ||
      link.source !== 'Modeled airport gateway link' ||
      (airports.get(link.sourceObjectId) === link.fromIslandId && airportIslands.has(link.toIslandId))
  );
}
