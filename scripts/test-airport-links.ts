import assert from 'node:assert/strict';

import { Service, TransportConnection } from '../src/lib/db/models';
import db from '../src/lib/server/database';

const HULHULE_ID = 'island:1483';
const MALE_ID = 'island:1443';

const [airports, connections] = await Promise.all([db.select().from(Service), db.select().from(TransportConnection)]);

const airportIslandIds = new Set(
  airports
    .filter((service) => service.serviceType === 'transport' && service.subtype === 'airport' && service.islandId)
    .map((service) => service.islandId as string)
);

assert(airportIslandIds.has(HULHULE_ID), 'Hulhule must have an airport service');

const missingAirportLinks = [...airportIslandIds].filter(
  (airportIslandId) =>
    airportIslandId !== HULHULE_ID &&
    !connections.some(
      (connection) =>
        connection.connectionType === 'air' &&
        connection.directionality === 'bidirectional' &&
        ((connection.fromIslandId === airportIslandId && connection.toIslandId === HULHULE_ID) ||
          (connection.fromIslandId === HULHULE_ID && connection.toIslandId === airportIslandId))
    )
);
assert.equal(missingAirportLinks.length, 0, `Airport islands missing Hulhule links: ${missingAirportLinks.join(', ')}`);

assert(
  connections.some(
    (connection) =>
      connection.connectionType === 'bridge' &&
      connection.directionality === 'bidirectional' &&
      ((connection.fromIslandId === HULHULE_ID && connection.toIslandId === MALE_ID) ||
        (connection.fromIslandId === MALE_ID && connection.toIslandId === HULHULE_ID))
  ),
  'Hulhule must remain connected to Male by a bidirectional bridge'
);

assert(
  !connections.some(
    (connection) =>
      connection.connectionType === 'air' &&
      ((connection.fromIslandId === HULHULE_ID && connection.toIslandId === MALE_ID) ||
        (connection.fromIslandId === MALE_ID && connection.toIslandId === HULHULE_ID))
  ),
  'Hulhule to Male must not be modeled as an air link'
);

console.log(
  JSON.stringify(
    {
      airportIslandCount: airportIslandIds.size,
      directHulhuleAirLinks: connections.filter(
        (connection) =>
          connection.connectionType === 'air' &&
          (connection.fromIslandId === HULHULE_ID || connection.toIslandId === HULHULE_ID)
      ).length,
      hulhuleMaleBridge: true
    },
    null,
    2
  )
);
