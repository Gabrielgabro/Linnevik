/**
 * Skapa Stripe-produkter och -priser ur vår egen katalog, och skriv tillbaka
 * ID:na till Neon.
 *
 * Torrkörning (standard): npm run catalog:stripe
 * Skriv till Stripe:      npm run catalog:stripe -- --apply
 *
 * Omfattningen är medvetet smal: bara de produkter vi faktiskt har i lager,
 * alltså de som landed-cost-analysen i /admin bygger på. Resten av katalogen
 * ligger kvar i databasen men får inga Stripe-objekt.
 *
 * Inga Stripe-priser skapas. Beloppen är dynamiska och räknas fram per kund i
 * vår egen backend, så de skickas in som `price_data` när kassan skapas.
 * Ett Stripe-pris går inte att ändra i belopp — hade vi låst 20 stycken här
 * hade varje omprissättning lämnat ett dött prisobjekt efter sig, och Neon och
 * Stripe hade glidit isär. `stripe_price_id` förblir NULL med flit.
 *
 * Körningen är omkörningsbar: produkter får ett deterministiskt Stripe-ID.
 */
import { readFileSync } from 'node:fs';
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

// Lagerförda produkter = raderna i landed-cost-analysen. Listan läses ur den
// genererade filen i stället för att skrivas av här, så att den inte kan glida
// isär från vad /admin räknar på.
const landedCostSource = readFileSync(resolve(here, '../src/data/landedCost.ts'), 'utf8');
const inventoryHandles = [...landedCostSource.matchAll(/"handle":\s*"([^"]+)"/g)].map(match => match[1]);
if (!inventoryHandles.length) {
  throw new Error('Could not read any handles from src/data/landedCost.ts.');
}

const landedPerPcs = new Map(
  [...landedCostSource.matchAll(
    /"handle":\s*"([^"]+)"[\s\S]*?"goodsPerPcs":\s*([\d.]+),\s*"freightPerPcs":\s*([\d.]+),\s*"dutyPerPcs":\s*([\d.]+)/g
  )].map(match => [match[1], Number(match[2]) + Number(match[3]) + Number(match[4])])
);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT p.id AS product_id, p.handle, p.title, p.stripe_product_id,
         v.id AS variant_id, v.sku, v.option_values, v.price_minor, v.currency,
         v.stripe_price_id, v.stripe_lookup_key
  FROM products p
  JOIN product_variants v ON v.product_id = p.id
  WHERE p.handle = ANY(${inventoryHandles})
    AND p.active AND v.active
  ORDER BY p.handle, v.sku
`;

const missingHandles = inventoryHandles.filter(handle => !rows.some(row => row.handle === handle));
if (missingHandles.length) {
  throw new Error(`These landed-cost products are not in the catalog: ${missingHandles.join(', ')}. Run npm run catalog:import first.`);
}

// Listpriserna är momsinklusive (svensk B2C-prissättning). Inget av detta
// skrivs till Stripe — det rapporteras bara, som en varning om att katalogen
// säljer med förlust innan kassan börjar räkna på den.
const VAT_RATE = 1.25;
const belowCost = rows.filter(row => {
  const landed = landedPerPcs.get(row.handle);
  return landed !== undefined && row.price_minor / 100 / VAT_RATE < landed;
});

const summary = {
  mode: apply ? 'apply' : 'dry-run',
  handles: inventoryHandles,
  products: new Set(rows.map(row => row.handle)).size,
  variants: rows.length,
  alreadyLinked: new Set(rows.filter(row => row.stripe_product_id).map(row => row.handle)).size,
  belowLandedCost: belowCost.map(row => row.sku),
};
console.log(JSON.stringify(summary, null, 2));

if (belowCost.length) {
  console.warn(`\nWarning: ${belowCost.length} variants have a list price below landed cost.`);
  console.warn('No prices are written to Stripe, so this is not blocking — but checkout will sell at a loss.');
}

if (!apply) {
  console.log('Dry-run only. Nothing was written to Stripe or the database.');
  process.exit(0);
}

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required for --apply.');
const stripeKey = process.env.STRIPE_SECRET_KEY;
console.log(stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_')
  ? 'Using a LIVE Stripe key.'
  : 'Using a test/sandbox Stripe key.');

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
    const message = body?.error?.message ?? JSON.stringify(body);
    throw new Error(`Stripe ${method} ${path} failed (${response.status}): ${message}`);
  }
  return body;
}

function stripeProductId(handle) {
  return `linnevik_${handle.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

const byHandle = new Map();
for (const row of rows) {
  if (!byHandle.has(row.handle)) byHandle.set(row.handle, []);
  byHandle.get(row.handle).push(row);
}

let createdProducts = 0;
let updatedProducts = 0;

for (const [handle, variants] of byHandle) {
  const productId = stripeProductId(handle);
  // Varukoden styr momssatsen i Stripe Tax. Sängkläder är vanliga varor, så
  // kontots standardkod duger — den sätts på kontonivå, inte här.
  const payload = {
    name: variants[0].title,
    // Fysiska varor: Stripe ska kräva leveransadress i kassan.
    shippable: 'true',
    metadata: {
      linnevik_handle: handle,
      linnevik_skus: variants.map(variant => variant.sku).join(','),
    },
  };

  let product;
  try {
    await stripeRequest('GET', `/products/${productId}`);
    product = await stripeRequest('POST', `/products/${productId}`, payload);
    updatedProducts++;
  } catch {
    product = await stripeRequest('POST', '/products', { id: productId, ...payload });
    createdProducts++;
  }

  await sql`
    UPDATE products SET stripe_product_id = ${product.id}, updated_at = now()
    WHERE handle = ${handle}
  `;
}

console.log(JSON.stringify({
  createdProducts,
  updatedProducts,
  linkedProducts: byHandle.size,
  note: 'No Stripe prices created. Amounts are sent as price_data at checkout.',
}, null, 2));
