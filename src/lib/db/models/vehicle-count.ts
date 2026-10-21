import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Island } from './island';

export const VehicleCount = sqliteTable(
  'vehicle_count',
  {
    islandId: text()
      .notNull()
      .references(() => Island.id),
    category: text().notNull(),
    total: integer().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.islandId, table.category] }),
    index('vehicle_count_island_id_index').on(table.islandId),
    index('vehicle_count_category_index').on(table.category),
    check('vehicle_count_total_non_negative', sql`${table.total} >= 0`)
  ]
);

export type VehicleCount = typeof VehicleCount.$inferSelect;
export type NewVehicleCount = typeof VehicleCount.$inferInsert;
