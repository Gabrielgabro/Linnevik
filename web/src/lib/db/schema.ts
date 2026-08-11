import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// En sparad uppsättning priser: vem som satte dem, för vilka produkter, och när.
export const priceSuggestions = pgTable('price_suggestions', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  user: text('user').notNull(),
  label: text('label'),
  prices: jsonb('prices').$type<Record<string, number>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Spår av vad som händer i adminvyn: inloggningar, sparade prisförslag,
// botkörningar. `actor` är personens namn när någon är inloggad, annars
// systemets namn (t.ex. "prisbot"). `detail` är fritt formad kontext.
export const adminActivity = pgTable('admin_activity', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdminActivityRow = typeof adminActivity.$inferSelect;

// Säljregistret. Ett företag per rad i `clients`, en person per rad i
// `client_contacts` — ett företag kan ha flera kontaktpersoner, vilket är
// hela poängen med att dela upp det. `customerNo` är kundnumret från
// tvätteriets arkivlista och är det vi känner igen en kund på utifrån.
export const clients = pgTable(
  'clients',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    customerNo: text('customer_no').notNull(),
    name: text('name').notNull(),
    segment: text('segment'),
    status: text('status').notNull().default('Tvätterikund'),
    priority: text('priority'),
    // Påminnelseavgiften ur arkivlistan. numeric för att ören inte ska
    // vandra iväg i flyttal; drizzle ger den som sträng.
    reminderFee: numeric('reminder_fee', { precision: 10, scale: 2 }),
    // Namnet kapades av 24-teckensfältet i källfilen och behöver kompletteras.
    nameTruncated: boolean('name_truncated').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('clients_customer_no_key').on(table.customerNo)]
);

export const clientContacts = pgTable(
  'client_contacts',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    role: text('role'),
    email: text('email'),
    phone: text('phone'),
    linkedin: text('linkedin'),
    status: text('status').notNull().default('Ej kontaktad'),
    channel: text('channel'),
    // Datum utan tid: ingen bryr sig om klockslaget när ett samtal togs.
    lastContactedAt: date('last_contacted_at'),
    nextAction: text('next_action'),
    nextActionDue: date('next_action_due'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('client_contacts_client_id_idx').on(table.clientId)]
);

export type ClientRow = typeof clients.$inferSelect;
export type ClientContactRow = typeof clientContacts.$inferSelect;
