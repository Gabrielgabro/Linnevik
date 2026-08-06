import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// En sparad uppsättning priser: vem som satte dem, för vilka produkter, och när.
export const priceSuggestions = pgTable('price_suggestions', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  user: text('user').notNull(),
  label: text('label'),
  prices: jsonb('prices').$type<Record<string, number>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
