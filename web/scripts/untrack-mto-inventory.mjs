/**
 * Slår av lagerspårningen på MTO-varianterna.
 *
 * MTO-produkterna tillverkas mot order och har därför inget lager — men
 * `inventory_tracked` stod på `true` på samtliga 55 varianter, och
 * `assertOrderable` avvisar då varje kvantitet över `inventory_quantity`.
 * Resultatet var motsägelsefullt: produktsidan visade en fungerande köpknapp
 * (varianten är både `active` och `available_for_sale`), medan korgen svarade
 * "Det finns bara 0 av ... i lager" i samma ögonblick kunden klickade.
 *
 * Migreringsplanen säger att MTO ska gå att beställa utan lagerreservation
 * (the_big_purge.md: "Treat MTO products as orderable without stock
 * reservation, with their configured MOQ, carton increment, and lead time").
 * `assertOrderable` har redan stödet — det är bara datat som inte använt det.
 *
 * Urvalet följer taggen `MTO` på produkten, samma tagg som produktsidan går
 * efter för volympriset (`hasMTOTag`). Lagerförda produkter rörs inte.
 *
 * Torrkörning: node scripts/untrack-mto-inventory.mjs
 * Skriv:      node scripts/untrack-mto-inventory.mjs --apply
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

const sql = neon(process.env.DATABASE_URL);

const candidates = await sql`
  select v.id, v.sku, v.inventory_tracked, v.inventory_quantity, v.inventory_reserved,
         p.handle, p.tags
    from product_variants v
    join products p on p.id = v.product_id
   where 'MTO' = any(p.tags)
   order by p.handle, v.sku`;

if (!candidates.length) {
  console.log('Inga produkter är taggade MTO.');
  process.exit(0);
}

// En variant med bundna reservationer får inte tappa spårningen tyst: då
// slutar `fulfillReservedStock` kunna räkna ned det som redan är lovat bort.
const reserved = candidates.filter(row => row.inventory_reserved > 0);
const toChange = candidates.filter(row => row.inventory_tracked && row.inventory_reserved === 0);

for (const row of candidates) {
  const state = !row.inventory_tracked
    ? 'redan otrackad'
    : row.inventory_reserved > 0
      ? `HOPPAS ÖVER — ${row.inventory_reserved} reserverade`
      : apply
        ? 'otrackad'
        : 'att otracka';
  console.log(
    `${row.handle.padEnd(18)} ${row.sku.padEnd(22)} lager=${String(row.inventory_quantity).padStart(7)} ${state}`
  );
}

if (apply) {
  for (const row of toChange) {
    await sql`
      update product_variants
         set inventory_tracked = false, updated_at = now()
       where id = ${row.id} and inventory_reserved = 0`;
  }
}

console.log(
  `\n${candidates.length} MTO-varianter genomgångna: ` +
    `${toChange.length} ${apply ? 'otrackade' : 'att otracka'}, ` +
    `${candidates.length - toChange.length - reserved.length} redan otrackade, ` +
    `${reserved.length} överhoppade med aktiva reservationer.`
);
if (!apply) console.log('\nKör om med --apply för att skriva.');
