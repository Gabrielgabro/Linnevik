/**
 * Flytta hem produktinnehållet från Shopify. En gång, sedan aldrig mer.
 *
 * Torrkörning (standard): npm run catalog:migrate
 * Skriv på riktigt:       npm run catalog:migrate -- --apply
 *
 * Det här är inte en synkning. Efter den här körningen äger Neon texterna,
 * taggarna och bilderna, importskripten är borttagna, och /admin är där
 * katalogen redigeras. Skriptet är skrivet för att köras en gång och sedan
 * raderas — det finns ingen mening med att underhålla det.
 *
 * Bilderna laddas ner från cdn.shopify.com och upp i Vercel Blob. Det är
 * själva poängen: en bild-URL som pekar på Shopify gör butiken omöjlig att
 * stänga, hur mycket text vi än kopierat.
 *
 * Kör efter att drizzle/0004_catalog_content.sql är applicerad.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes('--apply');

if (!process.env.DATABASE_URL || !process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    process.loadEnvFile(resolve(here, '../.env.local'));
  } catch {
    // Variablerna kan redan vara satta av anroparen.
  }
}

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
const sql = neon(process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL krävs.');
if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error('BLOB_READ_WRITE_TOKEN krävs för att kunna flytta bilderna.');
}

// --- CSV ---------------------------------------------------------------
// Samma parser som stage-shopify-catalog.mjs. Kopierad med flit: det skriptet
// tas bort i samma ändring, och den här filen ska kunna stå för sig själv.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows.filter(candidate => candidate.some(value => value !== ''));
  return body.map(values =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  );
}

const exportPath = resolve(
  here,
  '../../catalog/shopify/latest_export/products_export_1_order_descriptions.csv'
);
const csvRows = parseCsv(readFileSync(exportPath, 'utf8'));

/**
 * Shopifys export har en rad per variant *och* per bild. Produktfälten står
 * bara på den första raden för varje handle; bildraderna har bara Image Src.
 */
const byHandle = new Map();
for (const row of csvRows) {
  const handle = row.Handle?.trim();
  if (!handle) continue;

  if (!byHandle.has(handle)) {
    byHandle.set(handle, { handle, content: null, images: [] });
  }
  const entry = byHandle.get(handle);

  if (!entry.content && row.Title?.trim()) {
    entry.content = {
      title: row.Title.trim(),
      descriptionHtml: row['Body (HTML)']?.trim() || null,
      vendor: row.Vendor?.trim() || null,
      productType: row.Type?.trim() || null,
      seoTitle: row['SEO Title']?.trim() || null,
      seoDescription: row['SEO Description']?.trim() || null,
      tags: (row.Tags ?? '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
    };
  }

  const src = row['Image Src']?.trim();
  if (src && !entry.images.some(image => image.src === src)) {
    entry.images.push({
      src,
      alt: row['Image Alt Text']?.trim() || null,
      position: Number(row['Image Position']) || entry.images.length + 1,
    });
  }
}

// --- Engelska ----------------------------------------------------------
// Enda stället engelskan finns är Shopify, bakom @inContext. Efter att butiken
// stängts går den inte att få tag på igen, så den hämtas nu.
const EN_QUERY = `query Products($cursor: String) @inContext(language: EN) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { handle title descriptionHtml }
  }
}`;

async function fetchEnglish() {
  if (!domain || !token) {
    console.warn(
      '! SHOPIFY_STORE_DOMAIN/SHOPIFY_STOREFRONT_TOKEN saknas — engelskan hämtas inte.\n' +
        '  Kör inte skarpt utan dem: den engelska texten finns ingen annanstans.'
    );
    return new Map();
  }

  const out = new Map();
  let cursor = null;
  do {
    const response = await fetch(`https://${domain}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query: EN_QUERY, variables: { cursor } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors) {
      throw new Error(
        `Shopify-frågan misslyckades (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`
      );
    }
    for (const node of payload.data.products.nodes) {
      out.set(node.handle, { title: node.title, descriptionHtml: node.descriptionHtml });
    }
    cursor = payload.data.products.pageInfo.hasNextPage
      ? payload.data.products.pageInfo.endCursor
      : null;
  } while (cursor);
  return out;
}

// --- Kategorier --------------------------------------------------------
// Kategorierna har aldrig importerats: tabellen är tom i produktion, och
// brödsmulorna faller därför tillbaka på Shopify vid varje sidvisning. De
// hämtas en gång per språk, precis som titlarna, och medlemskapen med dem —
// när butiken stängts finns det ingenstans att läsa dem ifrån.
//
// `parent_id` sätts inte: Shopify har inga nästlade kategorier. Hierarkin är
// vår egen och redigeras under /admin/collections.
const COLLECTION_QUERY = `query Collections($cursor: String, $language: LanguageCode!)
@inContext(language: $language) {
  collections(first: 100, after: $cursor, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title
      products(first: 250) { nodes { handle } }
    }
  }
}`;

async function fetchCollections(language) {
  if (!domain || !token) return [];
  const nodes = [];
  let cursor = null;
  do {
    const response = await fetch(`https://${domain}/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query: COLLECTION_QUERY, variables: { cursor, language } }),
    });
    const payload = await response.json();
    if (!response.ok || payload.errors) {
      throw new Error(
        `Shopify-kategorifrågan misslyckades (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`
      );
    }
    nodes.push(...payload.data.collections.nodes);
    cursor = payload.data.collections.pageInfo.hasNextPage
      ? payload.data.collections.pageInfo.endCursor
      : null;
  } while (cursor);
  return nodes;
}

async function migrateCollections(productIdByHandle) {
  const [sv, en] = await Promise.all([fetchCollections('SV'), fetchCollections('EN')]);
  if (!sv.length) {
    console.log('\nInga kategorier hämtade — bygg trädet för hand under /admin/collections.');
    return;
  }
  const titleEnById = new Map(en.map(node => [node.id, node.title]));

  console.log(`\n${sv.length} kategorier:`);
  // Primär kategori = den första i titelordning som innehåller produkten.
  // Godtyckligt men stabilt, och går att ändra i /admin efteråt.
  const primaryByProduct = new Map();

  for (const [position, node] of sv.entries()) {
    const memberships = node.products.nodes.map(product => product.handle);
    console.log(`  ${node.handle} — ${memberships.length} produkter`);
    if (!apply) continue;

    const [row] = await sql`
      insert into collections (shopify_collection_id, handle, title_sv, title_en, position)
      values (${node.id}, ${node.handle}, ${node.title},
              ${titleEnById.get(node.id) ?? node.title}, ${position})
      on conflict (handle) do update set
        title_sv = excluded.title_sv,
        title_en = excluded.title_en,
        updated_at = now()
      returning id`;

    for (const handle of memberships) {
      const productId = productIdByHandle.get(handle);
      if (!productId) continue;
      const isPrimary = !primaryByProduct.has(handle);
      if (isPrimary) primaryByProduct.set(handle, row.id);
      await sql`
        insert into product_collections (product_id, collection_id, is_primary, position)
        values (${productId}, ${row.id}, ${isPrimary}, ${position})
        on conflict (product_id, collection_id) do nothing`;
    }
  }
}

// --- Bilder ------------------------------------------------------------
const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

async function moveImage(productId, image, index) {
  // Shopifys URL:er bär querystring för storlek. Vi vill ha originalet.
  const source = image.src.split('?')[0];
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Kunde inte hämta ${source} (${response.status})`);

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0];
  const extension = EXTENSIONS[contentType] ?? source.split('.').pop()?.slice(0, 5) ?? 'jpg';
  const body = Buffer.from(await response.arrayBuffer());

  const blob = await put(`products/${productId}/${index}.${extension}`, body, {
    access: 'public',
    contentType: contentType || 'image/jpeg',
    addRandomSuffix: true,
  });
  return { url: blob.url, pathname: blob.pathname, bytes: body.length };
}

// --- Körningen ---------------------------------------------------------
const english = await fetchEnglish();

const dbProducts = await sql`select id, handle, title from products order by handle`;
if (!dbProducts.length) throw new Error('Inga produkter i databasen. Kör migrationen först.');

const existingImages = await sql`select product_id, count(*)::int as count
  from product_images group by product_id`;
const imageCountByProduct = new Map(existingImages.map(row => [row.product_id, row.count]));

console.log(apply ? 'Skriver på riktigt.\n' : 'Torrkörning. Inget skrivs.\n');

let movedImages = 0;
let movedBytes = 0;
const missing = [];

for (const product of dbProducts) {
  const entry = byHandle.get(product.handle);
  const en = english.get(product.handle);
  const content = entry?.content ?? null;

  const gaps = [];
  if (!content) gaps.push('inget innehåll i CSV-exporten');
  if (!en) gaps.push('ingen engelsk text');
  if (!entry?.images.length) gaps.push('inga bilder');
  if (gaps.length) missing.push(`${product.handle}: ${gaps.join(', ')}`);

  console.log(
    `${product.handle} — ${content?.tags.length ?? 0} taggar, ${entry?.images.length ?? 0} bilder` +
      `${en ? '' : ', SAKNAR engelska'}`
  );

  if (!apply) continue;

  if (content || en) {
    await sql`
      update products set
        title_en             = coalesce(${en?.title ?? null}, title_en),
        description_html     = coalesce(${content?.descriptionHtml ?? null}, description_html),
        description_html_en  = coalesce(${en?.descriptionHtml ?? null}, description_html_en),
        tags                 = case when ${content ? content.tags.length : 0} > 0
                                 then ${content?.tags ?? []}::text[] else tags end,
        product_type         = coalesce(${content?.productType ?? null}, product_type),
        vendor               = coalesce(${content?.vendor ?? null}, vendor),
        seo_title            = coalesce(${content?.seoTitle ?? null}, seo_title),
        seo_description      = coalesce(${content?.seoDescription ?? null}, seo_description),
        updated_at           = now()
      where id = ${product.id}`;
  }

  // Bilder flyttas bara för produkter som inte redan har några, så att en
  // avbruten körning kan tas om utan att skapa dubbletter.
  if (imageCountByProduct.get(product.id)) {
    console.log('  (har redan bilder — hoppar över)');
    continue;
  }

  const ordered = [...(entry?.images ?? [])].sort((a, b) => a.position - b.position);
  for (const [index, image] of ordered.entries()) {
    try {
      const blob = await moveImage(product.id, image, index);
      await sql`insert into product_images (product_id, url, blob_pathname, alt_text, position)
        values (${product.id}, ${blob.url}, ${blob.pathname}, ${image.alt}, ${index})`;
      movedImages += 1;
      movedBytes += blob.bytes;
      console.log(`  ↳ ${blob.pathname}`);
    } catch (error) {
      // En bild som inte går att flytta ska inte stoppa resten — men den måste
      // synas i rapporten, annars saknas den tyst på sajten efteråt.
      missing.push(`${product.handle}: bilden ${image.src} kunde inte flyttas (${error.message})`);
      console.error(`  ! ${image.src}: ${error.message}`);
    }
  }
}

await migrateCollections(new Map(dbProducts.map(product => [product.handle, product.id])));

console.log(
  `\n${dbProducts.length} produkter genomgångna. ` +
    `${movedImages} bilder flyttade (${(movedBytes / 1024 / 1024).toFixed(1)} MB).`
);

if (missing.length) {
  console.log('\nLuckor att titta på innan produktsidan kopplas om till Neon:');
  for (const line of missing) console.log(`  - ${line}`);
}

if (apply) {
  const [{ count }] = await sql`select count(*)::int as count from product_images
    where url like '%shopify%'`;
  // Kontrollen som avgör om flytten faktiskt blev en flytt: en enda kvarvarande
  // Shopify-URL betyder att sajten fortfarande hänger ihop med butiken.
  console.log(
    count === 0
      ? '\nInga bild-URL:er pekar på Shopify. Bilderna är våra.'
      : `\n! ${count} bild-URL:er pekar fortfarande på Shopify.`
  );
} else {
  console.log('\nKör om med --apply för att skriva.');
}
