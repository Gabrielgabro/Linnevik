/**
 * Två städningar på Franzén-sortimentet.
 *
 * 1. Tar bort de handskrivna inköpspriserna på Nevada. De skrevs in från
 *    Franzéns inloggning 2026-08-29 och visade sig vara på öret samma som
 *    `customerPrice` i artikelfilen — alltså inget förmånligare pris. Står de
 *    kvar påstår grafen "Vårt inköpspris (förmånligt)" om ett pris som inte är
 *    förmånligt, och då betyder etiketten ingenting den dagen ett riktigt
 *    rabatterat pris kommer in. `supplier_cost_minor` nollställs till NULL och
 *    marginalen räknas mot artikelfilen igen, precis som före 0038.
 *    `purchase_batch_size` rörs inte — det är ny uppgift som inte fanns förut.
 *
 * 2. Sätter lagersaldot till 1000 på samtliga Franzén-varianter. Åtta av dem
 *    ligger redan där; det är alltså den etablerade nivån för sortimentet och
 *    inte ett tal som hittas på här. Notera att det går tvärtemot
 *    `zero-non-linnevik-inventory.mjs`, som nollade allt som inte är Linnevik
 *    — den körningen gällde när sortimentet inte var påtänkt att säljas.
 *
 * Varianter med bundna reservationer hoppas över av samma skäl som i
 * nollningsskriptet, och varje ändring skrivs som en `adjust`-rörelse i
 * `inventory_movements` så att lagerhistoriken i /admin stämmer.
 *
 * Torrkörning: node scripts/franzen-stock-and-costs.mjs
 * Skriv:       node scripts/franzen-stock-and-costs.mjs --apply
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
try {
  process.loadEnvFile(resolve(here, '../.env.local'));
} catch {
  // CI och produktion sätter variablerna direkt.
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');

const SUPPLIER = 'Franzén Textil i Kinna';
const TARGET_STOCK = 1000;
const ACTOR = 'script:franzen-stock-and-costs';

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  select v.id, v.sku, v.inventory_quantity, v.inventory_reserved, v.inventory_tracked,
         v.supplier_cost_minor, v.active, p.handle
    from product_variants v
    join products p on p.id = v.product_id
   where p.supplier = ${SUPPLIER}
   order by p.handle, v.position, v.sku`;

if (!rows.length) throw new Error(`Inga varianter med leverantör ${SUPPLIER}.`);

const costsToClear = rows.filter(r => r.supplier_cost_minor !== null);
const blocked = rows.filter(r => r.inventory_tracked && r.inventory_reserved > TARGET_STOCK);
const stockToSet = rows.filter(
  r => r.inventory_quantity !== TARGET_STOCK && !blocked.includes(r)
);

for (const r of rows) {
  const cost = r.supplier_cost_minor === null ? '—' : (r.supplier_cost_minor / 100).toFixed(2);
  const stockState = blocked.includes(r)
    ? `HOPPAS ÖVER — ${r.inventory_reserved} reserverade`
    : r.inventory_quantity === TARGET_STOCK
      ? 'redan 1000'
      : `${r.inventory_quantity} → ${TARGET_STOCK}`;
  console.log(
    `${r.handle.padEnd(20)} ${r.sku.padEnd(22)} aktiv=${String(r.active).padEnd(5)} ` +
      `inköp=${cost.padStart(6)}${r.supplier_cost_minor === null ? '  ' : ' →—'}  lager: ${stockState}`
  );
}

console.log(
  `\n${rows.length} varianter: ${costsToClear.length} inköpspris ${apply ? 'rensade' : 'att rensa'}, ` +
    `${stockToSet.length} lagersaldon ${apply ? 'satta' : 'att sätta'}, ${blocked.length} överhoppade.`
);

if (!apply) {
  console.log('\nTorrkörning. Inget skrevs. Kör om med --apply.');
  process.exit(0);
}

for (const r of costsToClear) {
  await sql`update product_variants
               set supplier_cost_minor = null, updated_at = now()
             where id = ${r.id}`;
}

// Samma form som setVariantStock: saldot och rörelsen i samma sats, och
// villkoret om reservationer kontrollerat om under radlåset.
for (const r of stockToSet) {
  await sql`
    with locked as materialized (
      select id, inventory_quantity as before, inventory_reserved, inventory_tracked
        from product_variants where id = ${r.id} for update
    ), eligible as materialized (
      select id, before from locked
       where (not inventory_tracked or ${TARGET_STOCK} >= inventory_reserved)
         and before <> ${TARGET_STOCK}
    ), updated as (
      update product_variants pv set inventory_quantity = ${TARGET_STOCK}, updated_at = now()
        from eligible e where pv.id = e.id
    )
    insert into inventory_movements (variant_id, type, quantity, actor, note)
    select id, 'adjust', ${TARGET_STOCK} - before, ${ACTOR},
           'Franzén-sortimentet tas i drift'
      from eligible`;
}

console.log(`\nKlart: ${costsToClear.length} inköpspris rensade, ${stockToSet.length} lagersaldon satta.`);
