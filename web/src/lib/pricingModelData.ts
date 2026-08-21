/**
 * Underlaget mängdrabattsidan modellerar `orderValue` mot.
 *
 * Tre källor vägs ihop per produkt:
 *   - landad kostnad ur `data/landedCost.ts` (sändning HTL26-01),
 *   - konkurrentgolvet ur `data/competitorPrices.ts`,
 *   - det faktiska listpriset ur `product_variants`.
 *
 * Listpriset hämtas ur databasen och inte ur prisanalysens `suggestedSek`,
 * därför att analysen är ett förslag och priset i katalogen är det kunden
 * faktiskt betalar. Modellen ska visa marginalen vi har, inte den vi föreslog.
 * Saknas varianten faller raden tillbaka på förslaget, och säger det med
 * `listPriceSource`.
 *
 * Bara de sex produkter som har landad kostnad kommer med — utan kostnad går
 * ingen marginal att räkna, och en modell som gissar kostnaden vore värre än
 * en som utelämnar raden.
 */

import { inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';
import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import { competitorProducts, floorOf, primaryOf } from '@/data/competitorPrices';

export type PricingModelProduct = {
  skuPrefix: string;
  title: string;
  /** Landad kostnad per styck, öre. */
  landedCostMinor: number;
  /** Listpris per styck, öre. */
  listPriceMinor: number;
  listPriceSource: 'catalog' | 'analysis';
  /** Kubikmeter per styck — styr hur mycket frakten faller vid konsolidering. */
  cbmPerUnit: number;
  /** Fraktens andel av landad kostnad, procent. */
  freightSharePercent: number;
  /** Billigaste jämförbara B2B-pris, öre. `null` när underlag saknas. */
  competitorFloorMinor: number | null;
  competitorFloorVendor: string | null;
  /** Den konkurrent vi anser närmast likvärdig, öre. */
  competitorPrimaryMinor: number | null;
  /** Storleken kostnaden är räknad på, t.ex. '150 × 200'. */
  size: string;
  /** Sant när listpriset ligger under landad kostnad — raden går med förlust. */
  belowCost: boolean;
};

const toMinor = (sek: number) => Math.round(sek * 100);

/**
 * '150 × 200' → '150200', '50 × 70' → '5070'. SKU:erna kodar storleken utan
 * skiljetecken (TAC-SEB-150200-AND, KUD-ERI-5070, MAD-160200), så det räcker
 * att plocka ut siffergrupperna och slå ihop dem.
 */
function sizeToken(size: string): string {
  return (size.match(/\d+/g) ?? []).join('');
}

export async function getPricingModelProducts(): Promise<PricingModelProduct[]> {
  const analysisByPrefix = new Map(competitorProducts.map(p => [p.skuPrefix, p]));

  // Listpriser ur katalogen. Prefixmatchning görs i minnet: SKU:erna är få och
  // ett LIKE-villkor per prefix vore sex frågor i stället för en.
  let variants: { sku: string; priceMinor: number }[] = [];
  if (process.env.DATABASE_URL) {
    const prefixes = landedProducts.map(p => p.skuPrefix);
    variants = await getDb()
      .select({ sku: productVariants.sku, priceMinor: productVariants.priceMinor })
      .from(productVariants)
      .where(inArray(productVariants.currency, ['sek', 'SEK']))
      .then(rows => rows.filter(row => prefixes.some(prefix => row.sku.startsWith(prefix))));
  }

  return landedProducts.map((product): PricingModelProduct => {
    const landed = landedPerPcs(product);
    const analysis = analysisByPrefix.get(product.skuPrefix);

    // Landad kostnad är räknad på en bestämd storlek (`ourSize` i
    // konkurrentanalysen). Varianterna måste filtreras på just den, annars
    // jämförs t.ex. madrasskyddet 80 × 200 mot kostnaden för 160 × 200 och
    // marginalen ser tre gånger sämre ut än den är.
    const token = analysis ? sizeToken(analysis.ourSize) : '';
    const sameProduct = variants.filter(v => v.sku.startsWith(product.skuPrefix));
    const sameSize = token ? sameProduct.filter(v => v.sku.includes(token)) : [];
    // Kostnaden är nycklad per produkt, inte per variant, så flera utföranden
    // (and/gås) kan dela kostnad. Lägsta priset är då det försiktiga valet:
    // det ger den sämsta marginalen produkten kan ha.
    const candidates = sameSize.length ? sameSize : sameProduct;
    const catalogPriceMinor = candidates.length
      ? Math.min(...candidates.map(v => v.priceMinor))
      : null;

    const floor = analysis ? floorOf(analysis) : null;
    const primary = analysis ? primaryOf(analysis) : null;
    const listPriceMinor = catalogPriceMinor ?? toMinor(analysis?.suggestedSek ?? 0);

    return {
      skuPrefix: product.skuPrefix,
      title: product.title,
      landedCostMinor: toMinor(landed),
      listPriceMinor,
      listPriceSource: catalogPriceMinor != null ? 'catalog' : 'analysis',
      size: analysis?.ourSize ?? '',
      belowCost: listPriceMinor > 0 && listPriceMinor < toMinor(landed),
      cbmPerUnit: product.cbm / product.qty,
      freightSharePercent: (product.freightPerPcs / landed) * 100,
      competitorFloorMinor: floor ? toMinor(floor.priceSek) : null,
      competitorFloorVendor: floor?.vendor ?? null,
      competitorPrimaryMinor: primary ? toMinor(primary.priceSek) : null,
    };
  });
}
