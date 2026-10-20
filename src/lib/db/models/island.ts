import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Atoll } from './atoll';

export const Island = sqliteTable(
  'island',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    islandType: text().notNull(),
    latitude: real().notNull(),
    longitude: real().notNull(),
    landAreaKm2: real(),
    geoJson: text().notNull(),
    atollId: text()
      .notNull()
      .references(() => Atoll.id)
  },
  (table) => [index('island_atoll_id_index').on(table.atollId), index('island_name_index').on(table.name)]
);

export type Island = typeof Island.$inferSelect;
export type NewIsland = typeof Island.$inferInsert;
