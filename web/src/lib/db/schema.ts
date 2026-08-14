import { eq, isNotNull } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
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

// Den lokala handelskatalogen är den stabila gränsen mellan Shopify och Stripe.
// Shopify-ID:n behålls för synkning; SKU:n är vår egen beständiga identitet.
export const products = pgTable(
  'products',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    shopifyProductId: text('shopify_product_id').notNull(),
    handle: text('handle').notNull(),
    title: text('title').notNull(),
    stripeProductId: text('stripe_product_id'),
    active: boolean('active').notNull().default(true),
    source: text('source').notNull().default('shopify'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('products_shopify_product_id_key').on(table.shopifyProductId),
    uniqueIndex('products_handle_key').on(table.handle),
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    shopifyVariantId: text('shopify_variant_id').notNull(),
    sku: text('sku').notNull(),
    optionValues: jsonb('option_values')
      .$type<Array<{ name: string; value: string }>>()
      .notNull()
      .default([]),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('sek'),
    inventoryQuantity: integer('inventory_quantity').notNull().default(0),
    availableForSale: boolean('available_for_sale').notNull().default(false),
    stripePriceId: text('stripe_price_id'),
    stripeLookupKey: text('stripe_lookup_key'),
    active: boolean('active').notNull().default(true),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('product_variants_product_id_idx').on(table.productId),
    uniqueIndex('product_variants_shopify_variant_id_key').on(table.shopifyVariantId),
    uniqueIndex('product_variants_sku_key').on(table.sku),
    // Partiella index: varje variant är olänkad (NULL) tills Stripe-pushen körts,
    // och ett vanligt unikt index skulle låta bara en enda rad vara olänkad.
    uniqueIndex('product_variants_stripe_price_id_key')
      .on(table.stripePriceId)
      .where(isNotNull(table.stripePriceId)),
    uniqueIndex('product_variants_stripe_lookup_key_key')
      .on(table.stripeLookupKey)
      .where(isNotNull(table.stripeLookupKey)),
  ]
);

// Kategoriträdet. Egen tabell därför att brödsmulorna ska överleva Shopify:
// `parentId` ger hierarkin, `position` ger en stabil ordning (Shopify svarar
// i godtycklig ordning), och titlarna lagras per språk eftersom sajten är
// tvåspråkig och översättningen annars bara finns i Shopify.
export const collections = pgTable(
  'collections',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    shopifyCollectionId: text('shopify_collection_id'),
    handle: text('handle').notNull(),
    titleSv: text('title_sv').notNull(),
    titleEn: text('title_en').notNull(),
    parentId: integer('parent_id').references((): AnyPgColumn => collections.id, {
      onDelete: 'restrict',
    }),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('collections_handle_key').on(table.handle),
    uniqueIndex('collections_shopify_collection_id_key')
      .on(table.shopifyCollectionId)
      .where(isNotNull(table.shopifyCollectionId)),
    index('collections_parent_id_idx').on(table.parentId),
  ]
);

// Kopplingen produkt <-> kategori. `isPrimary` är den som brödsmulan följer —
// utan den tvingas frontenden gissa på "första kategorin", vilket är exakt
// det som gör dagens brödsmulor ostabila.
export const productCollections = pgTable(
  'product_collections',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.productId, table.collectionId] }),
    index('product_collections_collection_id_idx').on(table.collectionId),
    // Högst en primär kategori per produkt.
    uniqueIndex('product_collections_primary_key')
      .on(table.productId)
      .where(eq(table.isPrimary, true)),
  ]
);

// Ordrar. Stripe äger betalningen, vi äger ordern: beloppen skrivs av från
// sessionen så att en order går att läsa utan att fråga Stripe, och
// `stripeSessionId` är unik så att en omsänd webhook inte skapar en dubblett.
export const orders = pgTable(
  'orders',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    stripeSessionId: text('stripe_session_id').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    status: text('status').notNull().default('pending'),
    email: text('email'),
    customerName: text('customer_name'),
    // Sparad som den kom från Stripe: en adress ska visa vad kunden angav vid
    // köptillfället, inte vad den ändrats till efteråt.
    shippingAddress: jsonb('shipping_address').$type<Record<string, string | null>>(),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull().default(0),
    currency: text('currency').notNull().default('sek'),
    locale: text('locale'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('orders_stripe_session_id_key').on(table.stripeSessionId),
    index('orders_status_idx').on(table.status),
  ]
);

// Radernas pris fryses vid köpet. `variantId` får bli NULL om en variant
// städas bort senare — ordern ska överleva katalogen.
export const orderItems = pgTable(
  'order_items',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    sku: text('sku').notNull(),
    title: text('title').notNull(),
    quantity: integer('quantity').notNull(),
    unitAmountMinor: integer('unit_amount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('order_items_order_id_idx').on(table.orderId)]
);

export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type ProductCollectionRow = typeof productCollections.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
