/**
 * Egna fakturor och kreditfakturor (source_of_truth §9, A17).
 *
 * - Numret tas ur en obruten serie och fakturan skrivs i samma sats (§9.5).
 *   Antingen finns båda eller ingen, och ett nummer försvinner aldrig.
 * - Fakturan är en ögonblicksbild. Beloppen kommer från ordern, som redan är
 *   en ögonblicksbild (§8.2), så fakturan kan inte säga något annat än ordern.
 * - Pdf:en ritas ur raden och sparas på den (§9.6). Fallerar ritningen står
 *   fakturan kvar med sitt nummer, och pdf:en ritas nästa gång den behövs.
 */

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  invoices,
  orderItems,
  orders,
  type InvoiceBuyer,
  type InvoiceLineSnapshot,
  type InvoiceRow,
  type InvoiceSeller,
} from '@/lib/db/schema';
import { invoicePaymentDetails, ocrForOrder } from '@/lib/invoicePayment';
import { renderInvoicePdf, type InvoiceDocument } from '@/lib/invoicePdf';
import { normalizeCompanyRegistrationNumber, swedishOrganizationNumber } from '@/lib/companyRegistration';
import { vatBps as currentVatBps } from '@/lib/vat';
import { isUniqueViolation } from '@/lib/adminRoute';

/** Betalningsvillkoret på sajten (köpvillkoren §4) och förvalet i admin. */
export const INVOICE_DUE_DAYS = 30;

/** Mottagaren som kassan och admin validerat (`resolveCompanyProfile`). */
export type InvoiceProfile = {
  email: string;
  organizationNumber: string;
  companyName: string;
  address: { line1: string; line2?: string | null; postal_code: string; city: string; country?: string | null };
};

export class InvoiceError extends Error {
  constructor(
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'InvoiceError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Datumet i svensk tid, som det står på fakturan. */
export function swedishDate(at: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(at);
}

/**
 * Säljaren som den står på fakturan. Uppgifterna ligger i env så att en
 * ändring av bolagsuppgifterna inte kräver en deploy. Bankgirot är det som
 * kassan och admin redan kräver (§7.8).
 */
export function sellerSnapshot(env: Record<string, string | undefined> = process.env): InvoiceSeller {
  const payment = invoicePaymentDetails(env);
  const orgNumber = env.INVOICE_SELLER_ORG_NUMBER?.trim() || '559307-2951';
  const bank = payment.bankAccount;
  return {
    name: env.INVOICE_SELLER_NAME?.trim() || 'Linneviken AB',
    orgNumber,
    vatNumber: env.INVOICE_SELLER_VAT_NUMBER?.trim() || normalizeCompanyRegistrationNumber(orgNumber),
    address: {
      line1: env.INVOICE_SELLER_ADDRESS_LINE1?.trim() || 'Himmelsbodavägen 15',
      line2: null,
      postalCode: env.INVOICE_SELLER_POSTAL_CODE?.trim() || '147 39',
      city: env.INVOICE_SELLER_CITY?.trim() || 'Tumba',
      country: 'SE',
    },
    fTax: (env.INVOICE_SELLER_F_TAX ?? 'true') === 'true',
    // Styrelsens säte ska stå på fakturor (aktiebolagslagen). Uppsala,
    // bekräftat av Gabriel 2026-11-26.
    seat: env.INVOICE_SELLER_SEAT?.trim() || 'Uppsala',
    bankgiro: payment.bankgiro,
    bankAccount: bank ? `${bank.bank ? `${bank.bank} ` : ''}${bank.clearing}-${bank.account}` : null,
    contactEmail: env.INVOICE_SELLER_EMAIL?.trim() || 'info@linnevik.se',
  };
}

/** Köparen som den står på fakturan, med org-nummer i båda formerna (§11.2). */
export function buyerSnapshot(input: {
  companyName: string;
  organizationNumber: string;
  address: { line1: string; line2?: string | null; postal_code: string; city: string; country?: string | null };
  email: string;
  customerNo?: string | null;
  reference?: string | null;
  purchaseOrder?: string | null;
}): InvoiceBuyer {
  const vatNumber = normalizeCompanyRegistrationNumber(input.organizationNumber) || null;
  return {
    name: input.companyName,
    orgNumber: (vatNumber && swedishOrganizationNumber(vatNumber)) || null,
    vatNumber,
    address: {
      line1: input.address.line1,
      line2: input.address.line2 || null,
      postalCode: input.address.postal_code,
      city: input.address.city,
      country: input.address.country || 'SE',
    },
    email: input.email,
    customerNo: input.customerNo ?? null,
    reference: input.reference?.trim() || null,
    purchaseOrder: input.purchaseOrder?.trim() || null,
  };
}

function documentFor(row: InvoiceRow, creditsNumber: number | null): InvoiceDocument {
  const issuedOn = swedishDate(row.issuedAt);
  const dueDays = row.dueOn
    ? Math.round((Date.parse(`${row.dueOn}T00:00:00Z`) - Date.parse(`${issuedOn}T00:00:00Z`)) / DAY_MS)
    : null;
  return {
    kind: row.kind,
    number: row.number,
    issuedOn,
    dueOn: row.dueOn,
    creditsNumber,
    orderId: row.orderId,
    currency: row.currency,
    seller: row.seller,
    buyer: row.buyer,
    lines: row.lines,
    goodsMinor: row.goodsMinor,
    discountMinor: row.discountMinor,
    shippingMinor: row.shippingMinor,
    netMinor: row.netMinor,
    vatBps: row.vatBps,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    ocr: row.ocr,
    memo: row.memo,
    dueDays,
  };
}

/** Pdf:en för en faktura: den sparade, annars ritas och sparas den nu. */
export async function invoicePdf(row: InvoiceRow): Promise<Uint8Array> {
  if (row.pdfBase64) return Uint8Array.from(Buffer.from(row.pdfBase64, 'base64'));
  let creditsNumber: number | null = null;
  if (row.creditsInvoiceId) {
    const [credited] = await getDb()
      .select({ number: invoices.number })
      .from(invoices)
      .where(eq(invoices.id, row.creditsInvoiceId));
    creditsNumber = credited?.number ?? null;
  }
  const bytes = await renderInvoicePdf(documentFor(row, creditsNumber));
  await getDb()
    .update(invoices)
    .set({ pdfBase64: Buffer.from(bytes).toString('base64') })
    .where(and(eq(invoices.id, row.id), isNull(invoices.pdfBase64)));
  return bytes;
}

/**
 * Ställer ut fakturan för en order. Beloppen och raderna kommer från ordern.
 * Ordern får redan ha en gällande faktura bara om det är just den här, och
 * då returneras den i stället för att en ny görs (ett omsänt anrop).
 */
export async function issueInvoiceForOrder(input: {
  orderId: number;
  buyer: InvoiceBuyer;
  dueDays: number;
  memo?: string | null;
  actor: string;
  seller?: InvoiceSeller;
}): Promise<InvoiceRow> {
  if (!Number.isInteger(input.dueDays) || input.dueDays < 1 || input.dueDays > 120) {
    throw new InvoiceError('Förfallotiden ska vara 1–120 dagar.', 400);
  }
  const existing = await currentInvoiceForOrder(input.orderId);
  if (existing) return existing;

  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) throw new InvoiceError('Ordern finns inte.', 404);
  if (order.paymentMethod !== 'invoice') throw new InvoiceError('Ordern är inte en fakturaorder.');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  if (!items.length) throw new InvoiceError('Ordern har inga rader.');

  const lines: InvoiceLineSnapshot[] = items.map(item => ({
    title: item.title,
    sku: item.sku,
    quantity: item.quantity,
    unitAmountMinor: item.unitAmountMinor,
    amountMinor: item.unitAmountMinor * item.quantity,
  }));
  const goodsMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const netMinor = goodsMinor - order.discountMinor + order.shippingMinor;
  if (netMinor + order.taxMinor !== order.totalMinor) {
    throw new InvoiceError(`Orderns belopp går inte ihop (order #${order.id}). Ingen faktura gjordes.`, 500);
  }

  const issuedAt = new Date();
  const dueOn = swedishDate(new Date(issuedAt.getTime() + input.dueDays * DAY_MS));
  const seller = input.seller ?? sellerSnapshot();

  // Numret och fakturan i en och samma sats (§9.5). Ingen `on conflict`: den
  // hade låtit räknaren gå upp fast ingen faktura skrevs, och lämnat en lucka.
  // En krock blir i stället ett fel som rullar tillbaka hela satsen.
  let result;
  try {
    result = await db.execute(sql`
    with next as (
      update invoice_numbers set last_number = last_number + 1 where id returning last_number
    )
    insert into invoices (
      number, kind, order_id, issued_at, due_on, currency, seller, buyer, lines,
      goods_minor, discount_minor, shipping_minor, net_minor, vat_bps, tax_minor, total_minor,
      ocr, memo, created_by
    )
    select next.last_number, 'invoice', ${order.id}, ${issuedAt.toISOString()}::timestamptz, ${dueOn}::date,
      ${order.currency}, ${JSON.stringify(seller)}::jsonb, ${JSON.stringify(input.buyer)}::jsonb,
      ${JSON.stringify(lines)}::jsonb, ${goodsMinor}, ${order.discountMinor}, ${order.shippingMinor},
      ${netMinor}, ${order.vatBps ?? currentVatBps()}, ${order.taxMinor}, ${order.totalMinor},
      ${ocrForOrder(order.id)}, ${input.memo?.trim() || null}, ${input.actor}
    from next
    returning id
  `);
  } catch (error) {
    // Två samtidiga anrop: det andra krockar med det förstas faktura och läser den.
    if (!isUniqueViolation(error, 'invoices_one_open_per_order')) throw error;
    result = null;
  }
  const id = (result?.rows[0] as { id: number } | undefined)?.id;
  const row = id ? await invoiceById(Number(id)) : await currentInvoiceForOrder(input.orderId);
  if (!row) throw new InvoiceError('Fakturan kunde inte skapas.', 500);

  await db
    .update(orders)
    .set({ stripeSessionId: invoiceReference(row.number), updatedAt: new Date() })
    .where(and(eq(orders.id, order.id), sql`${orders.stripeSessionId} like 'pending_%'`));

  // Pdf:en direkt. Misslyckas den ritas den nästa gång den hämtas.
  try {
    await invoicePdf(row);
  } catch (error) {
    console.error(`[Invoice] Could not render the pdf for invoice ${row.number}:`, error);
  }
  return (await invoiceById(row.id))!;
}

/**
 * Orderns referens när den har en egen faktura. Står i `stripe_session_id`,
 * som är orderns unika betalreferens oavsett betalsätt.
 */
export function invoiceReference(number: number): string {
  return `faktura_${number}`;
}

export async function invoiceById(id: number): Promise<InvoiceRow | null> {
  const [row] = await getDb().select().from(invoices).where(eq(invoices.id, id));
  return row ?? null;
}

/** Orderns gällande faktura, eller null. */
export async function currentInvoiceForOrder(orderId: number): Promise<InvoiceRow | null> {
  const [row] = await getDb()
    .select()
    .from(invoices)
    .where(and(eq(invoices.orderId, orderId), eq(invoices.kind, 'invoice'), isNull(invoices.voidedAt)));
  return row ?? null;
}

/** Alla fakturor och kreditfakturor på en order, äldst först. */
export async function invoicesForOrder(orderId: number): Promise<InvoiceRow[]> {
  return getDb().select().from(invoices).where(eq(invoices.orderId, orderId)).orderBy(asc(invoices.number));
}

/**
 * Makulerar orderns gällande faktura. Den står kvar med sitt nummer (§9.5).
 * Svarar falskt om ordern inte hade någon.
 */
export async function voidInvoiceForOrder(orderId: number, actor: string): Promise<boolean> {
  const rows = await getDb()
    .update(invoices)
    .set({ voidedAt: new Date(), voidedBy: actor })
    .where(and(eq(invoices.orderId, orderId), eq(invoices.kind, 'invoice'), isNull(invoices.voidedAt)))
    .returning({ id: invoices.id });
  return rows.length > 0;
}

/**
 * Kreditfakturan för en återbetalning av en fakturaorder (§8.11, §9.8).
 *
 * Den hänvisar till fakturan den krediterar och får nästa nummer i samma
 * serie (§9.5). En hel återbetalning krediterar fakturans alla rader. En
 * delåterbetalning blir en rad med beloppet, och momsen räknas i samma
 * proportion som återbetalningen (`refundVatMinor`). Samma återbetalning ger
 * aldrig två kreditfakturor (unikt `refund_id`).
 */
export async function issueCreditNote(input: {
  refundId: number;
  amountMinor: number;
  taxMinor: number;
  actor: string;
}): Promise<InvoiceRow> {
  const db = getDb();
  const [existing] = await db.select().from(invoices).where(eq(invoices.refundId, input.refundId));
  if (existing) return existing;

  const [refund] = await db.execute(sql`select order_id from refunds where id = ${input.refundId}`).then(r => r.rows as Array<{ order_id: number }>);
  if (!refund) throw new InvoiceError('Återbetalningen finns inte.', 404);
  const orderId = Number(refund.order_id);
  const credited = await currentInvoiceForOrder(orderId);
  if (!credited) throw new InvoiceError('Ordern har ingen gällande faktura att kreditera.');
  if (input.amountMinor < 1 || input.amountMinor > credited.totalMinor) {
    throw new InvoiceError('Beloppet ryms inte i fakturan.', 400);
  }

  const full = input.amountMinor === credited.totalMinor;
  const netMinor = input.amountMinor - input.taxMinor;
  const lines: InvoiceLineSnapshot[] = full
    ? credited.lines
    : [{ title: `Kreditering av faktura ${credited.number}`, sku: null, quantity: 1, unitAmountMinor: netMinor, amountMinor: netMinor }];
  const amounts = full
    ? {
        goods: credited.goodsMinor,
        discount: credited.discountMinor,
        shipping: credited.shippingMinor,
        net: credited.netMinor,
        tax: credited.taxMinor,
        total: credited.totalMinor,
      }
    : { goods: netMinor, discount: 0, shipping: 0, net: netMinor, tax: input.taxMinor, total: input.amountMinor };

  let result;
  try {
    result = await db.execute(sql`
      with next as (
        update invoice_numbers set last_number = last_number + 1 where id returning last_number
      )
      insert into invoices (
        number, kind, order_id, credits_invoice_id, refund_id, currency, seller, buyer, lines,
        goods_minor, discount_minor, shipping_minor, net_minor, vat_bps, tax_minor, total_minor, created_by
      )
      select next.last_number, 'credit', ${orderId}, ${credited.id}, ${input.refundId}, ${credited.currency},
        ${JSON.stringify(credited.seller)}::jsonb, ${JSON.stringify(credited.buyer)}::jsonb, ${JSON.stringify(lines)}::jsonb,
        ${amounts.goods}, ${amounts.discount}, ${amounts.shipping}, ${amounts.net}, ${credited.vatBps},
        ${amounts.tax}, ${amounts.total}, ${input.actor}
      from next
      returning id
    `);
  } catch (error) {
    if (!isUniqueViolation(error, 'invoices_refund_id_key')) throw error;
    result = null;
  }
  const id = (result?.rows[0] as { id: number } | undefined)?.id;
  const row = id
    ? await invoiceById(Number(id))
    : (await db.select().from(invoices).where(eq(invoices.refundId, input.refundId)))[0] ?? null;
  if (!row) throw new InvoiceError('Kreditfakturan kunde inte skapas.', 500);
  try {
    await invoicePdf(row);
  } catch (error) {
    console.error(`[Invoice] Could not render the pdf for credit note ${row.number}:`, error);
  }
  return (await invoiceById(row.id))!;
}
