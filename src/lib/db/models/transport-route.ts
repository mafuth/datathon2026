import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const TransportRoute = sqliteTable(
  'transport_route',
  {
    id: text().primaryKey(),
    name: text(),
    routeType: text().notNull(),
    geoJson: text().notNull(),
    source: text().notNull(),
    sourceObjectId: text().notNull(),
    modeled: integer({ mode: 'boolean' }).notNull().default(true)
  },
  (table) => [index('transport_route_type_index').on(table.routeType)]
);

export type TransportRoute = typeof TransportRoute.$inferSelect;
export type NewTransportRoute = typeof TransportRoute.$inferInsert;
