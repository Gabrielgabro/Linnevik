/**
 * Skapar Stripe-produkter för Franzén-sortimentet och skriver tillbaka ID:na
 * till Neon.
 *
 * Syskon till `push-stripe-catalog.mjs`, med samma deterministiska
 * produkt-ID (`linnevik_<handle>`) och samma nyttolast — men ett annat urval.
 * Det skriptet går efter handles i `landedCost.ts`, alltså de egna produkter
 * som har en landad kostnad; Franzén-varorna köps färdiga och finns inte där.
 *
 * Precis som i syskonet skapas **inga Stripe-priser**. Beloppen räknas fram
 * per kund i vår backend och skickas som `price_data` i kassan; ett låst
 * Stripe-pris hade blivit ett dött objekt vid varje omprissättning.
 * `stripe_price_id` förblir NULL med flit.
 *
 * Körningen är omkörningsbar: en produkt som redan finns uppdateras.
 *
 * Torrkörning: node scripts/push-stripe-franzen.mjs
 * Skriv:       node scripts/push-stripe-franzen.mjs --apply
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
  try {
    process.loadEnvFile(resolve(here, '../.env.local'));
  } catch {
    // Variablerna kan redan vara satta av anroparen.
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');

const SUPPLIER = 'Franzén Textil i Kinna';
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT p.handle, p.title, p.stripe_product_id, p.active AS product_active,
         v.sku, v.active AS variant_active
  FROM products p
  JOIN product_variants v ON v.product_id = p.id
  WHERE p.supplier = ${SUPPLIER} AND p.active AND v.active
  ORDER BY p.handle, v.position, v.sku`;

if (!rows.length) {
  console.log('Inga aktiva Franzén-varianter. Aktivera varianterna först — ett Stripe-objekt för');
  console.log('en produkt ingen kan köpa fyller ingen funktion.');
  process.exit(0);
}

const byHandle = new Map();
for (const row of rows) {
  if (!byHandle.has(row.handle)) byHandle.set(row.handle, []);
  byHandle.get(row.handle).push(row);
}

// Varianter som ligger kvar som inaktiva under en produkt vi ändå pushar.
const held = await sql`
  SELECT p.handle, v.sku FROM products p
    JOIN product_variants v ON v.product_id = p.id
   WHERE p.supplier = ${SUPPLIER} AND NOT v.active
   ORDER BY p.handle, v.sku`;

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  products: byHandle.size,
  variants: rows.length,
  alreadyLinked: [...byHandle].filter(([, v]) => v[0].stripe_product_id).map(([h]) => h),
  toCreate: [...byHandle].filter(([, v]) => !v[0].stripe_product_id).map(([h]) => h),
  inactiveVariantsSkipped: held.map(r => r.sku),
}, null, 2));

if (!apply) {
  console.log('\nTorrkörning. Inget skrevs till Stripe eller databasen.');
  process.exit(0);
}

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY krävs för --apply.');
const stripeKey = process.env.STRIPE_SECRET_KEY;
console.log(
  stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')
    ? 'Använder en LIVE-nyckel för Stripe.'
    : 'Använder en test-/sandbox-nyckel för Stripe.'
);

function formEncode(payload, prefix = '') {
  return Object.entries(payload).flatMap(([key, value]) => {
    if (value === undefined || value === null) return [];
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') return formEncode(value, name);
    return [`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`];
  }).join('&');
}

async function stripeRequest(method, path, payload) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload ? formEncode(payload) : undefined,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe ${method} ${path} (${response.status}): ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return body;
}

const stripeProductId = handle => `linnevik_${handle.replace(/[^a-zA-Z0-9]+/g, '_')}`;

let created = 0;
let updated = 0;
for (const [handle, variants] of byHandle) {
  const productId = stripeProductId(handle);
  const payload = {
    name: variants[0].title,
    // Fysiska varor: Stripe ska kräva leveransadress i kassan.
    shippable: 'true',
    metadata: {
      linnevik_handle: handle,
      linnevik_skus: variants.map(v => v.sku).join(','),
      linnevik_supplier: SUPPLIER,
    },
  };
  let product;
  try {
    await stripeRequest('GET', `/products/${productId}`);
    product = await stripeRequest('POST', `/products/${productId}`, payload);
    updated++;
  } catch {
    product = await stripeRequest('POST', '/products', { id: productId, ...payload });
    created++;
  }
  await sql`UPDATE products SET stripe_product_id = ${product.id}, updated_at = now()
             WHERE handle = ${handle}`;
}

console.log(JSON.stringify({ createdProducts: created, updatedProducts: updated }, null, 2));
