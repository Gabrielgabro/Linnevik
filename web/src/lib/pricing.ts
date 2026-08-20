/**
 * Serversidan av prissättningen: slår upp varianten, hämtar konfigurationen och
 * lämnar över räknandet till `pricingRules.ts`.
 *
 * Själva logiken bor inte här, utan i den rena modulen, därför att produktsidan
 * måste kunna räkna exakt samma sak i webbläsaren när kunden ändrar antal. Två
 * uppsättningar trappor är precis vad som gick fel förut — se pricingRules.ts.
 *
 * Stripe har medvetet inga prisobjekt: beloppen räknas fram här och skickas in
 * som `price_data` när kassan skapas.
 *
 * Alla belopp är i minorenheter (öre) och **exklusive moms**. Momsen läggs på i
 * kassan, se lib/vat.ts.
 */

import { inArray, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';
import { priceLine, type PricingConfig } from '@/lib/pricingRules';
import { getStoredPricingConfig } from '@/lib/pricingConfigDb';
import { landedCostMinorForSku } from '@/lib/landedCostLookup';

export type PricingContext = {
  /** Kundnummer ur `clients`, när köparen är ett avtalskonto. */
  customerNo?: string | null;
  /** Sant för produkter taggade MTO — mängdrabatten gäller bara dem som standard. */
  isMto?: boolean;
  /** SKU:n, för att kunna slå upp landad kostnad när marginallogiken används. */
  sku?: string;
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

/**
 * Konfigurationen som gäller just nu, läst ur `pricing_config` (id = 1).
 * Faller tillbaka på DEFAULT_PRICING_CONFIG om raden saknas — se
 * pricingConfigDb.ts.
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  return getStoredPricingConfig();
}

/**
 * Priset för en rad, exklusive moms.
 *
 * Avtalspriser per kund finns ännu inte — `context.customerNo` tas emot men
 * används inte förrän avtalspriser byggs. Kroken sitter här så att
 * anropsvägen inte behöver ändras när den kommer.
 */
export async function resolveUnitAmount(
  listPriceMinor: number,
  quantity: number,
  context: PricingContext = {}
): Promise<number> {
  const config = await getPricingConfig();
  return priceLine(config, {
    listPriceMinor,
    quantity,
    isMto: context.isMto ?? false,
    landedCostMinor: context.sku ? landedCostMinorForSku(context.sku) : null,
  }).unitAmountMinor;
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

  const pricingConfigForRequest = await getPricingConfig();

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
    .select({
      id: products.id,
      title: products.title,
      tags: products.tags,
      stripeProductId: products.stripeProductId,
    })
    .from(products)
    .where(inArray(products.id, [...new Set(rows.map(row => row.productId))]));
  const productById = new Map(productRows.map(row => [row.id, row]));

  return requests.map(request => {
    const variant = resolve(request)!;
    const product = productById.get(variant.productId);
    if (request.quantity < 1) throw new Error(`Quantity must be at least 1 for ${variant.sku}.`);
    const isMto = product?.tags?.includes('MTO') ?? false;

    return {
      variantId: variant.id,
      sku: variant.sku,
      title: product ? `${product.title} (${variant.sku})` : variant.sku,
      quantity: request.quantity,
      unitAmountMinor: priceLine(pricingConfigForRequest, {
        listPriceMinor: variant.priceMinor,
        quantity: request.quantity,
        isMto,
        landedCostMinor: landedCostMinorForSku(variant.sku),
      }).unitAmountMinor,
      currency: variant.currency,
      stripeProductId: product?.stripeProductId ?? null,
    };
  });
}
