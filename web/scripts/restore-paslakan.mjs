/**
 * One-off repair for the product `paslakan`.
 *
 * A partial PATCH from the admin category panel nulled title_en,
 * description_html, description_html_en and vendor on 2026-08-15 (see
 * parseProductInput, which returned null for fields the request never sent).
 * This restores those four columns from Shopify — the same source the initial
 * catalog import used — and sets the primary category link the panel failed to
 * mark. Nothing else on the row is touched.
 *
 * Dry run: node scripts/restore-paslakan.mjs
 * Apply:   node scripts/restore-paslakan.mjs --apply
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
try {
  process.loadEnvFile(resolve(here, '../.env.local'));
} catch {
  // CI and production can provide variables directly.
}

const HANDLE = 'paslakan';
const PRIMARY_COLLECTION_HANDLE = 'sangklader';

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-07';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');
if (!domain || !token) {
  throw new Error('SHOPIFY_STORE_DOMAIN och SHOPIFY_STOREFRONT_TOKEN krävs.');
}

const sql = neon(process.env.DATABASE_URL);

const QUERY = `query RestoreProduct($handle: String!, $language: LanguageCode!)
@inContext(language: $language) {
  product(handle: $handle) {
    id handle title descriptionHtml vendor productType tags
    seo { title description }
  }
}`;

async function storefront(language) {
  const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query: QUERY, variables: { handle: HANDLE, language } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(
      `Shopify-frågan misslyckades (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`
    );
  }
  return payload.data.product;
}

const [sv, en] = await Promise.all([storefront('SV'), storefront('EN')]);
if (!sv) throw new Error(`${HANDLE} finns inte i Shopify.`);

const [before] = await sql`
  select id, title, title_en, description_html, description_html_en, vendor,
         product_type, seo_title, seo_title_en, seo_description, seo_description_en
  from products where handle = ${HANDLE}`;
if (!before) throw new Error(`${HANDLE} finns inte i Neon.`);

// Samma kolumner och samma källa som catalog:migrate skriver, så att raden
// hamnar exakt där importen hade lämnat den.
const restored = {
  title_en: en?.title ?? sv.title,
  description_html: sv.descriptionHtml || null,
  description_html_en: en?.descriptionHtml || null,
  vendor: sv.vendor || null,
  product_type: sv.productType || null,
  seo_title: sv.seo?.title || null,
  seo_description: sv.seo?.description || null,
  seo_title_en: en?.seo?.title || null,
  seo_description_en: en?.seo?.description || null,
};

console.log(`${apply ? 'Skriver på riktigt' : 'Torrkörning'} — produkt ${before.id} (${HANDLE})\n`);
for (const [column, value] of Object.entries(restored)) {
  const now = before[column];
  const show = text => (text === null ? '(null)' : `${String(text).slice(0, 70)}…`);
  console.log(`  ${column}\n    nu:  ${show(now)}\n    blir: ${show(value)}`);
}

const [primary] = await sql`
  select c.id, c.title_sv, pc.is_primary
  from collections c
  left join product_collections pc
    on pc.collection_id = c.id and pc.product_id = ${before.id}
  where c.handle = ${PRIMARY_COLLECTION_HANDLE}`;
if (!primary) throw new Error(`Kategorin ${PRIMARY_COLLECTION_HANDLE} finns inte.`);
console.log(
  `\n  primär kategori\n    nu:  ${primary.is_primary === null ? '(ingen koppling)' : primary.is_primary}` +
    `\n    blir: true (${primary.title_sv})`
);

if (!apply) {
  console.log('\nInget skrevs. Kör om med --apply.');
  process.exit(0);
}

await sql`
  update products set
    title_en = ${restored.title_en},
    description_html = ${restored.description_html},
    description_html_en = ${restored.description_html_en},
    vendor = ${restored.vendor},
    product_type = ${restored.product_type},
    seo_title = ${restored.seo_title},
    seo_description = ${restored.seo_description},
    seo_title_en = ${restored.seo_title_en},
    seo_description_en = ${restored.seo_description_en},
    updated_at = now()
  where id = ${before.id}`;

// Kopplingen finns redan men utan märket. insert ... on conflict täcker båda
// fallen, så skriptet går att köra om.
await sql`
  insert into product_collections (product_id, collection_id, is_primary, position)
  values (${before.id}, ${primary.id}, true, 0)
  on conflict (product_id, collection_id) do update set is_primary = true`;

console.log('\nKlart.');
