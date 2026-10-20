import { sql } from 'drizzle-orm';
import { check, index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Island } from './island';

export const Service = sqliteTable(
  'service',
  {
    id: text().primaryKey(),
    islandId: text().references(() => Island.id, { onDelete: 'set null' }),
    serviceType: text().notNull(),
    subtype: text().notNull(),
    name: text(),
    latitude: real(),
    longitude: real()
  },
  (table) => [
    index('service_island_id_index').on(table.islandId),
    index('service_type_subtype_index').on(table.serviceType, table.subtype),
    check('service_type_check', sql`${table.serviceType} in ('health', 'education', 'transport')`),
    check(
      'service_coordinates_pair_check',
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`
    )
  ]
);

export type Service = typeof Service.$inferSelect;
export type NewService = typeof Service.$inferInsert;
