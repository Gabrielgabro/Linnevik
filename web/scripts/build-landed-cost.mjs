/**
 * Genererar src/data/landedCost.ts från catalog/beställningar/2026/prisanalys.csv.
 *
 * CSV:n är källan — den byggs i sin tur från leverantörsfakturan, fraktfakturan
 * och bankunderlaget. Kör detta skript när CSV:n ändras:
 *
 *   node scripts/build-landed-cost.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CSV = resolve(here, '../../catalog/beställningar/2026/prisanalys.csv');
const OUT = resolve(here, '../src/data/landedCost.ts');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(v => v !== ''));
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const num = v => (v === '' || v == null ? null : Number(v));
const records = parseCsv(readFileSync(CSV, 'utf8'));
const lines = records.filter(r => r.description !== 'TOTAL');
const total = records.find(r => r.description === 'TOTAL');

const products = lines.map(r => ({
  description: r.description,
  title: r.shopify_title,
  handle: r.shopify_handle,
  skuPrefix: r.variant_sku_prefix,
  confidence: r.mapping_confidence,
  qty: num(r.qty_pcs),
  cbm: num(r.cbm),
  // Bankavgiften ligger i varukostnaden här — den är en kostnad för att betala varan.
  goodsPerPcs: Number((num(r.goods_sek_per_pcs) + num(r.bankfee_sek_per_pcs)).toFixed(2)),
  freightPerPcs: num(r.freight_sek_per_pcs),
  dutyPerPcs: num(r.duty_sek_per_pcs),
  /** Radtotal direkt från CSV — inte styckpris × antal, som drar med avrundningsfel. */
  lineTotalSek: num(r.landed_total_sek),
}));

const shipment = {
  goodsInvoiceNo: total.goods_invoice_no,
  freightInvoiceNo: total.freight_invoice_no,
  bankRef: total.bank_ref,
  invoicedUsd: num(total.invoiced_usd),
  paidUsd: num(total.paid_usd),
  fx: num(total.fx_usd_sek_paid),
  qty: num(total.qty_pcs),
  cbm: num(total.cbm),
  landedTotalSek: num(total.landed_total_sek),
  upliftPct: num(total.uplift_vs_goods_pct),
};

const banner = `// GENERERAD FIL — redigera inte för hand.
// Källa: catalog/beställningar/2026/prisanalys.csv
// Kör: node scripts/build-landed-cost.mjs
`;

writeFileSync(OUT, `${banner}
export type LandedCostProduct = {
  description: string;
  title: string;
  handle: string;
  skuPrefix: string;
  /** "confirmed" = mappningen mot Shopify är belagd, "likely" = sannolik men overifierad. */
  confidence: string;
  qty: number;
  cbm: number;
  /** Betald varukostnad inkl. andel av bankavgift, SEK per styck. */
  goodsPerPcs: number;
  freightPerPcs: number;
  dutyPerPcs: number;
  /** Landad kostnad för hela raden, SEK. */
  lineTotalSek: number;
};

export const shipment = ${JSON.stringify(shipment, null, 2)} as const;

export const products: LandedCostProduct[] = ${JSON.stringify(products, null, 2)};

export const landedPerPcs = (p: LandedCostProduct) =>
  p.goodsPerPcs + p.freightPerPcs + p.dutyPerPcs;

export const lineTotal = (p: LandedCostProduct) => p.lineTotalSek;
`);

mkdirSync(dirname(OUT), { recursive: true });
console.log(`Skrev ${OUT} — ${products.length} produkter, landad kostnad ${shipment.landedTotalSek} SEK`);
