/**
 * Copy the current public Shopify catalog into the owned Neon/Blob backend.
 *
 * Dry run: npm run catalog:migrate
 * Apply:   npm run catalog:migrate -- --apply
 *
 * This is an explicit import, not a live application dependency. It is safe
 * to rerun: source URLs identify imported images and owned/admin images remain.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');
try {
  process.loadEnvFile(resolve(here, '../.env.local'));
} catch {
  // CI and production can provide variables directly.
}

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-07';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');
if (!domain || !token) {
  throw new Error('SHOPIFY_STORE_DOMAIN och SHOPIFY_STOREFRONT_TOKEN krävs.');
}
if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error('BLOB_READ_WRITE_TOKEN krävs för att kopiera bilder.');
}

const sql = neon(process.env.DATABASE_URL);
const endpoint = `https://${domain}/api/${apiVersion}/graphql.json`;

async function storefront(query, variables) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(
      `Shopify-frågan misslyckades (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`
    );
  }
  return payload.data;
}

const PRODUCTS_QUERY = `query CatalogProducts($cursor: String, $language: LanguageCode!)
@inContext(language: $language) {
  products(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title descriptionHtml productType vendor tags updatedAt
      seo { title description }
      images(first: 250) { nodes { url altText width height } }
    }
  }
}`;

const COLLECTIONS_QUERY = `query CatalogCollections($cursor: String, $language: LanguageCode!)
@inContext(language: $language) {
  collections(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title descriptionHtml updatedAt
      seo { title description }
      image { url altText width height }
      products(first: 250) { nodes { handle } }
    }
  }
}`;

async function fetchConnection(query, root, language) {
  const nodes = [];
  let cursor = null;
  do {
    const data = await storefront(query, { cursor, language });
    nodes.push(...data[root].nodes);
    cursor = data[root].pageInfo.hasNextPage ? data[root].pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

function byHandle(nodes) {
  return new Map(nodes.map(node => [node.handle, node]));
}

function cleanSource(url) {
  return url ? url.split('?')[0] : null;
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

async function copyImage(sourceUrl, pathname) {
  const source = cleanSource(sourceUrl);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Kunde inte hämta ${source} (${response.status})`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0];
  const extension = EXTENSIONS[contentType] ?? source.split('.').pop()?.slice(0, 5) ?? 'jpg';
  const body = Buffer.from(await response.arrayBuffer());
  const blob = await put(`${pathname}.${extension}`, body, {
    access: 'public',
    contentType: contentType || 'image/jpeg',
    addRandomSuffix: true,
  });
  return { url: blob.url, pathname: blob.pathname, bytes: body.length };
}

const [productsSv, productsEn, collectionsSv, collectionsEn] = await Promise.all([
  fetchConnection(PRODUCTS_QUERY, 'products', 'SV'),
  fetchConnection(PRODUCTS_QUERY, 'products', 'EN'),
  fetchConnection(COLLECTIONS_QUERY, 'collections', 'SV'),
  fetchConnection(COLLECTIONS_QUERY, 'collections', 'EN'),
]);
const productEnByHandle = byHandle(productsEn);
const collectionEnByHandle = byHandle(collectionsEn);
const dbProducts = await sql`select id, handle from products order by handle`;
const dbProductByHandle = new Map(dbProducts.map(row => [row.handle, row]));
const existingImages = await sql`
  select id, product_id, source_url, position
  from product_images order by product_id, position, id`;
const imagesByProduct = new Map();
for (const image of existingImages) {
  const list = imagesByProduct.get(image.product_id) ?? [];
  list.push(image);
  imagesByProduct.set(image.product_id, list);
}

console.log(
  `${apply ? 'Skriver på riktigt' : 'Torrkörning'} från Shopify Storefront ${apiVersion}.\n` +
    `${productsSv.length} produkter och ${collectionsSv.length} kategorier hittades.\n`
);

let copiedImages = 0;
let copiedBytes = 0;
const warnings = [];

for (const product of productsSv) {
  const dbProduct = dbProductByHandle.get(product.handle);
  const en = productEnByHandle.get(product.handle);
  if (!dbProduct) {
    warnings.push(`${product.handle}: finns i Shopify men inte i Neon`);
    continue;
  }
  if (!en) warnings.push(`${product.handle}: engelsk Storefront-version saknas`);
  console.log(
    `${product.handle} — ${product.images.nodes.length} bilder, ` +
      `${product.descriptionHtml ? 'sv-text' : 'ingen sv-text'}, ` +
      `${en?.descriptionHtml ? 'en-text' : 'ingen en-text'}`
  );
  if (!apply) continue;

  await sql`
    update products set
      shopify_product_id = ${product.id}, title = ${product.title},
      title_en = ${en?.title ?? product.title},
      description_html = ${product.descriptionHtml || null},
      description_html_en = ${en?.descriptionHtml || null},
      tags = ${product.tags}::text[], product_type = ${product.productType || null},
      vendor = ${product.vendor || null}, seo_title = ${product.seo?.title || null},
      seo_description = ${product.seo?.description || null},
      seo_title_en = ${en?.seo?.title || null},
      seo_description_en = ${en?.seo?.description || null},
      shopify_updated_at = ${product.updatedAt},
      status = 'active', active = true, published_at = coalesce(published_at, now()),
      source_synced_at = now(), updated_at = now()
    where id = ${dbProduct.id}`;

  const ownedImages = imagesByProduct.get(dbProduct.id) ?? [];
  for (const [position, image] of product.images.nodes.entries()) {
    const source = cleanSource(image.url);
    let existing = ownedImages.find(candidate => cleanSource(candidate.source_url) === source);
    // First-run images predate source_url; associate them by stable position.
    if (!existing) {
      existing = ownedImages.find(
        candidate => candidate.source_url === null && candidate.position === position
      );
    }
    if (existing) {
      await sql`update product_images set
        source_url = ${source}, alt_text = ${image.altText}, width = ${image.width},
        height = ${image.height}, position = ${position} where id = ${existing.id}`;
      continue;
    }
    try {
      const blob = await copyImage(source, `products/${dbProduct.id}/${position}`);
      await sql`insert into product_images
        (product_id, url, blob_pathname, source_url, alt_text, width, height, position)
        values (${dbProduct.id}, ${blob.url}, ${blob.pathname}, ${source},
                ${image.altText}, ${image.width}, ${image.height}, ${position})
        on conflict (product_id, source_url) where source_url is not null do update set
          alt_text = excluded.alt_text, width = excluded.width,
          height = excluded.height, position = excluded.position`;
      copiedImages += 1;
      copiedBytes += blob.bytes;
    } catch (error) {
      warnings.push(`${product.handle}: ${source} kunde inte kopieras (${error.message})`);
    }
  }
}

const primaryByProduct = new Set();
for (const [position, collection] of collectionsSv.entries()) {
  const en = collectionEnByHandle.get(collection.handle);
  const source = cleanSource(collection.image?.url);
  console.log(
    `${collection.handle} — ${collection.products.nodes.length} produkter, ` +
      `${collection.descriptionHtml ? 'sv-text' : 'ingen sv-text'}, ${source ? 'bild' : 'ingen bild'}`
  );
  if (!apply) continue;

  // Slås upp på Shopifys id av samma skäl som upserten nedan: handlen kan ha
  // döpts om här, och med handlen som nyckel hade bilden kopierats på nytt vid
  // varje körning.
  const [current] = await sql`
    select id, image_source_url from collections
     where shopify_collection_id = ${collection.id} limit 1`;
  let image = null;
  if (source && cleanSource(current?.image_source_url) !== source) {
    try {
      image = await copyImage(source, `collections/${collection.handle}/cover`);
      copiedImages += 1;
      copiedBytes += image.bytes;
    } catch (error) {
      warnings.push(`${collection.handle}: kategoribilden kunde inte kopieras (${error.message})`);
    }
  }

  const [row] = await sql`
    insert into collections (
      shopify_collection_id, handle, title_sv, title_en,
      description_html, description_html_en,
      seo_title, seo_title_en, seo_description, seo_description_en,
      image_url, image_blob_pathname, image_source_url, image_alt_text,
      image_width, image_height, shopify_updated_at, source_synced_at, position
    ) values (
      ${collection.id}, ${collection.handle}, ${collection.title}, ${en?.title ?? collection.title},
      ${collection.descriptionHtml || null}, ${en?.descriptionHtml || null},
      ${collection.seo?.title || null}, ${en?.seo?.title || null},
      ${collection.seo?.description || null}, ${en?.seo?.description || null},
      ${image?.url ?? null}, ${image?.pathname ?? null}, ${source}, ${collection.image?.altText ?? null},
      ${collection.image?.width ?? null}, ${collection.image?.height ?? null},
      ${collection.updatedAt}, now(), ${position}
    )
    -- Nyckeln är Shopifys id, inte handlen. Handlen är vår adress på sajten
    -- och kan ha döpts om här (se 0012, madrasskydd -> badrum); med
    -- handlen som nyckel hade en omkörning skapat en dubblett i stället för
    -- att hitta raden den redan har. Därför skrivs handlen heller inte över.
    on conflict (shopify_collection_id) where shopify_collection_id is not null
    do update set
      title_sv = excluded.title_sv,
      description_html = excluded.description_html,
      -- Shopify har ingen engelsk översättning av kategorierna, så en EN-fråga
      -- svarar med den svenska texten. Att skriva över en engelska vi själva
      -- fyllt i vore att återinföra felet 0012 rättade. Tom kolumn fylls, ifylld
      -- lämnas.
      title_en = coalesce(collections.title_en, excluded.title_en),
      description_html_en = coalesce(collections.description_html_en, excluded.description_html_en),
      seo_title = excluded.seo_title,
      seo_title_en = coalesce(collections.seo_title_en, excluded.seo_title_en),
      seo_description = excluded.seo_description,
      seo_description_en = coalesce(collections.seo_description_en, excluded.seo_description_en),
      image_url = coalesce(excluded.image_url, collections.image_url),
      image_blob_pathname = coalesce(excluded.image_blob_pathname, collections.image_blob_pathname),
      image_source_url = coalesce(excluded.image_source_url, collections.image_source_url),
      image_alt_text = excluded.image_alt_text,
      image_width = excluded.image_width, image_height = excluded.image_height,
      shopify_updated_at = excluded.shopify_updated_at,
      source_synced_at = now(), updated_at = now()
    returning id`;

  for (const member of collection.products.nodes) {
    const dbProduct = dbProductByHandle.get(member.handle);
    if (!dbProduct) continue;
    const isPrimary = !primaryByProduct.has(member.handle);
    if (isPrimary) primaryByProduct.add(member.handle);
    await sql`insert into product_collections (product_id, collection_id, is_primary, position)
      values (${dbProduct.id}, ${row.id}, ${isPrimary}, ${position})
      on conflict (product_id, collection_id) do update set position = excluded.position`;
  }
}

console.log(
  `\n${productsSv.length} produkter och ${collectionsSv.length} kategorier genomgångna. ` +
    `${copiedImages} nya bilder kopierade (${(copiedBytes / 1024 / 1024).toFixed(1)} MB).`
);
if (warnings.length) {
  console.log('\nLuckor att kontrollera:');
  for (const warning of warnings) console.log(`  - ${warning}`);
}
if (!apply) console.log('\nKör om med --apply för att skriva.');
