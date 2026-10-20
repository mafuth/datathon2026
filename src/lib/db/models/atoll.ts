import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const Atoll = sqliteTable('atoll', {
  id: text().primaryKey(),
  name: text().notNull().unique()
});

export type Atoll = typeof Atoll.$inferSelect;
export type NewAtoll = typeof Atoll.$inferInsert;
