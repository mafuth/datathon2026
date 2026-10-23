import { Island, Service, TransportConnection } from '../../src/lib/db/models';
import db, { client } from '../../src/lib/server/database';

// Read-only source investigation: no application execution or assertions.
try {
  const [islands, links, services] = await Promise.all([
    db.select().from(Island),
    db.select().from(TransportConnection),
    db.select().from(Service)
  ]);
  const byId = new Map(islands.map((island) => [island.id, island]));
  const land = links.filter((link) => ['bridge', 'causeway', 'land_link'].includes(link.connectionType));
  console.log(
    JSON.stringify(
      {
        islandCount: islands.length,
        connectionCount: links.length,
        invalidEndpointIds: [
          ...new Set(links.flatMap((link) => [link.fromIslandId, link.toIslandId]).filter((id) => !byId.has(id)))
        ],
        land: land.map((link) => ({
          ...link,
          geoJson: undefined,
          fromName: byId.get(link.fromIslandId)?.name,
          toName: byId.get(link.toIslandId)?.name
        })),
        airports: services
          .filter((service) => service.serviceType === 'transport' && service.subtype === 'airport')
          .map((service) => ({ id: service.id, islandId: service.islandId, name: service.name })),
        air: links
          .filter((link) => link.connectionType === 'air')
          .map((link) => ({
            id: link.id,
            from: link.fromIslandId,
            to: link.toIslandId,
            modeled: link.modeled,
            scoreEligible: link.scoreEligible
          }))
      },
      null,
      2
    )
  );
} finally {
  client.close();
}
