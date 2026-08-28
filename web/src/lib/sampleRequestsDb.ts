/**
 * Provförfrågningarnas databasskikt.
 *
 * Formuläret på /samples skickade tidigare bara ett mejl. Posten här är nu
 * facit: adminvyn arbetar mot den, kontosidan visar den för kunden, och mejlet
 * är en avisering ovanpå. Går mejlet fel är förfrågan ändå tagen emot.
 */

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  customers,
  products,
  sampleRequestItems,
  sampleRequests,
  type SampleRequestItemRow,
  type SampleRequestRow,
} from '@/lib/db/schema';

export const SAMPLE_STATUSES = ['new', 'in_progress', 'sent', 'declined'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export function isSampleStatus(value: unknown): value is SampleStatus {
  return typeof value === 'string' && (SAMPLE_STATUSES as readonly string[]).includes(value);
}

export type SampleRequestItemInput = {
  /** Local products.id as a string, as returned by /api/products. */
  externalProductId?: string | null;
  title: string;
  variantLabel?: string | null;
};

export type SampleRequestInput = {
  contactName: string;
  organizationName: string;
  organizationNumber: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  notes?: string | null;
  locale?: string | null;
  items: SampleRequestItemInput[];
};

export type SampleRequestDetail = SampleRequestRow & {
  items: SampleRequestItemRow[];
  customerEmail: string | null;
  clientId: number | null;
};

/**
 * Detaljvyns rader, med produktens handle.
 *
 * Raden bär bara `productId`, men /admin/products slås upp på handle — så
 * länken från en provförfrågan pekade på /admin/products/8 och gav 404.
 */
export type SampleRequestItemWithHandle = SampleRequestItemRow & {
  productHandle: string | null;
};

export type SampleRequestFull = Omit<SampleRequestDetail, 'items'> & {
  items: SampleRequestItemWithHandle[];
};

/**
 * Skriver förfrågan och dess rader.
 *
 * Kopplingen till kund görs på adressen, och bara när den redan finns — en
 * provförfrågan skapar aldrig ett konto. Produktkopplingen går via vårt eget
 * numeriska produkt-id. Hittas ingen produkt sparas raden ändå, med titeln som
 * den stod i formuläret.
 */
export async function createSampleRequest(input: SampleRequestInput): Promise<number> {
  const email = input.email.trim().toLowerCase();
  const [existingCustomer] = await getDb()
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(${customers.email}) = ${email}`)
    .limit(1);

  const [row] = await getDb()
    .insert(sampleRequests)
    .values({
      customerId: existingCustomer?.id ?? null,
      contactName: input.contactName,
      organizationName: input.organizationName,
      organizationNumber: input.organizationNumber,
      email,
      phone: input.phone,
      address: input.address,
      postalCode: input.postalCode,
      city: input.city,
      country: input.country,
      notes: input.notes || null,
      locale: input.locale || null,
    })
    .returning({ id: sampleRequests.id });

  if (input.items.length) {
    const localIds = input.items
      .map(item => item.externalProductId)
      .map(id => Number(id))
      .filter(id => Number.isInteger(id) && id > 0);
    const known = localIds.length
      ? await getDb()
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, localIds))
      : [];
    const knownIds = new Set(known.map(product => product.id));

    await getDb()
      .insert(sampleRequestItems)
      .values(
        input.items.map(item => ({
          requestId: row.id,
          productId: knownIds.has(Number(item.externalProductId))
            ? Number(item.externalProductId)
            : null,
          externalProductId: item.externalProductId || null,
          title: item.title,
          variantLabel: item.variantLabel || null,
        }))
      );
  }

  return row.id;
}

/** Sätts av API-rutten när aviseringen faktiskt gick iväg. */
export async function markSampleRequestEmailed(id: number): Promise<void> {
  await getDb().update(sampleRequests).set({ emailed: true }).where(eq(sampleRequests.id, id));
}

export async function listSampleRequests(limit = 200): Promise<SampleRequestDetail[]> {
  const rows = await getDb()
    .select()
    .from(sampleRequests)
    .orderBy(desc(sampleRequests.createdAt))
    .limit(limit);
  if (!rows.length) return [];

  const items = await getDb()
    .select()
    .from(sampleRequestItems)
    .where(sql`${sampleRequestItems.requestId} in ${rows.map(row => row.id)}`);
  const byRequest = new Map<number, SampleRequestItemRow[]>();
  for (const item of items) {
    const list = byRequest.get(item.requestId) ?? [];
    list.push(item);
    byRequest.set(item.requestId, list);
  }

  return rows.map(row => ({
    ...row,
    items: byRequest.get(row.id) ?? [],
    customerEmail: null,
    clientId: null,
  }));
}

export async function getSampleRequestById(id: number): Promise<SampleRequestFull | null> {
  const [row] = await getDb()
    .select()
    .from(sampleRequests)
    .where(eq(sampleRequests.id, id))
    .limit(1);
  if (!row) return null;

  const rows = await getDb()
    .select()
    .from(sampleRequestItems)
    .where(eq(sampleRequestItems.requestId, id));

  // Produkten kan ha tagits bort sedan förfrågan kom in, så handlen slås upp
  // och får vara null när den inte finns kvar. Länken göms då i vyn.
  const productIds = rows.map(item => item.productId).filter((value): value is number => value !== null);
  const handles = productIds.length
    ? await getDb()
        .select({ id: products.id, handle: products.handle })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const handleById = new Map(handles.map(product => [product.id, product.handle]));
  const items: SampleRequestItemWithHandle[] = rows.map(item => ({
    ...item,
    productHandle: item.productId === null ? null : handleById.get(item.productId) ?? null,
  }));

  const [customer] = row.customerId
    ? await getDb()
        .select({ email: customers.email, clientId: customers.clientId })
        .from(customers)
        .where(eq(customers.id, row.customerId))
        .limit(1)
    : [];

  return {
    ...row,
    items,
    customerEmail: customer?.email ?? null,
    clientId: customer?.clientId ?? null,
  };
}

/** Statusbyte och intern anteckning från adminvyn. */
export async function updateSampleRequest(
  id: number,
  patch: { status?: SampleStatus; internalNote?: string | null },
  actor: string
): Promise<SampleRequestRow | null> {
  const [row] = await getDb()
    .update(sampleRequests)
    .set({
      status: patch.status,
      internalNote: patch.internalNote,
      // Vem som senast rörde den, och när. En förfrågan som står kvar på "new"
      // har ingen rört, och då ska fälten förbli tomma.
      handledBy: patch.status && patch.status !== 'new' ? actor : undefined,
      handledAt: patch.status && patch.status !== 'new' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(sampleRequests.id, id))
    .returning();
  return row ?? null;
}

/**
 * Kundens egna förfrågningar.
 *
 * Matchar både på kopplingen och på adressen: den som bad om prover innan de
 * registrerade sig har `customer_id = null`, och ska ändå se sin förfrågan när
 * de sedan loggar in med samma adress.
 */
export async function getSampleRequestsForCustomer(
  input: { customerId?: number | null; email?: string | null },
  limit = 10
): Promise<SampleRequestDetail[]> {
  const email = input.email?.trim().toLowerCase();
  if (!input.customerId && !email) return [];

  const rows = await getDb()
    .select()
    .from(sampleRequests)
    .where(
      or(
        input.customerId ? eq(sampleRequests.customerId, input.customerId) : undefined,
        email
          ? and(isNull(sampleRequests.customerId), sql`lower(${sampleRequests.email}) = ${email}`)
          : undefined
      )
    )
    .orderBy(desc(sampleRequests.createdAt))
    .limit(limit);
  if (!rows.length) return [];

  const items = await getDb()
    .select()
    .from(sampleRequestItems)
    .where(sql`${sampleRequestItems.requestId} in ${rows.map(row => row.id)}`);
  const byRequest = new Map<number, SampleRequestItemRow[]>();
  for (const item of items) {
    const list = byRequest.get(item.requestId) ?? [];
    list.push(item);
    byRequest.set(item.requestId, list);
  }

  return rows.map(row => ({
    ...row,
    items: byRequest.get(row.id) ?? [],
    customerEmail: row.email,
    clientId: null,
  }));
}
