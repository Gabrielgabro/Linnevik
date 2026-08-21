/**
 * Databasfrågorna för katalogen i adminvyn.
 *
 * Skilt från catalogDb.ts därför att den filen svarar på vad sajten behöver
 * veta — brödsmulor och kategoriträd — medan den här svarar på vad den som
 * sköter katalogen behöver kunna göra. Neon-drivrutinen får inte följa med ut
 * i klientpaketet, så inget här importeras av en klientkomponent.
 */

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  collections,
  orderItems,
  productCollections,
  productImages,
  products,
  productVariants,
  type ProductImageRow,
  type ProductRow,
  type ProductVariantRow,
} from '@/lib/db/schema';

export function productsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export type ProductListRow = {
  id: number;
  handle: string;
  title: string;
  active: boolean;
  status: string;
  stripeProductId: string | null;
  tags: string[];
  supplier: string;
  variantCount: number;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  currency: string | null;
  stock: number;
  primaryCollection: string | null;
  thumbnailUrl: string | null;
  thumbnailAlt: string | null;
};

/**
 * Listan, med allt som behövs för att kunna sortera och filtrera i webbläsaren.
 * Sammanräkningarna görs i databasen: katalogen är liten, men en fråga per
 * produkt vore ändå fel form på lösningen.
 */
export async function listProductsForAdmin(): Promise<ProductListRow[]> {
  if (!productsConfigured()) return [];

  // Varianterna är den enda joinen här, så aggregaten är oförvanskade. Kategori
  // och bild hämtas i egna frågor nedan — hade de joinats in i samma fråga
  // skulle raderna multipliceras och summan av lagret bli fel.
  const rows = await getDb()
    .select({
      id: products.id,
      handle: products.handle,
      title: products.title,
      active: products.active,
      status: products.status,
      stripeProductId: products.stripeProductId,
      tags: products.tags,
      supplier: products.supplier,
      variantCount: sql<number>`count(${productVariants.id})::int`,
      priceMinMinor: sql<number | null>`min(${productVariants.priceMinor})::int`,
      priceMaxMinor: sql<number | null>`max(${productVariants.priceMinor})::int`,
      currency: sql<string | null>`min(${productVariants.currency})`,
      stock: sql<number>`coalesce(sum(${productVariants.inventoryQuantity}), 0)::int`,
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .groupBy(products.id)
    .orderBy(asc(products.title));

  if (!rows.length) return [];

  const ids = rows.map(row => row.id);

  const primaries = await getDb()
    .select({ productId: productCollections.productId, title: collections.titleSv })
    .from(productCollections)
    .innerJoin(collections, eq(collections.id, productCollections.collectionId))
    .where(and(eq(productCollections.isPrimary, true), inArray(productCollections.productId, ids)));
  const primaryByProduct = new Map(primaries.map(row => [row.productId, row.title]));

  const thumbs = await getDb()
    .select({
      productId: productImages.productId,
      url: productImages.url,
      altText: productImages.altText,
      position: productImages.position,
    })
    .from(productImages)
    .where(inArray(productImages.productId, ids))
    .orderBy(asc(productImages.productId), asc(productImages.position), asc(productImages.id));
  const thumbByProduct = new Map<number, { url: string; altText: string | null }>();
  for (const row of thumbs) {
    if (!thumbByProduct.has(row.productId)) {
      thumbByProduct.set(row.productId, { url: row.url, altText: row.altText });
    }
  }

  return rows.map(row => ({
    ...row,
    primaryCollection: primaryByProduct.get(row.id) ?? null,
    thumbnailUrl: thumbByProduct.get(row.id)?.url ?? null,
    thumbnailAlt: thumbByProduct.get(row.id)?.altText ?? null,
  }));
}

export type VariantWithUsage = ProductVariantRow & {
  /** Antal orderrader. En variant som sålts ska inaktiveras, inte raderas. */
  orderLineCount: number;
};

export type ProductDetail = {
  product: ProductRow;
  variants: VariantWithUsage[];
  images: ProductImageRow[];
  collectionIds: number[];
  primaryCollectionId: number | null;
};

export async function getProductDetail(handle: string): Promise<ProductDetail | null> {
  if (!productsConfigured()) return null;
  const db = getDb();

  const [product] = await db.select().from(products).where(eq(products.handle, handle)).limit(1);
  if (!product) return null;

  const variants = await db
    .select({
      variant: productVariants,
      orderLineCount: sql<number>`count(${orderItems.id})::int`,
    })
    .from(productVariants)
    .leftJoin(orderItems, eq(orderItems.variantId, productVariants.id))
    .where(eq(productVariants.productId, product.id))
    .groupBy(productVariants.id)
    .orderBy(asc(productVariants.sku));

  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position), asc(productImages.id));

  const links = await db
    .select({ collectionId: productCollections.collectionId, isPrimary: productCollections.isPrimary })
    .from(productCollections)
    .where(eq(productCollections.productId, product.id));

  return {
    product,
    variants: variants.map(row => ({ ...row.variant, orderLineCount: row.orderLineCount })),
    images,
    collectionIds: links.map(link => link.collectionId),
    primaryCollectionId: links.find(link => link.isPrimary)?.collectionId ?? null,
  };
}

/**
 * En handle av en titel. Bara a–z, siffror och bindestreck: den hamnar i en
 * URL och ska gå att skriva av för hand. Svenska tecken translittereras hellre
 * än tas bort, så att "Täcke" blir "tacke" och inte "tcke".
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Ledig handle. Lägger på -2, -3 … tills den är obruten. */
export async function availableHandle(base: string): Promise<string> {
  const slug = slugify(base) || 'produkt';
  const taken = await getDb()
    .select({ handle: products.handle })
    .from(products)
    .where(sql`${products.handle} = ${slug} or ${products.handle} like ${slug + '-%'}`);
  if (!taken.some(row => row.handle === slug)) return slug;

  const used = new Set(taken.map(row => row.handle));
  for (let n = 2; n < 1000; n += 1) {
    if (!used.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }
  throw new Error('Kunde inte hitta en ledig handle.');
}

export type ProductInput = Partial<
  Pick<
    ProductRow,
    | 'title'
    | 'titleEn'
    | 'handle'
    | 'descriptionHtml'
    | 'descriptionHtmlEn'
    | 'tags'
    | 'productType'
    | 'supplier'
    | 'seoTitle'
    | 'seoDescription'
    | 'seoTitleEn'
    | 'seoDescriptionEn'
    | 'leadTime'
    | 'status'
    | 'publishedAt'
    | 'active'
  >
>;

export async function createProduct(input: ProductInput & { title: string }): Promise<ProductRow> {
  const handle = input.handle ? slugify(input.handle) : await availableHandle(input.title);
  const status = input.status ?? (input.active === false ? 'draft' : 'active');
  const [row] = await getDb()
    .insert(products)
    .values({
      ...input,
      handle,
      title: input.title,
      status,
      active: status === 'active',
      publishedAt: status === 'active' ? (input.publishedAt ?? new Date()) : null,
      source: 'linnevik',
    })
    .returning();
  return row;
}

export async function updateProduct(id: number, patch: ProductInput): Promise<ProductRow | null> {
  const statusPatch = patch.status
    ? {
        status: patch.status,
        active: patch.status === 'active',
        ...(patch.status === 'active' ? { publishedAt: patch.publishedAt ?? new Date() } : {}),
      }
    : {};
  const [row] = await getDb()
    .update(products)
    .set({ ...patch, ...statusPatch, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  return row ?? null;
}

/**
 * Kastar hellre än att radera en produkt som har varianter: FK:n är `restrict`,
 * och felet därifrån säger inget begripligt.
 */
export async function deleteProduct(id: number): Promise<void> {
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(eq(productVariants.productId, id));
  if (count > 0) {
    throw new Error('Produkten har varianter. Ta bort dem först, eller inaktivera produkten.');
  }
  await getDb().delete(products).where(eq(products.id, id));
}

export type VariantInput = Partial<
  Pick<
    ProductVariantRow,
    | 'sku'
    | 'optionValues'
    | 'priceMinor'
    | 'currency'
    | 'inventoryQuantity'
    | 'minimumOrderQuantity'
    | 'orderIncrement'
    | 'inventoryTracked'
    | 'availableForSale'
    | 'active'
  >
>;

export async function createVariant(
  productId: number,
  input: VariantInput & { sku: string; priceMinor: number }
): Promise<ProductVariantRow> {
  const [row] = await getDb()
    .insert(productVariants)
    .values({
      ...input,
      productId,
      // Stripe-nyckeln byggs likadant som importen gjorde, så att en variant
      // som skapas här ser likadan ut som en som en gång kom från Shopify.
      stripeLookupKey: `linnevik_${input.sku.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    })
    .returning();
  return row;
}

export async function updateVariant(
  id: number,
  patch: VariantInput
): Promise<ProductVariantRow | null> {
  const [row] = await getDb()
    .update(productVariants)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(productVariants.id, id))
    .returning();
  return row ?? null;
}

/**
 * En variant som förekommer på en order raderas inte. `order_items.variant_id`
 * är `set null`, så databasen hade tillåtit det — och tyst klippt bandet mellan
 * ordern och vad som faktiskt såldes. Inaktivera i stället.
 */
export async function deleteVariant(id: number): Promise<void> {
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.variantId, id));
  if (count > 0) {
    throw new Error('Varianten finns på en order och kan inte tas bort. Inaktivera den i stället.');
  }
  await getDb().delete(productVariants).where(eq(productVariants.id, id));
}

/**
 * Kategorikopplingarna skrivs om i ett svep. Den primära sätts sist och i en
 * egen sats: det partiella unika indexet tillåter bara en primär per produkt,
 * och att skriva flera rader med is_primary på en gång skulle krocka med det.
 */
export async function setProductCollections(
  productId: number,
  collectionIds: number[],
  primaryId: number | null
): Promise<void> {
  const db = getDb();
  const unique = [...new Set(collectionIds)];
  const primary = primaryId !== null && unique.includes(primaryId) ? primaryId : null;

  await db.delete(productCollections).where(eq(productCollections.productId, productId));
  if (!unique.length) return;

  await db
    .insert(productCollections)
    .values(unique.map((collectionId, index) => ({ productId, collectionId, position: index })));

  if (primary !== null) {
    await db
      .update(productCollections)
      .set({ isPrimary: true })
      .where(
        and(
          eq(productCollections.productId, productId),
          eq(productCollections.collectionId, primary)
        )
      );
  }
}

export async function addImage(input: {
  productId: number;
  url: string;
  blobPathname: string;
  altText?: string | null;
}): Promise<ProductImageRow> {
  const [{ next }] = await getDb()
    .select({ next: sql<number>`coalesce(max(${productImages.position}) + 1, 0)::int` })
    .from(productImages)
    .where(eq(productImages.productId, input.productId));

  const [row] = await getDb()
    .insert(productImages)
    .values({ ...input, altText: input.altText ?? null, position: next })
    .returning();
  return row;
}

export async function getImage(id: number): Promise<ProductImageRow | null> {
  const [row] = await getDb().select().from(productImages).where(eq(productImages.id, id)).limit(1);
  return row ?? null;
}

export async function removeImage(id: number): Promise<void> {
  await getDb().delete(productImages).where(eq(productImages.id, id));
}

export async function updateImage(
  id: number,
  patch: { altText?: string | null; position?: number }
): Promise<ProductImageRow | null> {
  const [row] = await getDb()
    .update(productImages)
    .set(patch)
    .where(eq(productImages.id, id))
    .returning();
  return row ?? null;
}

/** Ny ordning på en produkts bilder, i den ordning id:na kommer. */
export async function reorderImages(productId: number, orderedIds: number[]): Promise<void> {
  const db = getDb();
  for (const [index, id] of orderedIds.entries()) {
    await db
      .update(productImages)
      .set({ position: index })
      .where(and(eq(productImages.id, id), eq(productImages.productId, productId)));
  }
}

// ---------------------------------------------------------------------------
// Kategorier
// ---------------------------------------------------------------------------

export type CollectionListRow = {
  id: number;
  handle: string;
  titleSv: string;
  titleEn: string;
  descriptionHtml: string | null;
  descriptionHtmlEn: string | null;
  seoTitle: string | null;
  seoTitleEn: string | null;
  seoDescription: string | null;
  seoDescriptionEn: string | null;
  imageUrl: string | null;
  imageAltText: string | null;
  parentId: number | null;
  position: number;
  active: boolean;
  productCount: number;
};

/** Leverantörer som redan finns på någon produkt, för att slippa särskrivningar och särstavningar. */
export async function listSuppliersForAdmin(): Promise<string[]> {
  if (!productsConfigured()) return [];
  const rows = await getDb()
    .selectDistinct({ supplier: products.supplier })
    .from(products)
    .orderBy(asc(products.supplier));
  return rows.map(row => row.supplier);
}

export async function listCollectionsForAdmin(): Promise<CollectionListRow[]> {
  if (!productsConfigured()) return [];
  return getDb()
    .select({
      id: collections.id,
      handle: collections.handle,
      titleSv: collections.titleSv,
      titleEn: collections.titleEn,
      descriptionHtml: collections.descriptionHtml,
      descriptionHtmlEn: collections.descriptionHtmlEn,
      seoTitle: collections.seoTitle,
      seoTitleEn: collections.seoTitleEn,
      seoDescription: collections.seoDescription,
      seoDescriptionEn: collections.seoDescriptionEn,
      imageUrl: collections.imageUrl,
      imageAltText: collections.imageAltText,
      parentId: collections.parentId,
      position: collections.position,
      active: collections.active,
      productCount: sql<number>`count(${productCollections.productId})::int`,
    })
    .from(collections)
    .leftJoin(productCollections, eq(productCollections.collectionId, collections.id))
    .groupBy(collections.id)
    .orderBy(asc(collections.position), asc(collections.titleSv));
}

export type CollectionInput = {
  titleSv?: string;
  titleEn?: string;
  descriptionHtml?: string | null;
  descriptionHtmlEn?: string | null;
  seoTitle?: string | null;
  seoTitleEn?: string | null;
  seoDescription?: string | null;
  seoDescriptionEn?: string | null;
  handle?: string;
  parentId?: number | null;
  position?: number;
  active?: boolean;
};

export async function createCollection(
  input: CollectionInput & { titleSv: string; titleEn: string }
): Promise<{ id: number }> {
  const handle = input.handle ? slugify(input.handle) : slugify(input.titleSv);
  const [row] = await getDb()
    .insert(collections)
    .values({ ...input, handle, titleSv: input.titleSv, titleEn: input.titleEn })
    .returning({ id: collections.id });
  return row;
}

/**
 * Kastar när föräldern inte finns, eller när flytten skulle skapa en cykel.
 * Databasen hindrar bara att en kategori är sin egen förälder; en längre
 * rundgång hade i stället gjort varje brödsmula under den tyst avhuggen,
 * eftersom getProductBreadcrumb bara slutar räkna vid maxDepth.
 *
 * `id` får vara 0 för en kategori som ännu inte finns — den kan inte stänga
 * en cykel, men föräldern måste ändå existera.
 */
export async function assertNoCycle(id: number, parentId: number | null): Promise<void> {
  if (parentId === null) return;
  if (parentId === id) throw new Error('En kategori kan inte vara sin egen förälder.');

  const rows = await getDb()
    .select({ id: collections.id, parentId: collections.parentId })
    .from(collections);
  if (!rows.some(row => row.id === parentId)) {
    throw new Error('Den överordnade kategorin finns inte.');
  }
  const parentOf = new Map(rows.map(row => [row.id, row.parentId]));

  let cursor: number | null = parentId;
  const seen = new Set<number>([id]);
  while (cursor !== null) {
    if (seen.has(cursor)) throw new Error('Den flytten skulle göra kategoriträdet cirkulärt.');
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
}

export async function updateCollection(id: number, patch: CollectionInput): Promise<void> {
  if (patch.parentId !== undefined) await assertNoCycle(id, patch.parentId);
  await getDb()
    .update(collections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(collections.id, id));
}

/**
 * Kastar hellre än att låta FK:n göra det: `parent_id` är `restrict`, så en
 * kategori med barn går inte att ta bort, och felet därifrån är obegripligt.
 */
export async function deleteCollection(id: number): Promise<void> {
  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(collections)
    .where(and(eq(collections.parentId, id), ne(collections.id, id)));
  if (count > 0) {
    throw new Error('Kategorin har underkategorier. Flytta eller ta bort dem först.');
  }
  await getDb().delete(collections).where(eq(collections.id, id));
}
