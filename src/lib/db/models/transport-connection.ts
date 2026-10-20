import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Island } from './island';
import { TransportRoute } from './transport-route';

export const TransportConnection = sqliteTable(
  'transport_connection',
  {
    id: text().primaryKey(),
    routeId: text().references(() => TransportRoute.id, { onDelete: 'set null' }),
    fromIslandId: text()
      .notNull()
      .references(() => Island.id),
    toIslandId: text()
      .notNull()
      .references(() => Island.id),
    connectionType: text().notNull(),
    directionality: text().notNull(),
    sequence: integer(),
    distanceM: real(),
    geoJson: text(),
    source: text().notNull(),
    sourceObjectId: text().notNull(),
    modeled: integer({ mode: 'boolean' }).notNull().default(true),
    scoreEligible: integer({ mode: 'boolean' }).notNull().default(true)
  },
  (table) => [
    index('transport_connection_route_id_index').on(table.routeId),
    index('transport_connection_from_island_index').on(table.fromIslandId),
    index('transport_connection_to_island_index').on(table.toIslandId),
    index('transport_connection_type_index').on(table.connectionType),
    check(
      'transport_connection_type_check',
      sql`${table.connectionType} in ('air', 'ferry', 'bus', 'bridge', 'causeway', 'land_link')`
    ),
    check('transport_connection_directionality_check', sql`${table.directionality} in ('forward', 'bidirectional')`),
    check('transport_connection_distance_non_negative', sql`${table.distanceM} is null or ${table.distanceM} >= 0`)
  ]
);

export type TransportConnection = typeof TransportConnection.$inferSelect;
export type NewTransportConnection = typeof TransportConnection.$inferInsert;
