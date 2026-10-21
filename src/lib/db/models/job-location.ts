import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { Island } from './island';

export const JobLocation = sqliteTable(
  'job_location',
  {
    id: text().primaryKey(),
    islandId: text()
      .notNull()
      .references(() => Island.id),
    name: text(),
    type: text().notNull(),
    subtype: text().notNull(),
    latitude: real(),
    longitude: real()
  },
  (table) => [index('job_location_island_id_index').on(table.islandId), index('job_location_type_index').on(table.type)]
);

export type JobLocation = typeof JobLocation.$inferSelect;
export type NewJobLocation = typeof JobLocation.$inferInsert;
