/**
 * En fakturaorders liv efter att fakturan gjorts: bankbetalningen och
 * uppföljningen av förfallna fakturor (source_of_truth §9.7, §9.9).
 *
 * Ersätter Stripe Invoicing. Ingenting här frågar Stripe: fakturan är vår
 * egen, och den är betald när admin har registrerat bankbetalningen (§17.1).
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { InvoiceRow } from '@/lib/db/schema';
import { raiseAlert } from '@/lib/opsAlerts';
import { abandonPendingOrder, getOrderById, markOrderPaid } from '@/lib/ordersDb';
import { invoiceReminderSent, sendInvoiceEmail, sendOrderConfirmation } from '@/lib/orderEmails';
import { assessBankPayment, validatePaidOn, type BankPaymentAssessment } from '@/lib/invoicePayment';
import { currentInvoiceForOrder, invoiceById, invoicePdf, swedishDate } from '@/lib/invoicesDb';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hela dagar sedan förfallodagen, i svensk tid, eller 0 om den inte passerats. */
export function daysOverdue(dueOn: string | null, now = new Date()): number {
  if (!dueOn) return 0;
  const today = Date.parse(`${swedishDate(now)}T00:00:00Z`);
  const due = Date.parse(`${dueOn}T00:00:00Z`);
  return today > due ? Math.round((today - due) / DAY_MS) : 0;
}

/**
 * En förfallen faktura makuleras aldrig av sig själv (§9.7). Order #12
 * makulerades en gång medan kunden höll på att betala via banken. I stället:
 *
 * - dag 1: driftlarm, kolla banken och registrera det som kommit in
 * - dag 7: en påminnelse till kunden, en gång
 * - dag 14: driftlarm, fortfarande obetald efter påminnelsen
 * - dag 45: driftlarm, varorna är fortfarande reserverade och beslut behövs
 */
export const INVOICE_REMINDER_AFTER_DAYS = 7;
const OVERDUE_STAGES = [
  { days: 45, stage: 'decision', subject: (id: number, d: number) => `Order ${id}: fakturan är ${d} dagar försenad, beslut behövs` },
  { days: 14, stage: 'followup', subject: (id: number, d: number) => `Order ${id}: fakturan är obetald ${d} dagar efter förfallodagen` },
  { days: 1, stage: 'due', subject: (id: number) => `Order ${id}: fakturan har förfallit utan registrerad betalning` },
] as const;

const OVERDUE_ADVICE: Record<(typeof OVERDUE_STAGES)[number]['stage'], string> = {
  due: 'Kolla bankkontot. Har betalningen kommit in: registrera den på ordern. Annars skickas en påminnelse automatiskt dag 7.',
  followup: 'Påminnelsen är skickad. Ring eller mejla kunden, fakturan kan ha fastnat i deras attestflöde.',
  decision: 'Varorna är fortfarande reserverade. Avboka ordern (makulerar fakturan och släpper lagret) eller fortsätt vänta.',
};

async function followUpOverdueInvoice(invoice: InvoiceRow): Promise<{ reminded: boolean }> {
  const overdue = daysOverdue(invoice.dueOn);
  if (overdue < 1) return { reminded: false };
  const orderId = invoice.orderId;

  // Bara det högsta steget som nåtts larmar. Missade avstämningen några
  // nätter ska den inte skicka tre larm på en gång.
  const stage = OVERDUE_STAGES.find(candidate => overdue >= candidate.days);
  if (stage) {
    const recorded = await getDb().execute(sql`
      insert into order_events (order_id, kind, actor, detail)
      select ${orderId}, 'invoice.overdue', 'system',
             jsonb_build_object('stage', ${stage.stage}::text, 'days_overdue', ${overdue}::int,
                                'invoice', ${invoice.number}::int)
      where not exists (
        select 1 from order_events
        where order_id = ${orderId} and kind = 'invoice.overdue' and detail->>'stage' = ${stage.stage}
      )
      returning id
    `);
    if (recorded.rows.length > 0) {
      await raiseAlert({
        kind: 'invoice.overdue',
        key: `invoice-overdue:${invoice.number}:${stage.stage}`,
        subject: stage.subject(orderId, overdue),
        detail: {
          order: orderId,
          faktura: invoice.number,
          belopp: invoice.totalMinor,
          förföll: invoice.dueOn,
          åtgärd: OVERDUE_ADVICE[stage.stage],
        },
        href: `/admin/orders/${orderId}`,
      });
    }
  }

  if (overdue >= INVOICE_REMINDER_AFTER_DAYS && !(await invoiceReminderSent(orderId))) {
    // Ett misslyckat utskick larmar, och nästa natt försöker vi igen. Spärren
    // räknar bara det som gick fram.
    return { reminded: await sendInvoiceEmail(invoice, { reminder: true }) };
  }
  return { reminded: false };
}

/**
 * Den nattliga avstämningen av fakturaordrar.
 *
 * - Förfallna fakturor följs upp (se ovan).
 * - En fakturaorder utan faktura, äldre än en halvtimme, är ett försök som
 *   föll innan fakturan gjordes. Den släpps, så att lagret inte hålls för
 *   alltid. Varken numret eller fakturan finns, så inget går förlorat.
 * - En faktura vars pdf aldrig ritades ritas nu.
 */
export async function reconcileOpenInvoices(): Promise<{
  checked: number;
  overdue: number;
  reminded: number;
  abandoned: number;
  failures: string[];
}> {
  const failures: string[] = [];
  let abandoned = 0;
  const orphans = await getDb().execute(sql`
    select o.id from orders o
    where o.payment_method = 'invoice' and o.payment_status = 'pending' and o.status = 'pending'
      and o.created_at <= now() - interval '30 minutes'
      and not exists (select 1 from invoices i where i.order_id = o.id and i.kind = 'invoice')
    order by o.created_at asc
    limit 200
  `);
  for (const { id } of orphans.rows as Array<{ id: number }>) {
    try {
      await abandonPendingOrder(Number(id), 'Invoice was never issued');
      abandoned += 1;
    } catch (error) {
      failures.push(`order ${id}: ${error instanceof Error ? error.message : 'okänt fel'}`);
    }
  }

  const open = await getDb().execute(sql`
    select i.id from invoices i
    join orders o on o.id = i.order_id
    where i.kind = 'invoice' and i.voided_at is null
      and o.payment_status = 'pending' and o.status <> 'cancelled'
    order by i.number asc
    limit 500
  `);
  let overdue = 0;
  let reminded = 0;
  for (const { id } of open.rows as Array<{ id: number }>) {
    try {
      const invoice = await invoiceById(Number(id));
      if (!invoice) continue;
      if (!invoice.pdfBase64) await invoicePdf(invoice);
      if (daysOverdue(invoice.dueOn) >= 1) {
        overdue += 1;
        if ((await followUpOverdueInvoice(invoice)).reminded) reminded += 1;
      }
    } catch (error) {
      failures.push(`faktura-id ${id}: ${error instanceof Error ? error.message : 'okänt fel'}`);
    }
  }

  if (failures.length) {
    await raiseAlert({
      kind: 'reconcile.failed',
      key: 'reconcile:invoices',
      subject: `Fakturaavstämningen misslyckades för ${failures.length} ordrar`,
      detail: { fel: failures.slice(0, 10), kontrollerade: open.rows.length + orphans.rows.length },
    });
  }
  return { checked: open.rows.length, overdue, reminded, abandoned, failures };
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
 * En fakturabetalning som kommit in på bankgirot, registrerad i admin (§9.9).
 *
 * Ordern går sedan samma väg som en kortbetalning: `markOrderPaid` tar över
 * reservationen, och orderbekräftelsen skickas. Utan kontokoppling: en
 * manuell faktura skapar aldrig något webbkonto (§10.8).
 *
 * Vägrar hellre än att gissa. En delbetalning gör inte fakturan betald, och
 * en makulerad faktura kan inte betalas.
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
  if (PAID_STATUSES.includes(order.paymentStatus)) {
    await raiseAlert({
      kind: 'invoice.payment_mismatch',
      key: `invoice-double:${order.id}`,
      subject: `Order ${order.id}: en bankbetalning registrerades på en redan betald faktura`,
      detail: { order: order.id, bankbelopp: input.amountMinor },
      href: `/admin/orders/${order.id}`,
    });
    return refuse(409, 'Ordern är redan registrerad som betald. Har pengarna kommit två gånger ska den ena betalningen tillbaka till kunden.');
  }
  if (order.status === 'cancelled') {
    return refuse(
      409,
      'Ordern är avbokad och fakturan makulerad. Har kunden ändå betalat ska pengarna tillbaka från bankkontot, eller lägg en ny order.'
    );
  }
  if (order.paymentStatus !== 'pending') {
    return refuse(409, `Fakturan är inte längre öppen (status ${order.paymentStatus}).`);
  }
  const invoice = await currentInvoiceForOrder(order.id);
  if (!invoice) return refuse(409, 'Ordern har ingen gällande faktura att registrera betalningen mot.');
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    return refuse(400, 'Ange det belopp som kom in på kontot.');
  }
  const paidOn = validatePaidOn(input.paidOn, { orderCreatedAt: order.createdAt });
  if (!paidOn.ok) return refuse(400, paidOn.error);

  const assessment = assessBankPayment({ amountDueMinor: invoice.totalMinor, receivedMinor: input.amountMinor });
  if (assessment.kind === 'under') {
    const missing = (-assessment.differenceMinor / 100).toFixed(2).replace('.', ',');
    return refuse(409, `Det saknas ${missing} kr av fakturans belopp. Registrera betalningen när hela beloppet kommit in.`);
  }

  // Två samtidiga klick når båda hit. Spåret skrivs en gång, och
  // `markOrderPaid` gör ordern betald en gång.
  await getDb().execute(sql`
    insert into order_events (order_id, kind, actor, detail)
    select ${order.id}, 'payment.bank_registered', ${input.actor}, ${JSON.stringify({
      paid_on: paidOn.date,
      amount_minor: input.amountMinor,
      amount_due_minor: invoice.totalMinor,
      difference_minor: assessment.differenceMinor,
      invoice: invoice.number,
      note: input.note,
    })}::jsonb
    where not exists (
      select 1 from order_events where order_id = ${order.id} and kind = 'payment.bank_registered'
    )
  `);

  // Beloppen är fakturans och orderns, som är desamma. Kunduppgifterna är de
  // ordern redan har: bankbetalningen säger ingenting nytt om köparen.
  const paid = await markOrderPaid({
    sessionId: order.stripeSessionId,
    paymentIntentId: null,
    email: order.email,
    customerName: order.customerName,
    shippingAddress: order.shippingAddress ?? null,
    billingAddress: order.billingAddress ?? null,
    taxId: order.taxIdValue ? { type: order.taxIdType ?? 'org_no', value: order.taxIdValue } : null,
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    shippingMinor: order.shippingMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    currency: order.currency,
    linkAccount: false,
    actor: input.actor,
  });
  if (paid.newlyPaid) await sendOrderConfirmation(order.stripeSessionId);

  if (assessment.kind === 'over') {
    await raiseAlert({
      kind: 'invoice.payment_mismatch',
      key: `invoice-over:${invoice.number}`,
      subject: `Order ${order.id} är överbetald med ${(assessment.differenceMinor / 100).toFixed(2).replace('.', ',')} kr`,
      detail: {
        order: order.id,
        faktura: invoice.number,
        fakturabelopp: invoice.totalMinor,
        inbetalt: input.amountMinor,
        åtgärd: 'Betala tillbaka mellanskillnaden till kunden från bankkontot.',
      },
      href: `/admin/orders/${order.id}`,
    });
  }

  return { ok: true, orderId: order.id, assessment, newlyPaid: paid.newlyPaid, stockReady: paid.stockReady };
}

