/**
 * Spegla Shopifys kategorier och produktkopplingar till vår egen katalog.
 *
 * Torrkörning (standard): npm run catalog:collections
 * Skriv till Neon:        npm run catalog:collections -- --apply
 *
 * Titlarna hämtas en gång per språk (@inContext) så att brödsmulorna kan
 * renderas på svenska och engelska utan att fråga Shopify. Hierarkin (parent_id)
 * sätts inte här — Shopify har inga nästlade kategorier. Den redigeras i
 * databasen och skrivs aldrig över av den här synkningen.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');

if (!process.env.SHOPIFY_STORE_DOMAIN || !process.env.SHOPIFY_STOREFRONT_TOKEN || !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(here, '../.env.local'));
  } catch {
    // Variablerna kan redan vara satta av anroparen.
  }
}

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
if (!domain || !token) throw new Error('SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN are required.');

const QUERY = `query Collections($cursor: String, $language: LanguageCode!) @inContext(language: $language) {
  collections(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title
      products(first: 250) { nodes { id handle } }
    }
  }
}`;

async function fetchCollections(language) {
  const nodes = [];
  let cursor = null;

  do {
    const response = await fetch(`https://${domain}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query: QUERY, variables: { cursor, language } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors) {
      throw new Error(`Shopify collection query failed (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`);
    }
    nodes.push(...payload.data.collections.nodes);
    cursor = payload.data.collections.pageInfo.hasNextPage
      ? payload.data.collections.pageInfo.endCursor
      : null;
  } while (cursor);

  return nodes;
}

const [swedish, english] = await Promise.all([fetchCollections('SV'), fetchCollections('EN')]);
const englishTitles = new Map(english.map(collection => [collection.id, collection.title]));

const errors = [];
const staged = swedish.map((collection, index) => ({
  shopifyCollectionId: collection.id,
  handle: collection.handle,
  titleSv: collection.title,
  titleEn: englishTitles.get(collection.id) ?? collection.title,
  position: index,
  products: collection.products.nodes.map(product => product.id),
}));

for (const collection of staged) {
  if (!englishTitles.has(collection.shopifyCollectionId)) {
    errors.push(`Collection ${collection.handle} has no English title; Swedish will be used for both.`);
  }
}

// Vilken kategori som blir primär avgörs av ordningen ovan (Shopify sorterat på
// titel). Det är godtyckligt men stabilt — och kan ändras i databasen efteråt
// utan att synkningen skriver tillbaka över redigeringen.
const primaryByProduct = new Map();
for (const collection of staged) {
  for (const productId of collection.products) {
    if (!primaryByProduct.has(productId)) primaryByProduct.set(productId, collection.shopifyCollectionId);
  }
}

const links = staged.flatMap(collection =>
  collection.products.map((productId, position) => ({
    productId,
    collectionId: collection.shopifyCollectionId,
    isPrimary: primaryByProduct.get(productId) === collection.shopifyCollectionId,
    position,
  }))
);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  collections: staged.length,
  links: links.length,
  productsWithPrimary: primaryByProduct.size,
  warnings: errors,
}, null, 2));

if (!apply) {
  console.log('Dry-run only. No database changes were made.');
  process.exit(0);
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --apply.');

const sql = neon(process.env.DATABASE_URL);
const syncedAt = new Date();

// Produkterna måste redan finnas — katalogen är källan, inte den här synkningen.
const knownProducts = new Set(
  (await sql`SELECT shopify_product_id FROM products`).map(row => row.shopify_product_id)
);
const orphanLinks = links.filter(link => !knownProducts.has(link.productId));
if (orphanLinks.length) {
  console.error(`${orphanLinks.length} links reference products that are not imported. Run npm run catalog:import first.`);
  process.exit(1);
}

for (const collection of staged) {
  await sql`
    INSERT INTO collections (shopify_collection_id, handle, title_sv, title_en, position, source_synced_at, updated_at)
    VALUES (${collection.shopifyCollectionId}, ${collection.handle}, ${collection.titleSv},
      ${collection.titleEn}, ${collection.position}, ${syncedAt}, now())
    ON CONFLICT (shopify_collection_id) DO UPDATE SET
      handle = excluded.handle,
      title_sv = excluded.title_sv,
      title_en = excluded.title_en,
      position = excluded.position,
      source_synced_at = excluded.source_synced_at,
      updated_at = now()
  `;
}

// Kopplingarna byggs om från Shopify varje körning: en produkt som tagits ur en
// kategori ska försvinna ur brödsmulan, inte ligga kvar.
await sql`DELETE FROM product_collections`;

for (const link of links) {
  await sql`
    INSERT INTO product_collections (product_id, collection_id, is_primary, position)
    SELECT p.id, c.id, ${link.isPrimary}, ${link.position}
    FROM products p, collections c
    WHERE p.shopify_product_id = ${link.productId}
      AND c.shopify_collection_id = ${link.collectionId}
    ON CONFLICT (product_id, collection_id) DO UPDATE SET
      is_primary = excluded.is_primary,
      position = excluded.position
  `;
}

console.log(`Synced ${staged.length} collections and ${links.length} product links.`);
