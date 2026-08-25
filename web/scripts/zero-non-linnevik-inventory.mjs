/**
 * Nollställer lagersaldot på varianter vars produkt inte har Linnevik som
 * leverantör.
 *
 * Urvalet följer `products.supplier` (case-insensitive, allt utom 'linnevik'
 * räknas som "inte Linnevik" — det inkluderar 'unknown'). Varianter med
 * bundna reservationer hoppas över: att nolla `inventory_quantity` under en
 * aktiv reservation skulle göra `inventory_quantity - inventory_reserved`
 * negativt.
 *
 * Torrkörning: node scripts/zero-non-linnevik-inventory.mjs
 * Skriv:      node scripts/zero-non-linnevik-inventory.mjs --apply
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
  select v.id, v.sku, v.inventory_quantity, v.inventory_reserved,
         p.handle, p.supplier
    from product_variants v
    join products p on p.id = v.product_id
   where lower(p.supplier) <> 'linnevik'
   order by p.handle, v.sku`;

if (!candidates.length) {
  console.log('Inga produkter har en annan leverantör än Linnevik.');
  process.exit(0);
}

const reserved = candidates.filter(row => row.inventory_reserved > 0);
const toChange = candidates.filter(row => row.inventory_quantity !== 0 && row.inventory_reserved === 0);

for (const row of candidates) {
  const state =
    row.inventory_reserved > 0
      ? `HOPPAS ÖVER — ${row.inventory_reserved} reserverade`
      : row.inventory_quantity === 0
        ? 'redan 0'
        : apply
          ? 'nollställd'
          : 'att nollställa';
  console.log(
    `${row.handle.padEnd(20)} ${row.sku.padEnd(22)} leverantör=${row.supplier.padEnd(24)} lager=${String(row.inventory_quantity).padStart(7)} ${state}`
  );
}

if (apply) {
  for (const row of toChange) {
    await sql`
      update product_variants
         set inventory_quantity = 0, updated_at = now()
       where id = ${row.id} and inventory_reserved = 0`;
  }
}

console.log(
  `\n${candidates.length} varianter genomgångna: ` +
    `${toChange.length} ${apply ? 'nollställda' : 'att nollställa'}, ` +
    `${candidates.length - toChange.length - reserved.length} redan 0, ` +
    `${reserved.length} överhoppade med aktiva reservationer.`
);
if (!apply) console.log('\nKör om med --apply för att skriva.');
