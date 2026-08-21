import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { cartItems, carts, productImages, products, productVariants } from '@/lib/db/schema';
import { assertOrderable } from '@/lib/cartRules';
import { CURRENT_PRICING_VERSION, OWNED_CART_TTL_DAYS } from '@/lib/commerceConfig';
import { getPricingConfig } from '@/lib/pricing';
import { priceOrder } from '@/lib/pricingRules';
import { landedCostMinorForSku } from '@/lib/landedCostLookup';
import { vatOn, vatPercent } from '@/lib/vat';

export class CartError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = 'CartError';
  }
}

type CartLineRow = {
  id: number;
  variantId: number;
  quantity: number;
  sku: string;
  productHandle: string;
  productTitle: string;
  variantTitle: Array<{ name: string; value: string }>;
  unitAmountMinor: number;
  currency: string;
  imageUrl: string | null;
  imageAlt: string | null;
  stripeProductId: string | null;
};

export type OwnedCart = {
  id: string;
  status: string;
  customerNo: string | null;
  locale: string;
  currency: string;
  pricingVersion: string;
  version: number;
  expiresAt: Date;
  lines: Array<CartLineRow & { lineAmountMinor: number }>;
  /** Exklusive moms, som priserna visas på sajten. */
  subtotalMinor: number;
  /** Exklusive moms. Rabatter och frakt läggs på i kassan. */
  totalMinor: number;
  /** Momsen på summan, redovisad separat så kassan inte är första stället den syns. */
  vatMinor: number;
  totalIncVatMinor: number;
  vatPercent: number;
};

function expiresAt(): Date {
  return new Date(Date.now() + OWNED_CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function createOwnedCart(input: {
  locale?: string;
  currency?: string;
  customerNo?: string | null;
} = {}): Promise<OwnedCart> {
  const id = crypto.randomUUID();
  await getDb().insert(carts).values({
    id,
    locale: input.locale === 'en' ? 'en' : 'sv',
    currency: (input.currency || 'sek').toLowerCase(),
    customerNo: input.customerNo || null,
    pricingVersion: CURRENT_PRICING_VERSION,
    expiresAt: expiresAt(),
  });
  return (await getOwnedCart(id))!;
}

export async function getOwnedCart(id: string): Promise<OwnedCart | null> {
  const [cart] = await getDb().select().from(carts).where(eq(carts.id, id)).limit(1);
  if (!cart) return null;

  let status = cart.status;
  if (status === 'active' && cart.expiresAt.getTime() <= Date.now()) {
    status = 'expired';
    await getDb()
      .update(carts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(carts.id, id), eq(carts.status, 'active')));
  }

  const rows = await getDb()
    .select({
      id: cartItems.id,
      variantId: productVariants.id,
      quantity: cartItems.quantity,
      sku: productVariants.sku,
      productHandle: products.handle,
      productTitle: products.title,
      variantTitle: productVariants.optionValues,
      listPriceMinor: productVariants.priceMinor,
      currency: productVariants.currency,
      imageUrl: productImages.url,
      imageAlt: productImages.altText,
      stripeProductId: products.stripeProductId,
      tags: products.tags,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(
      productImages,
      and(eq(productImages.productId, products.id), eq(productImages.position, 0))
    )
    .where(eq(cartItems.cartId, id))
    .orderBy(asc(cartItems.createdAt));

  const pricingConfigForCart = await getPricingConfig();
  // Samma anrop som kassan gör, med samma kontext. Korgens summa och det
  // Stripe debiterar får aldrig kunna skilja sig åt. Hela korgen prissätts i
  // ett svep, eftersom `orderValue` mäter trappan på ordervärdet och därför
  // inte går att räkna rad för rad.
  const priced = priceOrder(
    pricingConfigForCart,
    rows.map(row => ({
      sku: row.sku,
      listPriceMinor: row.listPriceMinor,
      quantity: row.quantity,
      isMto: row.tags?.includes('MTO') ?? false,
      landedCostMinor: landedCostMinorForSku(row.sku),
    }))
  );
  const lines = rows.map((row, index) => {
    const unitAmountMinor = priced.lines[index].unitAmountMinor;
    return {
      id: row.id,
      variantId: row.variantId,
      quantity: row.quantity,
      sku: row.sku,
      productHandle: row.productHandle,
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      unitAmountMinor,
      currency: row.currency,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      stripeProductId: row.stripeProductId,
      lineAmountMinor: unitAmountMinor * row.quantity,
    };
  });
  const currencies = new Set(lines.map(line => line.currency));
  if (currencies.size > 1 || (currencies.size === 1 && !currencies.has(cart.currency))) {
    throw new CartError('Korgen innehåller produkter i olika valutor.', 409);
  }
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineAmountMinor, 0);
  // Korgen räknas exklusive moms, precis som priserna visas. Momsen redovisas
  // separat så att kassan inte är första stället kunden ser den.
  const vatMinor = vatOn(subtotalMinor);

  return {
    ...cart,
    status,
    lines,
    subtotalMinor,
    totalMinor: subtotalMinor,
    vatMinor,
    totalIncVatMinor: subtotalMinor + vatMinor,
    vatPercent: vatPercent(),
  };
}

async function requireEditableCart(id: string) {
  const cart = await getOwnedCart(id);
  if (!cart) throw new CartError('Korgen finns inte.', 404);
  if (cart.status !== 'active') throw new CartError('Korgen kan inte längre ändras.', 409);
  return cart;
}

async function requireVariant(variantId: number, quantity: number) {
  const [variant] = await getDb()
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      active: productVariants.active,
      availableForSale: productVariants.availableForSale,
      inventoryTracked: productVariants.inventoryTracked,
      inventoryQuantity: sql<number>`${productVariants.inventoryQuantity} - ${productVariants.inventoryReserved}`,
      minimumOrderQuantity: productVariants.minimumOrderQuantity,
      orderIncrement: productVariants.orderIncrement,
      tags: products.tags,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.id, variantId), eq(products.active, true)))
    .limit(1);
  if (!variant) throw new CartError('Varianten finns inte.', 404);
  // SAMPLE_ONLY-produkter går bara att beställa som prov, aldrig genom korgen.
  // Produktsidan visar redan ingen köpknapp för dem — spärren här stänger
  // vägen förbi den, t.ex. ett direktanrop mot /api/store/cart.
  if (variant.tags?.includes('SAMPLE_ONLY')) {
    throw new CartError(`${variant.sku} går bara att beställa som prov.`, 409);
  }
  assertOrderable(variant, quantity);
  return variant;
}

/**
 * Produktsidorna läser fortfarande katalogen (titel, bilder, options) från
 * Shopify — det är en egen, större migrering och ingår inte här. Varianterna
 * är redan speglade i product_variants med sitt Shopify-id sparat, så korgen
 * kan slå upp vårt numeriska variant-id från det utan att produktsidan
 * behöver ändras.
 */
export async function resolveVariantIdByShopifyId(shopifyVariantId: string): Promise<number | null> {
  const [variant] = await getDb()
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.shopifyVariantId, shopifyVariantId))
    .limit(1);
  return variant?.id ?? null;
}

export async function setOwnedCartItem(cartId: string, variantId: number, quantity: number) {
  const cart = await requireEditableCart(cartId);
  await requireVariant(variantId, quantity);
  const result = await getDb().execute(sql`
    with eligible as (
      select id from carts
      where id = ${cartId} and status = 'active' and version = ${cart.version}
        and expires_at > now()
      for update
    ), upserted as (
      insert into cart_items (cart_id, variant_id, quantity)
      select id, ${variantId}, ${quantity} from eligible
      on conflict (cart_id, variant_id) do update
        set quantity = excluded.quantity, updated_at = now()
      returning id
    ), bumped as (
      update carts set version = version + 1, updated_at = now(), expires_at = ${expiresAt()}
      where id in (select id from eligible) and exists (select 1 from upserted)
      returning id
    )
    select id from bumped
  `);
  if (!result.rows.length) throw new CartError('Korgen ändrades samtidigt. Försök igen.', 409);
  return getOwnedCart(cartId);
}

export async function updateOwnedCartItem(cartId: string, itemId: number, quantity: number) {
  const cart = await requireEditableCart(cartId);
  const [item] = await getDb()
    .select({ variantId: cartItems.variantId })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .limit(1);
  if (!item) throw new CartError('Korgartikeln finns inte.', 404);
  await requireVariant(item.variantId, quantity);
  const result = await getDb().execute(sql`
    with eligible as (
      select id from carts
      where id = ${cartId} and status = 'active' and version = ${cart.version}
        and expires_at > now()
      for update
    ), changed as (
      update cart_items set quantity = ${quantity}, updated_at = now()
      where id = ${itemId} and cart_id in (select id from eligible)
      returning id
    ), bumped as (
      update carts set version = version + 1, updated_at = now(), expires_at = ${expiresAt()}
      where id in (select id from eligible) and exists (select 1 from changed)
      returning id
    )
    select id from bumped
  `);
  if (!result.rows.length) throw new CartError('Korgen ändrades samtidigt. Försök igen.', 409);
  return getOwnedCart(cartId);
}

export async function removeOwnedCartItem(cartId: string, itemId: number) {
  const cart = await requireEditableCart(cartId);
  const result = await getDb().execute(sql`
    with eligible as (
      select id from carts
      where id = ${cartId} and status = 'active' and version = ${cart.version}
        and expires_at > now()
      for update
    ), removed as (
      delete from cart_items
      where id = ${itemId} and cart_id in (select id from eligible)
      returning id
    ), bumped as (
      update carts set version = version + 1, updated_at = now(), expires_at = ${expiresAt()}
      where id in (select id from eligible) and exists (select 1 from removed)
      returning id
    )
    select id from bumped
  `);
  if (!result.rows.length) throw new CartError('Korgartikeln saknas eller korgen ändrades.', 409);
  return getOwnedCart(cartId);
}

export async function validateOwnedCartForCheckout(id: string): Promise<OwnedCart> {
  const cart = await requireEditableCart(id);
  if (!cart.lines.length) throw new CartError('Korgen är tom.', 400);
  for (const line of cart.lines) await requireVariant(line.variantId, line.quantity);
  return cart;
}

export async function markOwnedCartCheckoutStarted(id: string, version: number): Promise<void> {
  await getDb()
    .update(carts)
    .set({ status: 'checkout_started', checkoutStartedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(carts.id, id), eq(carts.version, version), eq(carts.status, 'active')));
}
