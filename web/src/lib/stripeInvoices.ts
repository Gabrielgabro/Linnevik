/** Stripe Invoicing → Linnevik order reconciliation. */

import type Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { raiseAlert } from '@/lib/opsAlerts';
import { abandonPendingOrder, getOrderById, markOrderFailed, markOrderPaid, reconcileOrderSession } from '@/lib/ordersDb';
import { invoiceReminderSent, sendInvoiceReminder, sendOrderConfirmation } from '@/lib/orderEmails';
import type { InvoiceEmailDetails } from '@/lib/emailTemplates';
import {
  assessBankPayment,
  invoicePaymentDetailsOrNull,
  ocrForOrder,
  validatePaidOn,
  type BankPaymentAssessment,
} from '@/lib/invoicePayment';

function orderIdFromMetadata(invoice: Stripe.Invoice): number | null {
  const parsed = Number(invoice.metadata?.linnevik_order_id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function address(value: Stripe.Address | null | undefined): Record<string, string | null> | null {
  if (!value) return null;
  return {
    line1: value.line1 ?? null,
    line2: value.line2 ?? null,
    city: value.city ?? null,
    postal_code: value.postal_code ?? null,
    state: value.state ?? null,
    country: value.country ?? null,
  };
}

/** Repair the narrow Stripe-create → local-reference attachment failure window. */
export async function reconcileInvoiceReference(invoice: Stripe.Invoice): Promise<number | null> {
  return reconcileOrderSession(orderIdFromMetadata(invoice), invoice.id);
}

export async function applyStripeInvoice(invoice: Stripe.Invoice): Promise<{
  matched: boolean;
  newlyPaid: boolean;
  stockReady: boolean;
  orderId: number | null;
}> {
  const orderId = await reconcileInvoiceReference(invoice);
  if (!orderId) {
    if (invoice.status === 'paid') {
      await raiseAlert({
        kind: 'webhook.unmatched_session',
        key: `invoice:${invoice.id}`,
        subject: 'Betald Stripe-faktura utan order hos oss',
        detail: { invoice: invoice.id, belopp: invoice.total, valuta: invoice.currency },
      });
    }
    return { matched: false, newlyPaid: false, stockReady: false, orderId: null };
  }

  if (invoice.status !== 'paid') {
    return { matched: true, newlyPaid: false, stockReady: true, orderId };
  }

  const shippingMinor = Number(invoice.metadata?.linnevik_shipping_minor ?? '0');
  const discountMinor = (invoice.total_discount_amounts ?? []).reduce(
    (sum, discount) => sum + discount.amount,
    0
  );
  const taxMinor = (invoice.total_taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0);
  const billing = address(invoice.customer_address);
  const invoiceTaxId = invoice.metadata?.linnevik_tax_id ?? null;
  // `payments` is an includable, paginated field, so a paid invoice webhook
  // does not always carry the PaymentIntent inline. Fetch it when needed so
  // later refunds can still be matched to this order.
  let invoicePaymentIntent = invoice.payments?.data
    .find(payment => payment.status === 'paid')?.payment.payment_intent;
  if (!invoicePaymentIntent) {
    const payments = await getStripe().invoicePayments.list({
      invoice: invoice.id,
      status: 'paid',
      limit: 10,
    });
    invoicePaymentIntent = payments.data.find(payment => payment.status === 'paid')?.payment.payment_intent;
  }
  const paid = await markOrderPaid({
    sessionId: invoice.id,
    paymentIntentId:
      typeof invoicePaymentIntent === 'string' ? invoicePaymentIntent : invoicePaymentIntent?.id ?? null,
    email: invoice.customer_email ?? null,
    stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null,
    customerName: invoice.customer_name ?? null,
    shippingAddress: billing,
    billingAddress: billing,
    taxId: invoiceTaxId ? { type: 'org_no', value: invoiceTaxId } : null,
    subtotalMinor: Math.max(0, (invoice.subtotal ?? 0) - shippingMinor),
    discountMinor,
    shippingMinor,
    taxMinor,
    totalMinor: invoice.total,
    currency: invoice.currency ?? 'sek',
  });
  return { matched: true, newlyPaid: paid.newlyPaid, stockReady: paid.stockReady, orderId: paid.orderId };
}

/** A voided or written-off invoice must release its stock reservation. */
export async function failStripeInvoice(invoice: Stripe.Invoice): Promise<void> {
  if (await reconcileInvoiceReference(invoice)) await markOrderFailed(invoice.id, 'failed');
}

/** Det mejlen behöver veta om en faktura, ur Stripes fakturaobjekt. */
export function invoiceEmailDetails(invoice: Stripe.Invoice, orderId: number): InvoiceEmailDetails {
  return {
    hostedUrl: invoice.hosted_invoice_url ?? null,
    number: invoice.number ?? null,
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    payment: invoicePaymentDetailsOrNull(),
    // Fakturor från före bankgirot saknar numret i metadata; det härleds
    // likadant ur ordernumret, så det blir samma nummer ändå.
    ocr: invoice.metadata?.linnevik_ocr || ocrForOrder(orderId),
  };
}

const DAY_SECONDS = 24 * 60 * 60;

/** Dagar sedan förfallodagen, eller 0 om den inte passerats. */
export function daysOverdue(dueDate: number | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): number {
  if (!dueDate || nowSeconds <= dueDate) return 0;
  return Math.floor((nowSeconds - dueDate) / DAY_SECONDS);
}

/**
 * En förfallen faktura makuleras inte längre automatiskt.
 *
 * Förr voidades den natten efter förfallodagen. Men en svensk företagskund
 * betalar från sin bank, utanför Stripe, och en betalning kan ligga några
 * bankdagar på väg eller fastna i ett attestflöde — order #12 makulerades
 * medan kunden höll på att betala. Nu följer avstämningen upp i steg:
 *
 * - dag 1: larm till oss — kolla banken och registrera det som kommit in
 * - dag 7: en vänlig betalningspåminnelse till kunden, en gång
 * - dag 14: larm — fortfarande obetald efter påminnelsen, hör av er
 * - dag 45: larm — varorna är fortfarande reserverade; beslut behövs
 *
 * Att makulera är ett beslut som fattas i admin genom att avbeställa ordern.
 */
export const INVOICE_REMINDER_AFTER_DAYS = 7;
const OVERDUE_STAGES = [
  { days: 45, stage: 'decision', subject: (id: number, d: number) => `Order ${id}: fakturan är ${d} dagar försenad — beslut behövs` },
  { days: 14, stage: 'followup', subject: (id: number, d: number) => `Order ${id}: fakturan är obetald ${d} dagar efter förfallodagen` },
  { days: 1, stage: 'due', subject: (id: number) => `Order ${id}: fakturan har förfallit utan registrerad betalning` },
] as const;

const OVERDUE_ADVICE: Record<(typeof OVERDUE_STAGES)[number]['stage'], string> = {
  due: 'Kolla bankkontot. Har betalningen kommit in: registrera den på orderkortet. Annars skickas en påminnelse automatiskt.',
  followup: 'Påminnelsen är skickad. Ring eller mejla kunden — fakturan kan ha fastnat i deras attestflöde.',
  decision: 'Varorna är fortfarande reserverade. Avbeställ ordern (makulerar fakturan och släpper lagret) eller fortsätt vänta.',
};

async function followUpOverdueInvoice(orderId: number, invoice: Stripe.Invoice): Promise<{ reminded: boolean }> {
  const overdue = daysOverdue(invoice.due_date);
  if (overdue < 1) return { reminded: false };

  // Bara det högsta steget som nåtts larmar. Missade avstämningen några
  // nätter ska den inte skicka tre larm på en gång.
  const stage = OVERDUE_STAGES.find(candidate => overdue >= candidate.days);
  if (stage) {
    const recorded = await getDb().execute(sql`
      insert into order_events (order_id, kind, actor, detail)
      select ${orderId}, 'invoice.overdue', 'system',
             jsonb_build_object('stage', ${stage.stage}::text, 'days_overdue', ${overdue}::int)
      where not exists (
        select 1 from order_events
        where order_id = ${orderId} and kind = 'invoice.overdue' and detail->>'stage' = ${stage.stage}
      )
      returning id
    `);
    if (recorded.rows.length > 0) {
      await raiseAlert({
        kind: 'invoice.overdue',
        key: `invoice-overdue:${invoice.id}:${stage.stage}`,
        subject: stage.subject(orderId, overdue),
        detail: {
          order: orderId,
          faktura: invoice.number ?? invoice.id,
          belopp: invoice.amount_remaining,
          förföll: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10) : null,
          åtgärd: OVERDUE_ADVICE[stage.stage],
        },
        href: `/admin/orders/${orderId}`,
      });
    }
  }

  if (overdue >= INVOICE_REMINDER_AFTER_DAYS && !(await invoiceReminderSent(orderId))) {
    // Ett misslyckat utskick loggas och larmar i sendInvoiceReminder, och
    // nästa natt försöker vi igen — spärren räknar bara det som gick fram.
    const reminded = await sendInvoiceReminder(orderId, {
      ...invoiceEmailDetails(invoice, orderId),
      amountDueMinor: invoice.amount_remaining,
    });
    return { reminded };
  }
  return { reminded: false };
}

/**
 * Webhooks are the fast path. This daily backstop repairs a missed
 * `invoice.paid`, cleans up interrupted drafts, and follows up overdue
 * invoices (see `followUpOverdueInvoice`) — it never voids one on its own.
 */
export async function reconcileRecentStripeInvoices(): Promise<{
  checked: number;
  paid: number;
  overdue: number;
  reminded: number;
  failures: string[];
}> {
  const pending = await getDb().execute(sql`
    select id, stripe_session_id
    from orders
    where payment_method = 'invoice' and payment_status = 'pending'
      and created_at >= now() - interval '90 days'
      -- An order still inside its creation window may simply be mid-request.
      -- Stripe's search index also lags a little behind writes, so anything
      -- younger than this is left for the request that owns it.
      and created_at <= now() - interval '30 minutes'
    order by created_at asc
    limit 100
  `);
  const rows = pending.rows as Array<{ id: number; stripe_session_id: string }>;
  const failures: string[] = [];
  // Orders whose Stripe reference never arrived: the invoice call was cut off
  // between reserving stock and hearing back. Generic expiry skips invoice
  // orders on purpose, and the loop below only knows `in_` references, so
  // without this these held their reservation for good. Ask Stripe whether the
  // invoice exists — the order id travels in its metadata — and either adopt
  // it or release the order.
  const unattached = rows.filter(row => row.stripe_session_id.startsWith('pending_'));
  for (const row of unattached) {
    try {
      const found = await getStripe().invoices.search({
        query: `metadata['linnevik_order_id']:'${row.id}'`,
        limit: 1,
      });
      const orphan = found.data[0];
      if (orphan) {
        await reconcileInvoiceReference(orphan);
      } else {
        await abandonPendingOrder(row.id, 'Invoice was never created in Stripe');
      }
    } catch (error) {
      failures.push(`order ${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  // Re-read: an adopted orphan now carries an `in_` reference and belongs in
  // the pass below, which decides whether it is paid, void, draft or overdue.
  // Ingen åldersgräns här: en faktura som är obetald efter 90 dagar är
  // precis den som behöver följas upp, och en sen betalning ska fortfarande
  // fångas om webhooken missade den. Öppna fakturor är få.
  const attached = await getDb().execute(sql`
    select id, stripe_session_id
    from orders
    where payment_method = 'invoice' and payment_status = 'pending'
      and status <> 'cancelled'
      and left(stripe_session_id, 3) = 'in_'
    order by created_at asc
    limit 200
  `);
  const references = (attached.rows as Array<{ id: number; stripe_session_id: string }>)
    .map(row => ({ orderId: Number(row.id), id: row.stripe_session_id }));
  let paid = 0;
  let overdue = 0;
  let reminded = 0;
  for (const { orderId, id } of references) {
    try {
      const invoice = await getStripe().invoices.retrieve(id);
      if (invoice.status === 'paid') {
        const result = await applyStripeInvoice(invoice);
        if (result.newlyPaid) {
          paid += 1;
          await sendOrderConfirmation(invoice.id);
        }
        continue;
      }
      if (invoice.status === 'void' || invoice.status === 'uncollectible') {
        await failStripeInvoice(invoice);
        continue;
      }
      // A draft left by an interrupted construction never becomes payable and
      // used to reserve stock forever. By the time the daily backstop sees it,
      // no checkout request can still be assembling it: delete the draft and
      // fail the local order so the reservation and cart are released.
      if (invoice.status === 'draft') {
        await getStripe().invoices.del(invoice.id);
        await failStripeInvoice(invoice);
        continue;
      }
      if (invoice.status === 'open' && daysOverdue(invoice.due_date) >= 1) {
        overdue += 1;
        const followUp = await followUpOverdueInvoice(orderId, invoice);
        if (followUp.reminded) reminded += 1;
      }
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  if (failures.length) {
    await raiseAlert({
      kind: 'reconcile.failed',
      key: 'reconcile:invoices',
      subject: `Fakturaavstämningen misslyckades för ${failures.length} fakturor`,
      detail: { fel: failures.slice(0, 10), kontrollerade: references.length + unattached.length },
    });
  }
  return { checked: references.length, paid, overdue, reminded, failures };
}

export type BankPaymentResult =
  | {
      ok: true;
      orderId: number;
      assessment: BankPaymentAssessment;
      /** Ordern blev betald just nu (och orderbekräftelsen gick ut). */
      newlyPaid: boolean;
      stockReady: boolean;
    }
  | { ok: false; status: number; error: string };

function refuse(status: number, error: string): BankPaymentResult {
  return { ok: false, status, error };
}

const PAID_STATUSES = ['paid', 'partially_refunded', 'refunded'];

/**
 * En fakturabetalning som kommit in på bankkontot, registrerad i admin.
 *
 * Fakturan markeras betald i Stripe "utanför Stripe" (`paid_out_of_band`), så
 * att Stripe, ordern och bokföringsunderlaget säger samma sak. Därefter går
 * ordern exakt samma väg som en kortbetalning: `markOrderPaid` plockar
 * reservationen, och orderbekräftelsen skickas.
 *
 * Vägrar hellre än att gissa. En delbetalning gör inte fakturan betald, en
 * makulerad faktura kan inte betalas, och en faktura som redan betalats med
 * kort betyder att pengarna kommit två gånger.
 */
export async function registerBankPayment(input: {
  orderId: number;
  amountMinor: number;
  paidOn: unknown;
  note: string | null;
  actor: string;
}): Promise<BankPaymentResult> {
  const order = await getOrderById(input.orderId);
  if (!order) return refuse(404, 'Ordern finns inte.');
  if (order.paymentMethod !== 'invoice') return refuse(409, 'Bara fakturaordrar kan registreras som betalda via bank.');
  if (!order.stripeSessionId.startsWith('in_')) {
    return refuse(409, 'Ordern har ingen skickad faktura — det finns inget att registrera betalningen mot.');
  }
  if (PAID_STATUSES.includes(order.paymentStatus)) return refuse(409, 'Ordern är redan registrerad som betald.');
  if (order.status === 'cancelled') {
    return refuse(
      409,
      'Ordern är avbeställd och fakturan makulerad. Har kunden ändå betalat ska pengarna tillbaka från bankkontot — eller lägg en ny order.'
    );
  }
  if (order.paymentStatus !== 'pending') {
    return refuse(
      409,
      `Fakturan är inte längre öppen (status ${order.paymentStatus}). Har kunden ändå betalat: betala tillbaka från bankkontot eller lägg en ny order.`
    );
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    return refuse(400, 'Ange det belopp som kom in på kontot.');
  }
  const paidOn = validatePaidOn(input.paidOn, { orderCreatedAt: order.createdAt });
  if (!paidOn.ok) return refuse(400, paidOn.error);

  const invoice = await getStripe().invoices.retrieve(order.stripeSessionId);
  if (invoice.status === 'paid') {
    // Fakturan betalades i Stripe — med kort på fakturasidan — medan
    // bankbetalningen var på väg. Ordern synkas, men pengarna har kommit två
    // gånger och ena betalningen ska tillbaka.
    const applied = await applyStripeInvoice(invoice);
    if (applied.newlyPaid) await sendOrderConfirmation(invoice.id);
    await raiseAlert({
      kind: 'invoice.payment_mismatch',
      key: `invoice-double:${invoice.id}`,
      subject: `Order ${order.id}: fakturan var redan betald i Stripe — möjlig dubbelbetalning`,
      detail: { order: order.id, faktura: invoice.number ?? invoice.id, bankbelopp: input.amountMinor, betalningsdag: paidOn.date },
      href: `/admin/orders/${order.id}`,
    });
    return refuse(
      409,
      'Fakturan är redan betald i Stripe (troligen med kort). Har pengarna också kommit in på bankkontot är det en dubbelbetalning — betala tillbaka bankbeloppet till kunden.'
    );
  }
  if (invoice.status === 'void' || invoice.status === 'uncollectible') {
    await failStripeInvoice(invoice);
    return refuse(409, 'Fakturan är makulerad i Stripe och kan inte betalas. Betala tillbaka beloppet från bankkontot eller lägg en ny order.');
  }
  if (invoice.status !== 'open') return refuse(409, 'Fakturan har aldrig skickats till kunden.');

  const assessment = assessBankPayment({ amountDueMinor: invoice.amount_remaining, receivedMinor: input.amountMinor });
  if (assessment.kind === 'under') {
    const missing = (-assessment.differenceMinor / 100).toFixed(2).replace('.', ',');
    return refuse(
      409,
      `Det saknas ${missing} kr av fakturans belopp. Registrera betalningen när hela beloppet kommit in. Har ni kommit överens om ett lägre pris: kreditera mellanskillnaden på fakturan i Stripe först.`
    );
  }

  await getStripe().invoices.update(invoice.id, {
    metadata: {
      linnevik_bank_paid_on: paidOn.date,
      linnevik_bank_amount_minor: String(input.amountMinor),
      linnevik_bank_registered_by: input.actor.slice(0, 200),
    },
  });
  let paidInvoice: Stripe.Invoice;
  try {
    paidInvoice = await getStripe().invoices.pay(
      invoice.id,
      { paid_out_of_band: true },
      { idempotencyKey: `linnevik_invoice_bank_${invoice.id}` }
    );
  } catch (error) {
    // Ett tappat svar kan betyda att anropet gick igenom. Fråga Stripe.
    const current = await getStripe().invoices.retrieve(invoice.id);
    if (current.status !== 'paid') {
      console.error('[BankPayment] Stripe refused to mark the invoice paid:', error);
      return refuse(502, 'Stripe kunde inte markera fakturan som betald. Ingenting är ändrat — försök igen.');
    }
    paidInvoice = current;
  }

  // Två samtidiga klick når båda hit — Stripe-anropet är idempotent, och
  // spåret ska vara det också.
  await getDb().execute(sql`
    insert into order_events (order_id, kind, actor, detail)
    select ${order.id}, 'payment.bank_registered', ${input.actor}, ${JSON.stringify({
      paid_on: paidOn.date,
      amount_minor: input.amountMinor,
      amount_due_minor: invoice.amount_remaining,
      difference_minor: assessment.differenceMinor,
      invoice: invoice.number ?? invoice.id,
      note: input.note,
    })}::jsonb
    where not exists (
      select 1 from order_events where order_id = ${order.id} and kind = 'payment.bank_registered'
    )
  `);

  const applied = await applyStripeInvoice(paidInvoice);
  if (applied.newlyPaid) await sendOrderConfirmation(paidInvoice.id);

  if (assessment.kind === 'over') {
    await raiseAlert({
      kind: 'invoice.payment_mismatch',
      key: `invoice-over:${invoice.id}`,
      subject: `Order ${order.id} är överbetald med ${(assessment.differenceMinor / 100).toFixed(2).replace('.', ',')} kr`,
      detail: {
        order: order.id,
        faktura: invoice.number ?? invoice.id,
        fakturabelopp: invoice.amount_remaining,
        inbetalt: input.amountMinor,
        åtgärd: 'Betala tillbaka mellanskillnaden till kunden från bankkontot.',
      },
      href: `/admin/orders/${order.id}`,
    });
  }

  return {
    ok: true,
    orderId: order.id,
    assessment,
    newlyPaid: applied.newlyPaid,
    stockReady: applied.stockReady,
  };
}
