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
  cartItems,
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

export type VariantPricingVariant = {
  id: number;
  sku: string;
  optionValues: Array<{ name: string; value: string }>;
  priceMinor: number;
};

export type VariantPricingProduct = {
  id: number;
  handle: string;
  title: string;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: VariantPricingVariant[];
};

/**
 * Egna produkter (leverantör Linnevik) som har fler än en variant — det är där
 * en enda "vårt pris"-siffra inte räcker, eftersom varje storlek/fyllning kan
 * behöva sättas för sig. Listan byggs av vad som faktiskt ligger i databasen,
 * inte av en hårdkodad produktlista, så en ny variantprodukt dyker upp här
 * utan kodändring.
 */
export async function listLinnevikVariantProducts(): Promise<VariantPricingProduct[]> {
  if (!productsConfigured()) return [];

  const rows = await getDb()
    .select({
      productId: products.id,
      handle: products.handle,
      title: products.title,
      variantId: productVariants.id,
      sku: productVariants.sku,
      optionValues: productVariants.optionValues,
      priceMinor: productVariants.priceMinor,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(and(eq(products.supplier, 'Linnevik'), eq(products.active, true)))
    .orderBy(asc(products.title), asc(productVariants.position), asc(productVariants.sku));

  const byProduct = new Map<number, VariantPricingProduct>();
  for (const row of rows) {
    let entry = byProduct.get(row.productId);
    if (!entry) {
      entry = { id: row.productId, handle: row.handle, title: row.title, imageUrl: null, imageAlt: null, variants: [] };
      byProduct.set(row.productId, entry);
    }
    entry.variants.push({
      id: row.variantId,
      sku: row.sku,
      optionValues: row.optionValues,
      priceMinor: row.priceMinor,
    });
  }
  const result = [...byProduct.values()].filter(p => p.variants.length > 1);
  if (!result.length) return result;

  // Samma bild kunden ser på produktsidan: första bilden i positionsordning.
  const ids = result.map(p => p.id);
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

  for (const p of result) {
    const thumb = thumbByProduct.get(p.id);
    p.imageUrl = thumb?.url ?? null;
    p.imageAlt = thumb?.altText ?? null;
  }
  return result;
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
    // Samma ordning som kunden ser på produktsidan. SKU:n avgör bara mellan
    // två varianter som aldrig flyttats isär.
    .orderBy(asc(productVariants.position), asc(productVariants.sku));

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
  // Handlen hamnar i en URL. Formuläret tar emot fri text, så den tvättas här
  // och inte bara när produkten skapas — annars blir "Täcke Sebastian" en
  // adress med blanksteg och å i sig.
  const handlePatch = patch.handle ? { handle: slugify(patch.handle) } : {};
  const statusPatch = patch.status
    ? {
        status: patch.status,
        active: patch.status === 'active',
        ...(patch.status === 'active' ? { publishedAt: patch.publishedAt ?? new Date() } : {}),
      }
    : {};
  const [row] = await getDb()
    .update(products)
    .set({ ...patch, ...handlePatch, ...statusPatch, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  return row ?? null;
}

/**
 * Vad som står i vägen för att radera en produkt, och varför.
 *
 * Sålt går före allt annat: en produkt som finns på en order raderas aldrig,
 * hur gärna man än vill. `order_items.variant_id` är `set null`, så databasen
 * hade tillåtit det och tyst klippt bandet mellan ordern och vad som såldes.
 * Arkivering är svaret där — produkten försvinner från sajten (`catalogDb`
 * läser bara `status = 'active'`) men ordern går fortfarande att läsa.
 */
export type ProductRemoval =
  | { removable: true; variantCount: number; imageCount: number }
  | { removable: false; reason: 'sold'; message: string };

export async function productRemoval(id: number): Promise<ProductRemoval> {
  const db = getDb();

  const [{ sold }] = await db
    .select({ sold: sql<number>`count(${orderItems.id})::int` })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(productVariants.productId, id));
  if (sold > 0) {
    return {
      removable: false,
      reason: 'sold',
      message:
        'Produkten finns på en eller flera ordrar och kan inte raderas — ordern ska gå att läsa i ' +
        'efterhand. Arkivera den i stället: då försvinner den från sajten men historiken är kvar.',
    };
  }

  const [{ variantCount }] = await db
    .select({ variantCount: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(eq(productVariants.productId, id));
  const [{ imageCount }] = await db
    .select({ imageCount: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.productId, id));

  return { removable: true, variantCount, imageCount };
}

/**
 * Raderar produkten med sina varianter. Bilder och kategorikopplingar följer
 * med genom FK:ernas `cascade`; bildernas URL:er returneras så att anroparen
 * kan städa filerna i Blob, som databasen inte känner till.
 *
 * Kastar hellre än att låta en FK göra det — `productRemoval` säger vad som
 * står i vägen på svenska, medan felet från databasen inte säger något alls.
 *
 * En variant som ligger i någons korg är `restrict` mot cart_items, så den
 * raden måste bort innan varianten kan raderas. Att göra det tyst är ett
 * medvetet val: `productRemoval` blockerar redan på `sold`, så en korg som
 * faktiskt hunnit bli en order stoppas där — det som är kvar här är bara
 * korgar som aldrig gick till kassan. Varje berörd korgs `version` höjs så
 * att kundens klient (som pollar på version) upptäcker att raden försvann.
 */
export async function deleteProduct(id: number): Promise<{ imageUrls: string[] }> {
  const blocked = await productRemoval(id);
  if (!blocked.removable) throw new Error(blocked.message);

  const db = getDb();
  const images = await db
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, id));

  await db.execute(sql`
    with removed as (
      delete from cart_items
      where variant_id in (select id from product_variants where product_id = ${id})
      returning cart_id
    )
    update carts set version = version + 1, updated_at = now()
    where id in (select distinct cart_id from removed)
  `);

  await db.delete(productVariants).where(eq(productVariants.productId, id));
  await db.delete(products).where(eq(products.id, id));
  return { imageUrls: images.map(image => image.url) };
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
  // Utan den här kontrollen når ett felaktigt id främmandenyckeln, och svaret
  // blir ett 500 utan förklaring i stället för ett begripligt fel.
  const [parent] = await getDb()
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!parent) throw new Error('Produkten finns inte.');

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
  // cart_items är `restrict`. Utan den här kontrollen blir en variant som
  // ligger i någons korg ett 500 utan förklaring.
  const [{ inCart }] = await getDb()
    .select({ inCart: sql<number>`count(*)::int` })
    .from(cartItems)
    .where(eq(cartItems.variantId, id));
  if (inCart > 0) {
    throw new Error(
      'Varianten ligger i en aktiv kundkorg och kan inte tas bort just nu. Inaktivera den i stället.'
    );
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

/** Returnerar handlen som faktiskt skrevs — anroparen behöver den för omdirigeringen. */
export async function updateCollection(id: number, patch: CollectionInput): Promise<string | null> {
  if (patch.parentId !== undefined) await assertNoCycle(id, patch.parentId);
  // Samma som för produkter: handlen är en adress, inte en fritext.
  const handlePatch = patch.handle ? { handle: slugify(patch.handle) } : {};
  const [row] = await getDb()
    .update(collections)
    .set({ ...patch, ...handlePatch, updatedAt: new Date() })
    .where(eq(collections.id, id))
    .returning({ handle: collections.handle });
  return row?.handle ?? null;
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

/**
 * Ny ordning på en produkts varianter, i den ordning id:na kommer.
 *
 * Samma form som `reorderImages`. Villkoret på `productId` är inte formalia:
 * utan det kan ett id ur en annan produkt flyttas om härifrån.
 */
export async function reorderVariants(productId: number, orderedIds: number[]): Promise<void> {
  const db = getDb();
  for (const [index, id] of orderedIds.entries()) {
    await db
      .update(productVariants)
      .set({ position: index, updatedAt: new Date() })
      .where(and(eq(productVariants.id, id), eq(productVariants.productId, productId)));
  }
}

/**
 * Kopierar en produkt med sina varianter och kategorikopplingar.
 *
 * En ny artikel i en befintlig serie skrevs förr av för hand, fält för fält
 * och variant för variant. Kopian är medvetet ofärdig på tre sätt:
 *
 * - **Utkast**, aldrig aktiv. En kopia som gick live i samma sekund som den
 *   skapades vore ett misstag som kunder kan se.
 * - **Ingen Stripe-koppling.** Id:t är deterministiskt ur handlen, och kopian
 *   har en egen handle — den ska kopplas för sig.
 * - **Inga bilder.** Raderna pekar på filer i Blob, och två produkter som
 *   delar en fil betyder att den som raderas först tar bilden med sig.
 *
 * SKU:n är unik i hela katalogen och kan inte kopieras rakt av. Suffixet är
 * med flit fult: det ska vara omöjligt att missa att det behöver bytas.
 */
export async function duplicateProduct(id: number): Promise<ProductRow> {
  const db = getDb();
  const [source] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!source) throw new Error('Produkten finns inte.');

  const handle = await availableHandle(`${source.handle}-kopia`);
  const [copy] = await db
    .insert(products)
    .values({
      handle,
      title: `${source.title} (kopia)`,
      titleEn: source.titleEn ? `${source.titleEn} (copy)` : null,
      descriptionHtml: source.descriptionHtml,
      descriptionHtmlEn: source.descriptionHtmlEn,
      tags: source.tags,
      productType: source.productType,
      vendor: source.vendor,
      supplier: source.supplier,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      seoTitleEn: source.seoTitleEn,
      seoDescriptionEn: source.seoDescriptionEn,
      leadTime: source.leadTime,
      status: 'draft',
      active: false,
      source: 'linnevik',
    })
    .returning();

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.position), asc(productVariants.sku));

  for (const variant of variants) {
    // 60 tecken är gränsen i kolumnen; basen kapas hellre än att kopian faller.
    // availableSku lägger på -2, -3 … om suffixet ändå krockar.
    const sku = await availableSku(`${variant.sku.slice(0, 52)}-KOPIA`);
    await db.insert(productVariants).values({
      productId: copy.id,
      sku,
      optionValues: variant.optionValues,
      priceMinor: variant.priceMinor,
      currency: variant.currency,
      // Lagret följer inte med: kopian har inga fysiska enheter någonstans.
      inventoryQuantity: 0,
      minimumOrderQuantity: variant.minimumOrderQuantity,
      orderIncrement: variant.orderIncrement,
      inventoryTracked: variant.inventoryTracked,
      availableForSale: false,
      position: variant.position,
    });
  }

  const links = await db
    .select({ collectionId: productCollections.collectionId, isPrimary: productCollections.isPrimary })
    .from(productCollections)
    .where(eq(productCollections.productId, id));
  if (links.length) {
    await setProductCollections(
      copy.id,
      links.map(link => link.collectionId),
      links.find(link => link.isPrimary)?.collectionId ?? null
    );
  }

  return copy;
}

/** Ledig SKU. Lägger på -2, -3 … tills den är obruten, som handlen. */
async function availableSku(base: string): Promise<string> {
  const taken = await getDb()
    .select({ sku: productVariants.sku })
    .from(productVariants)
    .where(sql`${productVariants.sku} = ${base} or ${productVariants.sku} like ${base + '-%'}`);
  if (!taken.some(row => row.sku === base)) return base;

  const used = new Set(taken.map(row => row.sku));
  for (let n = 2; n < 1000; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  throw new Error('Kunde inte hitta en ledig SKU för kopian.');
}
