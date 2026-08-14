/**
 * Läsningarna mot vår egen handelskatalog. Skilt från shopify.ts därför att
 * brödsmulorna och kategoriträdet nu ägs av backenden — Shopify är bara källan
 * som synkas in. Neon-drivrutinen får inte följa med ut i klientpaketet, så
 * inget här importeras av en klientkomponent.
 */

import { and, asc, eq } from 'drizzle-orm';
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
 * produkten inte är kopplad — anroparen får falla tillbaka på Shopify.
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
        eq(products.handle, productHandle),
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

/**
 * Hela kategoriträdet, platt och i redigerad ordning. Används av
 * kategoriöversikten och av adminvyn.
 */
export async function listCollections(locale: Language) {
  if (!catalogConfigured()) return [];

  const rows = await getDb()
    .select({
      id: collections.id,
      handle: collections.handle,
      titleSv: collections.titleSv,
      titleEn: collections.titleEn,
      parentId: collections.parentId,
      position: collections.position,
    })
    .from(collections)
    .where(eq(collections.active, true))
    .orderBy(asc(collections.position), asc(collections.handle));

  return rows.map(row => ({
    id: row.id,
    handle: row.handle,
    title: titleFor(row, locale),
    parentId: row.parentId,
    position: row.position,
  }));
}
