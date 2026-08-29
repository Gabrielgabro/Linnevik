/**
 * Läsningarna mot vår egen handelskatalog. Brödsmulor, kategorier och produkter
 * ägs av backenden; gamla externa id:n är bara importproveniens. Neon-drivrutinen
 * får inte följa med ut i klientpaketet, så
 * inget här importeras av en klientkomponent.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { collections, productCollections, products } from '@/lib/db/schema';
import type { Language } from '@/lib/languageConfig';

export type CatalogCrumb = {
  handle: string;
  title: string;
};

export function catalogConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function titleFor(row: { titleSv: string; titleEn: string }, locale: Language): string {
  return locale === 'en' ? row.titleEn : row.titleSv;
}

/**
 * Kategorikedjan för en produkt, från roten och nedåt. Följer den primära
 * kopplingen och därefter `parent_id` uppåt i trädet. Tom lista betyder att
 * produkten inte är kopplad och anroparen visar ingen kategorikedja.
 *
 * Djupet är begränsat: en cykel i trädet ska ge en kort brödsmula, inte en
 * oändlig loop. Databasen hindrar bara att en kategori är sin egen förälder.
 */
export async function getProductBreadcrumb(
  productHandle: string,
  locale: Language,
  maxDepth = 5
): Promise<CatalogCrumb[]> {
  if (!catalogConfigured()) return [];

  const primary = await getDb()
    .select({
      id: collections.id,
      handle: collections.handle,
      titleSv: collections.titleSv,
      titleEn: collections.titleEn,
      parentId: collections.parentId,
    })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .innerJoin(collections, eq(collections.id, productCollections.collectionId))
    .where(
      and(
        locale === 'en' ? eq(products.handleEn, productHandle) : eq(products.handle, productHandle),
        eq(productCollections.isPrimary, true),
        eq(collections.active, true)
      )
    )
    .limit(1);

  if (!primary.length) return [];

  const chain = [primary[0]];
  const seen = new Set([primary[0].id]);
  let parentId = primary[0].parentId;

  while (parentId !== null && chain.length < maxDepth) {
    const parent = await getDb()
      .select({
        id: collections.id,
        handle: collections.handle,
        titleSv: collections.titleSv,
        titleEn: collections.titleEn,
        parentId: collections.parentId,
      })
      .from(collections)
      .where(and(eq(collections.id, parentId), eq(collections.active, true)))
      .limit(1);

    if (!parent.length || seen.has(parent[0].id)) break;
    chain.unshift(parent[0]);
    seen.add(parent[0].id);
    parentId = parent[0].parentId;
  }

  return chain.map(row => ({ handle: row.handle, title: titleFor(row, locale) }));
}

export type CatalogCollection = {
  id: number;
  handle: string;
  handleSv: string;
  handleEn: string;
  title: string;
  description: string | null;
  parentId: number | null;
  position: number;
  image: { url: string; altText: string | null } | null;
  /** Produkter i kategorin och i allt som ligger under den. */
  productCount: number;
};

/**
 * Kortet en produkt visas som i en lista.
 *
 * Komponenten behåller det gamla `images.edges[].node`/`priceRange`-kontraktet
 * för att undvika en bred UI-omskrivning. All data kommer ändå från vår lokala
 * katalog; typen kan rätas ut separat när konsumenterna moderniseras.
 */
export type CatalogProductCard = {
  id: string;
  handle: string;
  title: string;
  images: { edges: { node: { url: string; altText: string | null } }[] };
  priceRange?: { minVariantPrice: { amount: string; currencyCode: string } };
};

type CollectionRow = {
  id: number;
  handle: string;
  handle_en: string | null;
  title_sv: string;
  title_en: string;
  description_html: string | null;
  description_html_en: string | null;
  parent_id: number | null;
  position: number;
  image_url: string | null;
  image_alt_text: string | null;
  product_count: number;
};

function toCollection(row: CollectionRow, locale: Language): CatalogCollection {
  return {
    id: row.id,
    handle: (locale === 'en' && row.handle_en) ? row.handle_en : row.handle,
    handleSv: row.handle,
    handleEn: row.handle_en || row.handle,
    title: titleFor({ titleSv: row.title_sv, titleEn: row.title_en }, locale),
    description:
      (locale === 'en' ? row.description_html_en : row.description_html) || null,
    parentId: row.parent_id,
    position: row.position,
    image: row.image_url ? { url: row.image_url, altText: row.image_alt_text } : null,
    productCount: Number(row.product_count),
  };
}

/**
 * Antalet produkter räknas över hela underträdet, inte bara de direkt
 * kopplade. En förälder som säger "0 produkter" fast den har fyllda barn är
 * inte en kategori någon vågar lita på.
 */
// Korrelerad mot `collections` utan alias — den yttre frågan måste därför
// också läsa från `collections` under sitt eget namn.
const SUBTREE_COUNT = sql`(
  with recursive subtree as (
    select ${collections.id} as id
    union all
    select child.id from collections child
      join subtree s on child.parent_id = s.id
     where child.active
  )
  select count(distinct pc.product_id)::int
    from subtree s
    join product_collections pc on pc.collection_id = s.id
    join products p on p.id = pc.product_id and p.status = 'active'
)`;

/**
 * Hela kategoriträdet, platt och i redigerad ordning. Anroparen bygger
 * hierarkin ur `parentId`.
 */
export async function listCollections(locale: Language): Promise<CatalogCollection[]> {
  if (!catalogConfigured()) return [];

  const result = await getDb().execute(sql`
    select collections.id, collections.handle, collections.handle_en, collections.title_sv, collections.title_en,
           collections.description_html, collections.description_html_en,
           collections.parent_id, collections.position,
           collections.image_url, collections.image_alt_text,
           ${SUBTREE_COUNT} as product_count
      from collections
     where collections.active
     order by collections.position asc, collections.handle asc
  `);

  return (result.rows as CollectionRow[]).map(row => toCollection(row, locale));
}

type ProductCardRow = {
  id: number;
  handle: string;
  handle_en: string | null;
  title: string;
  title_en: string | null;
  image_url: string | null;
  image_alt_text: string | null;
  price_minor: number | null;
  currency: string | null;
};

function toProductCard(row: ProductCardRow, locale: Language): CatalogProductCard {
  return {
    id: String(row.id),
    handle: (locale === 'en' && row.handle_en) ? row.handle_en : row.handle,
    title: (locale === 'en' ? row.title_en : row.title) || row.title,
    images: row.image_url
      ? { edges: [{ node: { url: row.image_url, altText: row.image_alt_text } }] }
      : { edges: [] },
    priceRange:
      row.price_minor === null
        ? undefined
        : {
            minVariantPrice: {
              amount: (row.price_minor / 100).toFixed(2),
              currencyCode: (row.currency ?? 'sek').toUpperCase(),
            },
          },
  };
}

/** Active products for storefront shelves and the sample picker. */
export async function listCatalogProductCards(
  locale: Language,
  limit = 100
): Promise<CatalogProductCard[]> {
  if (!catalogConfigured()) return [];
  const rows = await getDb().execute(sql`
    select p.id, p.handle, p.handle_en, p.title, p.title_en,
           img.url as image_url, img.alt_text as image_alt_text,
           price.price_minor, price.currency
    from products p
    left join lateral (
      select url, alt_text from product_images
      where product_id = p.id order by position asc, id asc limit 1
    ) img on true
    left join lateral (
      select price_minor, currency from product_variants
      where product_id = p.id and active
      order by price_minor asc limit 1
    ) price on true
    where p.status = 'active'
    order by p.title asc
    limit ${Math.max(1, Math.min(limit, 250))}
  `);
  return (rows.rows as ProductCardRow[]).map(row => toProductCard(row, locale));
}

export async function listCatalogSitemapEntries(
  resource: 'products' | 'collections'
): Promise<Array<{ handle: string; handle_en: string | null; updatedAt: Date }>> {
  if (!catalogConfigured()) return [];
  if (resource === 'products') {
    return getDb()
      .select({ handle: products.handle, handle_en: products.handleEn, updatedAt: products.updatedAt })
      .from(products)
      .where(eq(products.status, 'active'));
  }
  return getDb()
    .select({ handle: collections.handle, handle_en: collections.handleEn, updatedAt: collections.updatedAt })
    .from(collections)
    .where(eq(collections.active, true));
}

/**
 * En kategori med sina underkategorier och sina produkter.
 *
 * Produkterna hämtas från hela underträdet: det är det som gör en förälder
 * till något annat än en tom rubrik. `null` betyder att handlen inte finns
 * eller är inaktiv — anroparen svarar 404.
 *
 * "Från"-priset räknas bara över varianter som både är `active` och
 * `available_for_sale`, alltså samma villkor som `cartRules` kräver. En
 * produkt utan säljbar variant listas fortfarande — den är verklig och har en
 * sida — men utan pris, eftersom kassan ändå inte hade tagit emot den.
 */
export async function getCollectionPage(
  handle: string,
  locale: Language,
  { limit = 24, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<{
  collection: CatalogCollection;
  children: CatalogCollection[];
  products: CatalogProductCard[];
  total: number;
} | null> {
  if (!catalogConfigured()) return null;

  const db = getDb();
  const handleCondition = locale === 'en' ? sql`collections.handle_en = ${handle}` : sql`collections.handle = ${handle}`;
  const found = await db.execute(sql`
    select collections.id, collections.handle, collections.handle_en, collections.title_sv, collections.title_en,
           collections.description_html, collections.description_html_en,
           collections.parent_id, collections.position,
           collections.image_url, collections.image_alt_text,
           ${SUBTREE_COUNT} as product_count
      from collections
     where ${handleCondition} and collections.active
     limit 1
  `);
  const row = (found.rows as CollectionRow[])[0];
  if (!row) return null;

  const collection = toCollection(row, locale);

  const childRows = await db.execute(sql`
    select collections.id, collections.handle, collections.handle_en, collections.title_sv, collections.title_en,
           collections.description_html, collections.description_html_en,
           collections.parent_id, collections.position,
           collections.image_url, collections.image_alt_text,
           ${SUBTREE_COUNT} as product_count
      from collections
     where collections.parent_id = ${collection.id} and collections.active
     order by collections.position asc, collections.handle asc
  `);

  // Underträdet en gång, återanvänt av både listan och räkningen.
  const subtree = sql`
    with recursive subtree as (
      select ${collection.id}::int as id
      union all
      select child.id from collections child
        join subtree s on child.parent_id = s.id
       where child.active
    )
  `;
  const inSubtree = sql`
    exists (
      select 1 from product_collections pc
       where pc.product_id = p.id
         and pc.collection_id in (select id from subtree)
    )
  `;

  const productRows = await db.execute(sql`
    ${subtree}
    select p.id, p.handle, p.handle_en, p.title, p.title_en,
           img.url as image_url, img.alt_text as image_alt_text,
           price.price_minor, price.currency
      from products p
      left join lateral (
        select url, alt_text from product_images
         where product_id = p.id order by position asc, id asc limit 1
      ) img on true
      left join lateral (
        select price_minor, currency from product_variants
         where product_id = p.id and active and available_for_sale
         order by price_minor asc limit 1
      ) price on true
     where p.status = 'active' and ${inSubtree}
     order by p.title asc
     limit ${limit} offset ${offset}
  `);

  const counted = await db.execute(sql`
    ${subtree}
    select count(*)::int as total from products p
     where p.status = 'active' and ${inSubtree}
  `);

  return {
    collection,
    children: (childRows.rows as CollectionRow[]).map(child => toCollection(child, locale)),
    products: (productRows.rows as ProductCardRow[]).map(product =>
      toProductCard(product, locale)
    ),
    total: Number((counted.rows as { total: number }[])[0]?.total ?? 0),
  };
}

/** Handles för `generateStaticParams`. */
export async function listCollectionHandles(): Promise<{handle: string; handle_en: string | null}[]> {
  if (!catalogConfigured()) return [];
  const rows = await getDb()
    .select({ handle: collections.handle, handle_en: collections.handleEn })
    .from(collections)
    .where(eq(collections.active, true))
    .orderBy(asc(collections.handle));
  return rows;
}

/**
 * Produkten som produktsidan visar den.
 *
 * Formen är Shopifys av samma skäl som `CatalogProductCard` är det: sidan,
 * `ProductForm`, `ProductGallery` och `JsonLd` är byggda kring
 * `images.edges[].node` och `variants.edges[].node`, och att forma om här är
 * billigare och mindre riskabelt än att röra varje konsument. Skillnaden mot
 * kortet är att det här nu är hela sanningen — Shopify läses inte längre för
 * produktsidan.
 */
export type CatalogProduct = {
  id: string;
  handle: string;
  handleSv: string;
  handleEn: string;
  title: string;
  descriptionHtml: string | null;
  images: { edges: { node: { url: string; altText: string | null } }[] };
  options: { name: string; values: string[] }[];
  variants: {
    edges: {
      node: {
        id: string;
        variantId: number;
        title: string;
        availableForSale: boolean;
        price: { amount: string; currencyCode: string };
        selectedOptions: { name: string; value: string }[];
        sku: string | null;
      };
    }[];
  };
  tags: string[];
  leadTime: string | null;
  /** Högsta minsta orderkvantitet bland de säljbara varianterna, eller null. */
  moq: number | null;
  /** Högsta kartongsteg bland de säljbara varianterna, eller null. */
  packSize: number | null;
};

type ProductDetailRow = {
  id: number;
  handle: string;
  handle_en: string | null;
  title: string;
  title_en: string | null;
  description_html: string | null;
  description_html_en: string | null;
  tags: string[] | null;
  lead_time: string | null;
};

type VariantRow = {
  id: number;
  sku: string;
  option_values: Array<{ name: string; value: string }> | null;
  option_values_en: Array<{ name: string; value: string }> | null;
  price_minor: number;
  currency: string;
  minimum_order_quantity: number;
  order_increment: number;
  purchasable: boolean;
};

/**
 * Variantens eget id utåt. Prefixet gör typen tydlig i klienten och hindrar att
 * kvarvarande importerade Shopify-id:n råkar bli en aktiv systemkoppling.
 */
export const OWNED_VARIANT_PREFIX = 'linnevik:';

function variantHandle(row: VariantRow): string {
  return `${OWNED_VARIANT_PREFIX}${row.id}`;
}

/**
 * Optionerna härleds ur varianterna i stället för att lagras separat: namnen
 * tas från den första varianten (alla varianter i en produkt har samma
 * uppsättning, se scripts/repair-variant-options.mjs) och värdena i den
 * ordning de först dyker upp. Det ger samma ordning som Shopify svarade med,
 * eftersom varianterna läses i id-ordning — importordningen.
 */
export function deriveOptions(variants: VariantRow[]): { name: string; values: string[] }[] {
  const byName = new Map<string, string[]>();
  for (const variant of variants) {
    for (const option of variant.option_values ?? []) {
      if (!option.name) continue;
      const values = byName.get(option.name) ?? [];
      if (!values.includes(option.value)) values.push(option.value);
      byName.set(option.name, values);
    }
  }
  return [...byName].map(([name, values]) => ({ name, values }));
}

/**
 * En kvantitetsregel som är 1 betyder "ingen regel" och ska inte visas för
 * kunden — det var så den frånvarande Shopify-metafältet betedde sig. Bland
 * varianterna väljs den strängaste, så att sidan aldrig lovar en lägre gräns
 * än den kassan tillämpar på någon av dem.
 */
export function strictestRule(values: number[]): number | null {
  const strictest = Math.max(1, ...values);
  return strictest > 1 ? strictest : null;
}

/** Produkten för /products/[handle]. `null` betyder 404. */
export async function getCatalogProduct(
  handle: string,
  locale: Language
): Promise<CatalogProduct | null> {
  if (!catalogConfigured()) return null;

  const db = getDb();
  const handleCondition = locale === 'en' ? sql`handle_en = ${handle}` : sql`handle = ${handle}`;
  const found = await db.execute(sql`
    select id, handle, handle_en, title, title_en, description_html, description_html_en,
           tags, lead_time
      from products
     where ${handleCondition} and status = 'active'
     limit 1
  `);
  const row = (found.rows as ProductDetailRow[])[0];
  if (!row) return null;

  const imageRows = await db.execute(sql`
    select url, alt_text from product_images
     where product_id = ${row.id}
     order by position asc, id asc
  `);

  // `active` och `available_for_sale` säger olika saker — om varianten ingår i
  // katalogen respektive om den får beställas. `cartRules` kräver båda.
  const variantRows = await db.execute(sql`
    select id, sku, option_values, option_values_en, price_minor, currency,
           minimum_order_quantity, order_increment,
           active and available_for_sale as purchasable
      from product_variants
     where product_id = ${row.id}
     -- Ordningen sätts i /admin. Id:t är andrahandsval, så att två varianter
     -- på samma position alltid kommer i samma ordning.
     order by position asc, id asc
  `);

  const variants = variantRows.rows as VariantRow[];
  const purchasable = variants.filter(variant => variant.purchasable);
  const title = (locale === 'en' ? row.title_en : row.title) || row.title;

  const localizedVariants = variants.map(v => ({
    ...v,
    option_values: locale === 'en' ? (v.option_values_en ?? []) : (v.option_values ?? [])
  }));

  return {
    id: String(row.id),
    handle: (locale === 'en' && row.handle_en) ? row.handle_en : row.handle,
    handleSv: row.handle,
    handleEn: row.handle_en || row.handle,
    title,
    descriptionHtml:
      (locale === 'en' ? row.description_html_en : row.description_html) || null,
    images: {
      edges: (imageRows.rows as { url: string; alt_text: string | null }[]).map(image => ({
        node: { url: image.url, altText: image.alt_text },
      })),
    },
    options: deriveOptions(localizedVariants),
    variants: {
      edges: localizedVariants.map(variant => ({
        node: {
          id: variantHandle(variant),
          variantId: variant.id,
          title: (variant.option_values ?? []).map(option => option.value).join(' / '),
          availableForSale: variant.purchasable,
          price: {
            amount: (variant.price_minor / 100).toFixed(2),
            currencyCode: variant.currency.toUpperCase(),
          },
          selectedOptions: (variant.option_values ?? []).map(option => ({
            name: option.name,
            value: option.value,
          })),
          sku: variant.sku,
        },
      })),
    },
    tags: row.tags ?? [],
    leadTime: row.lead_time,
    // Reglerna vägs bara över det vi faktiskt säljer. En avmarkerad variant med
    // en strängare regel ska inte styra vad kunden ser.
    moq: strictestRule(purchasable.map(variant => variant.minimum_order_quantity)),
    packSize: strictestRule(purchasable.map(variant => variant.order_increment)),
  };
}

/**
 * Träffen i sökresultatet. Formen är den `getProductsBasic` svarade med, som
 * `LiveSearch` och `SearchPageClient` redan är byggda kring.
 */
export type CatalogSearchResult = {
  id: string;
  handle: string;
  title: string;
  productType: string | null;
  tags: string[];
  featuredImage: { url: string; altText: string | null } | null;
};

type SearchResultRow = {
  id: number;
  handle: string;
  handle_en: string | null;
  title: string;
  title_en: string | null;
  product_type: string | null;
  tags: string[] | null;
  image_url: string | null;
  image_alt_text: string | null;
};

/**
 * Sökningen.
 *
 * Shopify-versionen hämtade hela katalogen och filtrerade i Node, därför att
 * Shopifys `query` bara söker i butikens standardspråk och alltså missade
 * engelska träffar helt. Här finns ingen sådan begränsning: båda språkens
 * kolumner ligger i samma tabell, så matchningen görs i databasen och träffar
 * titel, produkttyp och taggar på det språk besökaren läser.
 */
export async function searchCatalogProducts(
  query: string,
  locale: Language,
  limit = 60
): Promise<CatalogSearchResult[]> {
  if (!catalogConfigured()) return [];

  const term = query.trim();
  const titleColumn = locale === 'en' ? sql`coalesce(p.title_en, p.title)` : sql`p.title`;
  // Bara den yttre likheten escapas inte av drivrutinen åt oss, så jokertecknen
  // sätts på parametern i stället för i mönstret.
  const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
  const matches = term
    ? sql`(
        ${titleColumn} ilike ${pattern} escape '\\'
        or p.product_type ilike ${pattern} escape '\\'
        or exists (select 1 from unnest(p.tags) tag where tag ilike ${pattern} escape '\\')
      )`
    : sql`true`;

  const rows = await getDb().execute(sql`
    select p.id, p.handle, p.handle_en, p.title, p.title_en, p.product_type, p.tags,
           img.url as image_url, img.alt_text as image_alt_text
      from products p
      left join lateral (
        select url, alt_text from product_images
         where product_id = p.id order by position asc, id asc limit 1
      ) img on true
     where p.status = 'active' and ${matches}
     order by ${titleColumn} asc
     limit ${limit}
  `);

  return (rows.rows as SearchResultRow[]).map(row => ({
    id: String(row.id),
    handle: (locale === 'en' && row.handle_en) ? row.handle_en : row.handle,
    title: (locale === 'en' ? row.title_en : row.title) || row.title,
    productType: row.product_type,
    tags: row.tags ?? [],
    featuredImage: row.image_url
      ? { url: row.image_url, altText: row.image_alt_text }
      : null,
  }));
}

/** Handles för `generateStaticParams` på /products/[handle]. */
export async function listProductHandles(): Promise<{handle: string; handle_en: string | null}[]> {
  if (!catalogConfigured()) return [];
  const rows = await getDb()
    .select({ handle: products.handle, handle_en: products.handleEn })
    .from(products)
    .where(eq(products.status, 'active'))
    .orderBy(asc(products.handle));
  return rows;
}
