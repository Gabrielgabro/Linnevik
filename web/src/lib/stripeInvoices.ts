/** Stripe Invoicing → Linnevik order reconciliation. */

import type Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { raiseAlert } from '@/lib/opsAlerts';
import { abandonPendingOrder, markOrderFailed, markOrderPaid, reconcileOrderSession } from '@/lib/ordersDb';
import { sendOrderConfirmation } from '@/lib/orderEmails';

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

/**
 * Webhooks are the fast path. This daily backstop repairs a missed `invoice.paid`
 * and, critically, voids invoices that passed their due date before releasing
 * their stock reservation.
 */
export async function reconcileRecentStripeInvoices(): Promise<{
  checked: number;
  paid: number;
  voided: number;
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
  const attached = await getDb().execute(sql`
    select stripe_session_id
    from orders
    where payment_method = 'invoice' and payment_status = 'pending'
      and created_at >= now() - interval '90 days'
      and left(stripe_session_id, 3) = 'in_'
    order by created_at asc
    limit 100
  `);
  const references = (attached.rows as Array<{ stripe_session_id: string }>)
    .map(row => row.stripe_session_id);
  let paid = 0;
  let voided = 0;
  for (const id of references) {
    try {
      let invoice = await getStripe().invoices.retrieve(id);
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
      if (invoice.status === 'open' && invoice.due_date && invoice.due_date <= Math.floor(Date.now() / 1000)) {
        invoice = await getStripe().invoices.voidInvoice(invoice.id);
        await failStripeInvoice(invoice);
        voided += 1;
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
  return { checked: references.length, paid, voided, failures };
}
