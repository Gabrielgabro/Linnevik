/**
 * Reparerar `product_variants.option_values` från Shopify.
 *
 * Den ursprungliga importen skrev bara optionsnamnen på produktens första
 * variant — resten fick `{"name": "", "value": "..."}` — och värdena hade
 * slugifierats på vägen ("gratt" i stället för "Grått"). Så länge produktsidan
 * läste Shopify spelade det ingen roll; kolumnen användes bara av korgens
 * radrubrik och av admin. När produktsidan går över till vår egen katalog blir
 * den i stället det som variantväljaren matchar på (`ProductForm` letar upp
 * varianten via `selectedOptions.every(...)`), och ett tomt namn matchar inget.
 *
 * Nyckeln är `shopify_variant_id`, inte SKU eller position: den är unik, den
 * finns på alla 55 varianter, och den överlever att en variant döps om.
 *
 * Torrkörning: node scripts/repair-variant-options.mjs
 * Skriv:      node scripts/repair-variant-options.mjs --apply
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

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-07';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');
if (!domain || !token) {
  throw new Error('SHOPIFY_STORE_DOMAIN och SHOPIFY_STOREFRONT_TOKEN krävs.');
}

const sql = neon(process.env.DATABASE_URL);

const QUERY = `query VariantOptions($cursor: String, $language: LanguageCode!)
@inContext(language: $language) {
  products(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      handle
      variants(first: 250) { nodes { id selectedOptions { name value } } }
    }
  }
}`;

async function storefront(variables) {
  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(
      `Shopify-frågan misslyckades (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`
    );
  }
  return payload.data;
}

const shopifyVariants = new Map();
let cursor = null;
do {
  const data = await storefront({ cursor, language: 'SV' });
  for (const product of data.products.nodes) {
    for (const variant of product.variants.nodes) {
      shopifyVariants.set(variant.id, {
        handle: product.handle,
        options: variant.selectedOptions.map(option => ({
          name: option.name,
          value: option.value,
        })),
      });
    }
  }
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (cursor);

const rows = await sql`
  select v.id, v.sku, v.shopify_variant_id, v.option_values, p.handle
    from product_variants v
    join products p on p.id = v.product_id
   order by p.handle, v.id`;

let changed = 0;
let unchanged = 0;
const warnings = [];

for (const row of rows) {
  if (!row.shopify_variant_id) {
    warnings.push(`${row.sku}: saknar shopify_variant_id — hoppas över`);
    continue;
  }
  const source = shopifyVariants.get(row.shopify_variant_id);
  if (!source) {
    warnings.push(`${row.sku}: ${row.shopify_variant_id} finns inte kvar i Shopify`);
    continue;
  }

  const current = JSON.stringify(row.option_values ?? []);
  const next = JSON.stringify(source.options);
  if (current === next) {
    unchanged += 1;
    continue;
  }

  changed += 1;
  console.log(`${row.handle.padEnd(20)} ${row.sku.padEnd(22)} ${current} -> ${next}`);
  if (!apply) continue;

  await sql`
    update product_variants
       set option_values = ${next}::jsonb, updated_at = now()
     where id = ${row.id}`;
}

console.log(
  `\n${rows.length} varianter genomgångna: ${changed} ${apply ? 'skrivna' : 'att skriva'}, ` +
    `${unchanged} redan rätt.`
);
if (warnings.length) {
  console.log('\nLuckor att kontrollera:');
  for (const warning of warnings) console.log(`  - ${warning}`);
}
if (!apply) console.log('\nKör om med --apply för att skriva.');
