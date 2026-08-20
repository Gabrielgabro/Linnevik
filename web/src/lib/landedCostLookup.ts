/**
 * Landad kostnad per SKU, i öre.
 *
 * `src/data/landedCost.ts` är genererad ur prisanalysen och nycklas på
 * produktens SKU-prefix, inte på hela SKU:n — kostnaden är räknad per produkt,
 * inte per storlek. Marginallogiken i `pricingRules.ts` behöver den per rad, och
 * det är den översättningen som bor här.
 *
 * Sex av sexton produkter finns i underlaget. `null` betyder att kostnaden inte
 * är utredd, och då lämnas marginalspärren därhän för raden — den får aldrig
 * gissa fram ett golv.
 */

import { landedPerPcs, products as landedProducts } from '@/data/landedCost';

const byPrefix = [...landedProducts]
  // Längsta prefixet först: `KUD-SIG` och `KUD-ERI` delar inledning, och en
  // kortare träff får aldrig vinna över en mer exakt.
  .sort((a, b) => b.skuPrefix.length - a.skuPrefix.length)
  .map(product => ({
    prefix: product.skuPrefix,
    landedCostMinor: Math.round(landedPerPcs(product) * 100),
  }));

export function landedCostMinorForSku(sku: string): number | null {
  const match = byPrefix.find(entry => sku.startsWith(entry.prefix));
  return match ? match.landedCostMinor : null;
}
