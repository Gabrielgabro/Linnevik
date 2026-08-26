import { eq, isNotNull, sql } from 'drizzle-orm';
import {
  boolean,
  check,
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
// En rad per person — sparning skriver över den egna raden i stället för att
// lägga till en ny, så att jämförelsen alltid visar allas aktuella bud.
// Historiken ligger i `admin_activity` under 'suggestion.saved'.
export const priceSuggestions = pgTable(
  'price_suggestions',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    user: text('user').notNull(),
    // Vilken prisdiskussion budet hör till: 'egna' (Kina-sändningen) eller
    // 'franzen'. Var och en har ett levande förslag per diskussion — se 0032.
    scope: text('scope').notNull().default('egna'),
    label: text('label'),
    prices: jsonb('prices').$type<Record<string, number>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('price_suggestions_user_scope_key').on(table.user, table.scope)]
);

export type PriceSuggestionRow = typeof priceSuggestions.$inferSelect;

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

// Prislogiken som admin styr. En enda rad (id = 1) — det finns bara en
// konfiguration åt gången. `strategy` väljer mellan trappor (`progressive`)
// och en jämn kurva (`linear`); `margin`-strategin i pricingRules.ts är
// medvetet inte valbar här, för den kräver landad kostnad som bara är känd
// för sex produkter och som aldrig får skickas till klienten — se
// `isClientComputable`. Gäller alltid bara MTO-produkter: `appliesTo` sätts
// inte här utan är fast 'mto' i koden, så en admin-inställning aldrig av
// misstag kan slå på mängdrabatt för lagerförda varor.
export const pricingConfig = pgTable('pricing_config', {
  id: integer('id').primaryKey().default(1),
  strategy: text('strategy').notNull().default('progressive'),
  tiers: jsonb('tiers')
    .$type<Array<{ minQuantity: number; discountPercent: number }>>()
    .notNull()
    .default([]),
  linearStartQuantity: integer('linear_start_quantity').notNull().default(50),
  linearQuantityStep: integer('linear_quantity_step').notNull().default(100),
  linearPercentPerStep: integer('linear_percent_per_step').notNull().default(2),
  linearMaxPercent: integer('linear_max_percent').notNull().default(20),
  // `orderValue`: trappan mäts på ordervärdet i öre, och taken sätts per
  // SKU-prefix. Båda är listor och bor därför i jsonb, som `tiers`.
  orderValueLadder: jsonb('order_value_ladder')
    .$type<Array<{ minOrderValueMinor: number; discountPercent: number }>>()
    .notNull()
    .default([]),
  orderValueCaps: jsonb('order_value_caps')
    .$type<Array<{ skuPrefix: string; maxPercent: number }>>()
    .notNull()
    .default([]),
  orderValueDefaultMaxPercent: integer('order_value_default_max_percent').notNull().default(12),
  minimumOrderQuantity: integer('minimum_order_quantity').notNull().default(50),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
}, table => [
  check('pricing_config_singleton_check', sql`${table.id} = 1`),
  check(
    'pricing_config_strategy_check',
    sql`${table.strategy} in ('progressive', 'linear', 'orderValue')`
  ),
]);

export type PricingConfigRow = typeof pricingConfig.$inferSelect;

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

// Handelskatalogen. Den ägs numera av oss: allt en produkt är — texter, taggar,
// bilder, priser — ligger här, och Shopify-ID:t är bara ett spår av var raden
// en gång kom ifrån. Det är därför frivilligt: en produkt som skapas i /admin
// har inget, och ska inte behöva ha det.
export const products = pgTable(
  'products',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    shopifyProductId: text('shopify_product_id'),
    handle: text('handle').notNull(),
    title: text('title').notNull(),
    // Engelskan hämtades förr live ur Shopify med @inContext. Den bor här nu,
    // annars försvinner den engelska sajten den dagen butiken stängs.
    titleEn: text('title_en'),
    descriptionHtml: text('description_html'),
    descriptionHtmlEn: text('description_html_en'),
    tags: text('tags').array().notNull().default([]),
    productType: text('product_type'),
    vendor: text('vendor'),
    // Vem vi köper produkten av. Skild från `vendor`, som är varumärket kunden
    // ser. 'unknown' tills leverantören är utredd — aldrig NULL.
    supplier: text('supplier').notNull().default('unknown'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    seoTitleEn: text('seo_title_en'),
    seoDescriptionEn: text('seo_description_en'),
    // Låg förr i Shopify-metafältet `b2b.lead_time` och lästes live på
    // produktsidan. Egen kolumn sedan 0015, annars försvinner rutan
    // "Leveranstid" den dagen butiken stängs.
    leadTime: text('lead_time'),
    shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
    stripeProductId: text('stripe_product_id'),
    status: text('status').notNull().default('active'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    source: text('source').notNull().default('linnevik'),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    // Partiellt: ett vanligt unikt index tillåter bara en enda rad utan
    // Shopify-ID, och de kommer nu att bli många.
    uniqueIndex('products_shopify_product_id_key')
      .on(table.shopifyProductId)
      .where(isNotNull(table.shopifyProductId)),
    uniqueIndex('products_handle_key').on(table.handle),
    index('products_supplier_idx').on(table.supplier),
    index('products_status_idx').on(table.status),
    check('products_supplier_check', sql`length(btrim(${table.supplier})) > 0`),
    check('products_status_check', sql`${table.status} in ('active', 'draft', 'archived')`),
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    shopifyVariantId: text('shopify_variant_id'),
    sku: text('sku').notNull(),
    optionValues: jsonb('option_values')
      .$type<Array<{ name: string; value: string }>>()
      .notNull()
      .default([]),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('sek'),
    inventoryQuantity: integer('inventory_quantity').notNull().default(0),
    // Enheter bundna av aktiva reservationer (öppen kassa eller betald order).
    // Vad som går att sälja just nu är inventoryQuantity - inventoryReserved.
    inventoryReserved: integer('inventory_reserved').notNull().default(0),
    minimumOrderQuantity: integer('minimum_order_quantity').notNull().default(1),
    orderIncrement: integer('order_increment').notNull().default(1),
    inventoryTracked: boolean('inventory_tracked').notNull().default(true),
    availableForSale: boolean('available_for_sale').notNull().default(false),
    // Ordningen kunden ser dem i, på produktsidan och i adminvyn. Utan den
    // byggdes variantväljaren i id-ordning, alltså i den ordning varianterna
    // råkade skapas.
    position: integer('position').notNull().default(0),
    stripePriceId: text('stripe_price_id'),
    stripeLookupKey: text('stripe_lookup_key'),
    active: boolean('active').notNull().default(true),
    sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('product_variants_product_id_idx').on(table.productId),
    index('product_variants_product_position_idx').on(table.productId, table.position),
    uniqueIndex('product_variants_shopify_variant_id_key')
      .on(table.shopifyVariantId)
      .where(isNotNull(table.shopifyVariantId)),
    uniqueIndex('product_variants_sku_key').on(table.sku),
    // Partiella index: varje variant är olänkad (NULL) tills Stripe-pushen körts,
    // och ett vanligt unikt index skulle låta bara en enda rad vara olänkad.
    uniqueIndex('product_variants_stripe_price_id_key')
      .on(table.stripePriceId)
      .where(isNotNull(table.stripePriceId)),
    uniqueIndex('product_variants_stripe_lookup_key_key')
      .on(table.stripeLookupKey)
      .where(isNotNull(table.stripeLookupKey)),
    check('product_variants_minimum_order_quantity_check', sql`${table.minimumOrderQuantity} > 0`),
    check('product_variants_order_increment_check', sql`${table.orderIncrement} > 0`),
    check('product_variants_inventory_quantity_nonnegative', sql`${table.inventoryQuantity} >= 0`),
    check(
      'product_variants_inventory_reserved_valid',
      sql`${table.inventoryReserved} >= 0 and (not ${table.inventoryTracked} or ${table.inventoryReserved} <= ${table.inventoryQuantity})`
    ),
  ]
);

// Produktbilderna. Filerna ligger i Vercel Blob och inte hos Shopify — en
// bild-URL som pekar på cdn.shopify.com hade gjort butiken omöjlig att stänga.
// `blobPathname` behövs för att kunna radera filen, inte bara raden.
export const productImages = pgTable(
  'product_images',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // En bild kan höra till en enskild variant. Överlever att varianten städas
    // bort, av samma skäl som orderraderna gör det.
    variantId: integer('variant_id').references(() => productVariants.id, {
      onDelete: 'set null',
    }),
    url: text('url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    sourceUrl: text('source_url'),
    altText: text('alt_text'),
    width: integer('width'),
    height: integer('height'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('product_images_product_id_position_idx').on(table.productId, table.position),
    uniqueIndex('product_images_product_source_key')
      .on(table.productId, table.sourceUrl)
      .where(isNotNull(table.sourceUrl)),
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
    descriptionHtml: text('description_html'),
    descriptionHtmlEn: text('description_html_en'),
    seoTitle: text('seo_title'),
    seoTitleEn: text('seo_title_en'),
    seoDescription: text('seo_description'),
    seoDescriptionEn: text('seo_description_en'),
    imageUrl: text('image_url'),
    imageBlobPathname: text('image_blob_pathname'),
    imageSourceUrl: text('image_source_url'),
    imageAltText: text('image_alt_text'),
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    shopifyUpdatedAt: timestamp('shopify_updated_at', { withTimezone: true }),
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

// Den egna korgen är en kapabilitetsresurs: ett slumpmässigt UUID fungerar som
// både identifierare och den hemlighet som krävs för att läsa eller ändra den.
// Den är storefrontens enda korg och kan stängas av med commerce-kill-switchen.
export const carts = pgTable(
  'carts',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull().default('active'),
    customerNo: text('customer_no'),
    locale: text('locale').notNull().default('sv'),
    currency: text('currency').notNull().default('sek'),
    pricingVersion: text('pricing_version').notNull().default('v1'),
    // Ökas vid varje ändring. Checkout använder (cart_id, version) som
    // idempotensnyckel, så ett dubbelklick kan aldrig frysa två ordrar.
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    checkoutStartedAt: timestamp('checkout_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('carts_status_expires_at_idx').on(table.status, table.expiresAt),
    check('carts_version_check', sql`${table.version} > 0`),
  ]
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('cart_items_cart_variant_key').on(table.cartId, table.variantId),
    index('cart_items_cart_id_idx').on(table.cartId),
    check('cart_items_quantity_check', sql`${table.quantity} > 0`),
  ]
);

export type CartRow = typeof carts.$inferSelect;
export type CartItemRow = typeof cartItems.$inferSelect;

export const customers = pgTable(
  'customers',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    shopifyCustomerId: text('shopify_customer_id'),
    customerNo: text('customer_no'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    company: text('company'),
    phone: text('phone'),
    taxId: text('tax_id'),
    taxIdType: text('tax_id_type'),
    defaultBillingAddress: jsonb('default_billing_address').$type<Record<string, string | null>>(),
    defaultShippingAddress: jsonb('default_shipping_address').$type<Record<string, string | null>>(),
    acceptsMarketing: boolean('accepts_marketing').notNull().default(false),
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('customers_email_key').on(sql`lower(${table.email})`),
    uniqueIndex('customers_stripe_customer_id_key')
      .on(table.stripeCustomerId)
      .where(isNotNull(table.stripeCustomerId)),
    uniqueIndex('customers_shopify_customer_id_key')
      .on(table.shopifyCustomerId)
      .where(isNotNull(table.shopifyCustomerId)),
    index('customers_customer_no_idx').on(table.customerNo),
    index('customers_client_id_idx').on(table.clientId),
  ]
);

export const discountCodes = pgTable(
  'discount_codes',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    value: integer('value').notNull().default(0),
    currency: text('currency').notNull().default('sek'),
    minimumSubtotalMinor: integer('minimum_subtotal_minor').notNull().default(0),
    usageLimit: integer('usage_limit'),
    usageLimitPerCustomer: integer('usage_limit_per_customer'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    stripeCouponId: text('stripe_coupon_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('discount_codes_code_key').on(sql`upper(${table.code})`),
    check('discount_codes_kind_check', sql`${table.kind} in ('percentage', 'fixed_amount', 'free_shipping')`),
  ]
);

export const shippingRules = pgTable(
  'shipping_rules',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    name: text('name').notNull(),
    countryCodes: text('country_codes').array().notNull().default(['SE']),
    postalCodePrefixes: text('postal_code_prefixes').array().notNull().default([]),
    minimumSubtotalMinor: integer('minimum_subtotal_minor').notNull().default(0),
    maximumSubtotalMinor: integer('maximum_subtotal_minor'),
    priceMinor: integer('price_minor').notNull().default(0),
    freeAboveMinor: integer('free_above_minor'),
    currency: text('currency').notNull().default('sek'),
    estimatedMinDays: integer('estimated_min_days'),
    estimatedMaxDays: integer('estimated_max_days'),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('shipping_rules_active_priority_idx').on(table.active, table.priority)]
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
    cartId: text('cart_id').references(() => carts.id, { onDelete: 'set null' }),
    cartVersion: integer('cart_version'),
    status: text('status').notNull().default('pending'),
    paymentStatus: text('payment_status').notNull().default('pending'),
    fulfillmentStatus: text('fulfillment_status').notNull().default('unfulfilled'),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    email: text('email'),
    customerName: text('customer_name'),
    // Sparad som den kom från Stripe: en adress ska visa vad kunden angav vid
    // köptillfället, inte vad den ändrats till efteråt.
    shippingAddress: jsonb('shipping_address').$type<Record<string, string | null>>(),
    // Fakturaadressen och köparens org-/VAT-nummer som de såg ut vid köpet. En
    // momsfaktura måste bära köparens uppgifter, och Stripe är inte arkivet.
    billingAddress: jsonb('billing_address').$type<Record<string, string | null>>(),
    taxIdType: text('tax_id_type'),
    taxIdValue: text('tax_id_value'),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    discountCodeId: integer('discount_code_id').references(() => discountCodes.id, {
      onDelete: 'set null',
    }),
    discountCode: text('discount_code'),
    discountMinor: integer('discount_minor').notNull().default(0),
    shippingRuleId: integer('shipping_rule_id').references(() => shippingRules.id, {
      onDelete: 'set null',
    }),
    shippingMethod: text('shipping_method'),
    shippingMinor: integer('shipping_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    // Hur momsen räknades, inte bara hur mycket den blev: 'explicit' (vår egen
    // svenska sats) eller 'automatic' (Stripe Tax). Satsen sparas i hundradels
    // procent, 25 % = 2500. Utan de här går en gammal order inte att stämma av
    // sedan VAT_PERCENT eller Stripe Tax-flaggan ändrats.
    vatMode: text('vat_mode'),
    vatBps: integer('vat_bps'),
    vatRateId: text('vat_rate_id'),
    totalMinor: integer('total_minor').notNull().default(0),
    refundedMinor: integer('refunded_minor').notNull().default(0),
    // Vilken version av prisreglerna ordern prissattes under. Se 0028 och
    // pricingConfigDb.updatePricingConfig.
    pricingVersion: text('pricing_version'),
    currency: text('currency').notNull().default('sek'),
    locale: text('locale'),
    notes: text('notes'),
    // Sant när ordern skapades med en Stripe-nyckel i testläge. Sätts en gång,
    // vid skapandet, och beskriver nyckeln som användes då — inte vilket läge
    // appen står i när någon läser raden.
    testMode: boolean('test_mode').notNull().default(false),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('orders_stripe_session_id_key').on(table.stripeSessionId),
    index('orders_status_idx').on(table.status),
    index('orders_customer_id_idx').on(table.customerId),
    index('orders_fulfillment_status_idx').on(table.fulfillmentStatus),
    index('orders_test_mode_idx').on(table.testMode, table.createdAt),
    index('orders_pending_reconciliation_idx')
      .on(table.createdAt.desc())
      .where(sql`${table.paymentStatus} = 'pending'`),
    uniqueIndex('orders_cart_version_key')
      .on(table.cartId, table.cartVersion)
      .where(sql`${table.cartId} is not null and ${table.cartVersion} is not null`),
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

export const discountRedemptions = pgTable(
  'discount_redemptions',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    discountCodeId: integer('discount_code_id')
      .notNull()
      .references(() => discountCodes.id, { onDelete: 'restrict' }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    email: text('email'),
    amountMinor: integer('amount_minor').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('discount_redemptions_order_key').on(table.orderId),
    index('discount_redemptions_code_idx').on(table.discountCodeId),
  ]
);

export const refunds = pgTable(
  'refunds',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    stripeRefundId: text('stripe_refund_id').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    // Hur mycket av det återbetalade beloppet som var utgående moms. Beloppet
    // ovan är brutto — det är mot betalningen återbetalningen görs.
    taxMinor: integer('tax_minor').notNull().default(0),
    currency: text('currency').notNull().default('sek'),
    reason: text('reason'),
    status: text('status').notNull().default('pending'),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('refunds_stripe_refund_id_key').on(table.stripeRefundId),
    index('refunds_order_id_idx').on(table.orderId),
  ]
);

export const fulfillments = pgTable(
  'fulfillments',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('pending'),
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    trackingUrl: text('tracking_url'),
    note: text('note'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('fulfillments_order_id_idx').on(table.orderId)]
);

export const fulfillmentItems = pgTable(
  'fulfillment_items',
  {
    fulfillmentId: integer('fulfillment_id').notNull().references(() => fulfillments.id, { onDelete: 'cascade' }),
    orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  table => [
    primaryKey({ columns: [table.fulfillmentId, table.orderItemId] }),
    check('fulfillment_items_quantity_positive', sql`${table.quantity} > 0`),
  ]
);

/** Every accepted return, including untracked products, for quantity bounds. */
export const orderItemReturns = pgTable(
  'order_item_returns',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    orderItemId: integer('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    restock: boolean('restock').notNull(),
    actor: text('actor').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('order_item_returns_order_item_idx').on(table.orderItemId, table.createdAt),
    check('order_item_returns_quantity_positive', sql`${table.quantity} > 0`),
  ]
);

export const orderEvents = pgTable(
  'order_events',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    actor: text('actor').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('order_events_order_id_idx').on(table.orderId, table.createdAt)]
);

// Ett lagerhåll per orderrad: enheterna binds när en order betalas (eller en
// faktura godkänns) och släpps antingen vid plock (consumed) eller vid
// makulering/utgång (released). En orderrad har högst en reservation.
export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    variantId: integer('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderItemId: integer('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('inventory_reservations_order_item_key').on(table.orderItemId),
    index('inventory_reservations_variant_id_idx').on(table.variantId),
    index('inventory_reservations_status_idx').on(table.status, table.expiresAt),
    check(
      'inventory_reservations_quantity_valid',
      sql`${table.quantity} >= 0 and (${table.status} <> 'active' or ${table.quantity} > 0)`
    ),
  ]
);

// Fullständig lagerhistorik — varje ändring av inventoryQuantity/inventoryReserved
// loggas här, så att lagersaldot alltid kan förklaras i efterhand.
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    variantId: integer('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    quantity: integer('quantity').notNull(),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
    orderItemId: integer('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    fulfillmentId: integer('fulfillment_id').references(() => fulfillments.id, { onDelete: 'set null' }),
    reservationId: integer('reservation_id').references(() => inventoryReservations.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    actor: text('actor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('inventory_movements_variant_id_idx').on(table.variantId, table.createdAt),
    index('inventory_movements_order_id_idx').on(table.orderId),
  ]
);

// Engångstoken för e-postlänksinloggning. Bara hashen sparas — en läckt rad ur
// databasen ska aldrig kunna växlas mot en session. Consumed_at sätts atomiskt
// vid inlösen (se magicLink.ts), aldrig läst-och-sedan-skrivet, så att ett
// dubbelklick eller en samtidig förfrågan inte kan lösa in samma token två gånger.
export const customerLoginTokens = pgTable(
  'customer_login_tokens',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    email: text('email').notNull(),
    requestedIp: text('requested_ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('customer_login_tokens_hash_key').on(table.tokenHash),
    index('customer_login_tokens_customer_id_idx').on(table.customerId),
    // Ratbegränsning slår upp mot de här: hur många tokens har den här
    // adressen respektive den här avsändar-IP:n begärt nyligen.
    index('customer_login_tokens_email_created_idx').on(table.email, table.createdAt),
    index('customer_login_tokens_ip_created_idx').on(table.requestedIp, table.createdAt),
  ]
);

export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    eventId: text('event_id').primaryKey(),
    eventType: text('event_type').notNull(),
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  table => [index('stripe_webhook_events_status_idx').on(table.status, table.createdAt)]
);

// Provförfrågningar från /samples. Formuläret kräver ingen inloggning — den som
// ber om prover är oftast ännu inte kund — så `customerId` fylls bara när
// adressen råkar matcha ett konto.
export const sampleRequests = pgTable(
  'sample_requests',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('new'),
    contactName: text('contact_name').notNull(),
    organizationName: text('organization_name').notNull(),
    organizationNumber: text('organization_number').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    postalCode: text('postal_code').notNull(),
    city: text('city').notNull(),
    country: text('country').notNull(),
    notes: text('notes'),
    locale: text('locale'),
    internalNote: text('internal_note'),
    handledBy: text('handled_by'),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    // Om aviseringsmejlet gick fram. Posten finns kvar oavsett.
    emailed: boolean('emailed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check(
      'sample_requests_status_check',
      sql`${table.status} in ('new', 'in_progress', 'sent', 'declined')`
    ),
    index('sample_requests_status_idx').on(table.status, table.createdAt),
    index('sample_requests_customer_id_idx').on(table.customerId),
  ]
);

// Titeln sparas även när produkten går att koppla, så att posten står kvar
// oförändrad om varan döps om eller utgår.
export const sampleRequestItems = pgTable(
  'sample_request_items',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    requestId: integer('request_id')
      .notNull()
      .references(() => sampleRequests.id, { onDelete: 'cascade' }),
    productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
    externalProductId: text('external_product_id'),
    title: text('title').notNull(),
    variantLabel: text('variant_label'),
  },
  table => [index('sample_request_items_request_id_idx').on(table.requestId)]
);

// Driftlarm. Varje fel som förr bara blev en rad i konsolen — en fälld webhook,
// en betald order utan lagerreservation, en tvist, ett mejl som inte gick fram —
// landar här och mejlas ut. Tabellen är samtidigt spärren mot larmstormar:
// samma `dedupeKey` mejlas högst en gång per fönster, men varje förekomst sparas.
export const opsAlerts = pgTable(
  'ops_alerts',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    subject: text('subject').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    // Null när larmet skrevs men mejlet hölls tillbaka av spärren, eller när
    // SMTP saknades i miljön.
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledgedBy: text('acknowledged_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('ops_alerts_created_idx').on(table.createdAt),
    index('ops_alerts_dedupe_idx').on(table.dedupeKey, table.createdAt),
  ]
);

// Adresser som flyttat. Skrivs när en produkt eller kategori byter handle och
// läses bara i den bana som annars hade svarat 404 — se redirectsDb.ts.
export const urlRedirects = pgTable(
  'url_redirects',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    // Utan språkprefix: handlen är gemensam för sv och en.
    fromPath: text('from_path').notNull(),
    toPath: text('to_path').notNull(),
    kind: text('kind').notNull().default('product'),
    hits: integer('hits').notNull().default(0),
    lastHitAt: timestamp('last_hit_at', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('url_redirects_from_path_key').on(table.fromPath),
    index('url_redirects_to_path_idx').on(table.toPath),
    check('url_redirects_not_circular', sql`${table.fromPath} <> ${table.toPath}`),
  ]
);

// Arkivet över prisreglerna. Den aktiva regeln bor kvar i `pricing_config`;
// varje sparning lägger en kopia här under ett eget versionsnamn, som korgar
// och ordrar stämplas med. Se 0028.
export const pricingConfigVersions = pgTable(
  'pricing_config_versions',
  {
    id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
    version: text('version').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('pricing_config_versions_version_key').on(table.version),
    index('pricing_config_versions_created_idx').on(table.createdAt),
  ]
);

export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type ProductImageRow = typeof productImages.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type ProductCollectionRow = typeof productCollections.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type DiscountCodeRow = typeof discountCodes.$inferSelect;
export type ShippingRuleRow = typeof shippingRules.$inferSelect;
export type RefundRow = typeof refunds.$inferSelect;
export type FulfillmentRow = typeof fulfillments.$inferSelect;
export type OrderEventRow = typeof orderEvents.$inferSelect;
export type InventoryReservationRow = typeof inventoryReservations.$inferSelect;
export type InventoryMovementRow = typeof inventoryMovements.$inferSelect;
export type CustomerLoginTokenRow = typeof customerLoginTokens.$inferSelect;
export type SampleRequestRow = typeof sampleRequests.$inferSelect;
export type SampleRequestItemRow = typeof sampleRequestItems.$inferSelect;
export type OpsAlertRow = typeof opsAlerts.$inferSelect;
export type UrlRedirectRow = typeof urlRedirects.$inferSelect;
export type PricingConfigVersionRow = typeof pricingConfigVersions.$inferSelect;
