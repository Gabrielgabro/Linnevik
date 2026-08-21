/**
 * Serversidan av prissättningen hämtar konfigurationen och lämnar över
 * räknandet till `pricingRules.ts`. Variant/orderkontrollen ägs av cartDb.
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
