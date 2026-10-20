import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Island } from './island';

export const Population = sqliteTable(
  'population',
  {
    islandId: text()
      .notNull()
      .references(() => Island.id),
    ageCategory: text().notNull(),
    amount: integer().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.islandId, table.ageCategory] }),
    index('population_island_id_index').on(table.islandId),
    check('population_amount_non_negative', sql`${table.amount} >= 0`)
  ]
);

export type Population = typeof Population.$inferSelect;
export type NewPopulation = typeof Population.$inferInsert;
