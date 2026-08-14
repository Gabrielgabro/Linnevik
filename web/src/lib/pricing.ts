/**
 * Vad en variant kostar för en viss köpare, just nu.
 *
 * Det här är den enda platsen som avgör ett belopp. Stripe har medvetet inga
 * prisobjekt: beloppen räknas fram här och skickas in som `price_data` när
 * kassan skapas. Listpriset i `product_variants.price_minor` är utgångsläget,
 * och rabatterna läggs ovanpå.
 *
 * Alla belopp är i minorenheter (öre) och inklusive moms — svensk B2C-prissättning.
 */

import { inArray, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';

export type PricingContext = {
  /** Kundnummer ur `clients`, när köparen är ett avtalskonto. */
  customerNo?: string | null;
};

export type PricedLine = {
  variantId: number;
  sku: string;
  title: string;
  quantity: number;
  unitAmountMinor: number;
  currency: string;
  stripeProductId: string | null;
};

/**
 * Korgen i frontenden är fortfarande Shopifys och känner bara till dess
 * variant-ID. Båda vägarna in accepteras tills korgen flyttat hem.
 */
export type PriceableRequest = {
  sku?: string;
  shopifyVariantId?: string;
  quantity: number;
};

/** Mängdrabatt. Trapporna är medvetet grova — hotellen köper i kartong. */
const QUANTITY_BREAKS: Array<{ min: number; discount: number }> = [
  { min: 100, discount: 0.15 },
  { min: 50, discount: 0.1 },
  { min: 20, discount: 0.05 },
];

function quantityDiscount(quantity: number): number {
  return QUANTITY_BREAKS.find(step => quantity >= step.min)?.discount ?? 0;
}

/**
 * Priset för en rad. Avrundas till hela ören och kan aldrig bli negativt.
 *
 * Avtalspriser per kund finns ännu inte — `context.customerNo` tas emot men
 * används inte förrän prislogiken i /admin skrivits om till en delad modul.
 * Kroken sitter här så att anropsvägen inte behöver ändras när den kommer.
 */
export function resolveUnitAmount(
  listPriceMinor: number,
  quantity: number,
  _context: PricingContext = {}
): number {
  const discounted = listPriceMinor * (1 - quantityDiscount(quantity));
  return Math.max(0, Math.round(discounted));
}

/**
 * Slår upp varianterna, kontrollerar att de går att sälja, och sätter pris.
 * Kastar hellre än att tyst hoppa över en rad — en kassa som säljer färre
 * saker än kunden lade i korgen är värre än ett fel.
 */
export async function priceLines(
  requests: PriceableRequest[],
  context: PricingContext = {}
): Promise<PricedLine[]> {
  if (!requests.length) return [];

  const skus = requests.map(request => request.sku).filter((sku): sku is string => Boolean(sku));
  const shopifyIds = requests
    .map(request => request.shopifyVariantId)
    .filter((id): id is string => Boolean(id));

  const rows = await getDb()
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      shopifyVariantId: productVariants.shopifyVariantId,
      priceMinor: productVariants.priceMinor,
      currency: productVariants.currency,
      active: productVariants.active,
      productId: productVariants.productId,
    })
    .from(productVariants)
    .where(
      or(
        skus.length ? inArray(productVariants.sku, skus) : undefined,
        shopifyIds.length ? inArray(productVariants.shopifyVariantId, shopifyIds) : undefined
      )
    );

  const bySku = new Map(rows.map(row => [row.sku, row]));
  const byShopifyId = new Map(rows.map(row => [row.shopifyVariantId, row]));
  const resolve = (request: PriceableRequest) =>
    (request.sku ? bySku.get(request.sku) : undefined) ??
    (request.shopifyVariantId ? byShopifyId.get(request.shopifyVariantId) : undefined);

  const missing = requests.filter(request => !resolve(request));
  if (missing.length) {
    throw new Error(
      `Unknown SKU: ${missing.map(request => request.sku ?? request.shopifyVariantId).join(', ')}`
    );
  }

  const inactive = requests.filter(request => !resolve(request)!.active);
  if (inactive.length) {
    throw new Error(`Variant is not for sale: ${inactive.map(request => resolve(request)!.sku).join(', ')}`);
  }

  const currencies = new Set(rows.map(row => row.currency));
  if (currencies.size > 1) throw new Error('A cart cannot mix currencies.');

  const { products } = await import('@/lib/db/schema');
  const productRows = await getDb()
    .select({ id: products.id, title: products.title, stripeProductId: products.stripeProductId })
    .from(products)
    .where(inArray(products.id, [...new Set(rows.map(row => row.productId))]));
  const productById = new Map(productRows.map(row => [row.id, row]));

  return requests.map(request => {
    const variant = resolve(request)!;
    const product = productById.get(variant.productId);
    if (request.quantity < 1) throw new Error(`Quantity must be at least 1 for ${variant.sku}.`);

    return {
      variantId: variant.id,
      sku: variant.sku,
      title: product ? `${product.title} (${variant.sku})` : variant.sku,
      quantity: request.quantity,
      unitAmountMinor: resolveUnitAmount(variant.priceMinor, request.quantity, context),
      currency: variant.currency,
      stripeProductId: product?.stripeProductId ?? null,
    };
  });
}
