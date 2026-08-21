import type Stripe from 'stripe';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { releaseExpiredReservations } from '@/lib/inventoryDb';
import { sendOrderConfirmation } from '@/lib/orderEmails';
import {
  markOrderFailed,
  markOrderPaid,
  reconcileOrderSession,
} from '@/lib/ordersDb';

function orderIdFromMetadata(session: Stripe.Checkout.Session): number | null {
  const parsed = Number(session.metadata?.linnevik_order_id);
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

/**
 * Link a Stripe session to an existing Linnevik order. The metadata fallback
 * repairs the narrow failure window between sessions.create and attachSession.
 */
export async function reconcileCheckoutSessionReference(
  session: Stripe.Checkout.Session
): Promise<number | null> {
  return reconcileOrderSession(orderIdFromMetadata(session), session.id);
}

export type CheckoutSessionResult = {
  matched: boolean;
  paid: boolean;
  newlyPaid: boolean;
  stockReady: boolean;
  orderId: number | null;
};

/** Apply the current Stripe Checkout state to the local order, idempotently. */
export async function applyCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<CheckoutSessionResult> {
  const orderId = await reconcileCheckoutSessionReference(session);
  if (!orderId) {
    console.warn('[Stripe checkout] Ignoring session without a matching Linnevik order:', session.id);
    return { matched: false, paid: false, newlyPaid: false, stockReady: false, orderId: null };
  }

  if (session.status === 'expired') {
    await markOrderFailed(session.id, 'expired');
    return { matched: true, paid: false, newlyPaid: false, stockReady: true, orderId };
  }

  if (session.payment_status === 'unpaid') {
    return { matched: true, paid: false, newlyPaid: false, stockReady: true, orderId };
  }

  const details = session.customer_details;
  const legacy = session as unknown as {
    shipping_details?: { name?: string | null; address?: Stripe.Address | null } | null;
  };
  const shipping =
    session.collected_information?.shipping_details ?? legacy.shipping_details ?? null;
  const shippingAsLineItem = session.metadata?.linnevik_shipping_as_line_item === 'true';
  const shippingFromMetadata = Number(session.metadata?.linnevik_shipping_minor ?? '');
  const shippingMinor =
    shippingAsLineItem && Number.isFinite(shippingFromMetadata)
      ? shippingFromMetadata
      : session.total_details?.amount_shipping ?? 0;
  const subtotalMinor = Math.max(
    0,
    (session.amount_subtotal ?? 0) - (shippingAsLineItem ? shippingMinor : 0)
  );
  const collectedTaxId = details?.tax_ids?.find(taxId => taxId.value);

  const paid = await markOrderPaid({
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    email: details?.email ?? null,
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
    phone: details?.phone ?? null,
    customerNo: session.metadata?.linnevik_customer_no ?? null,
    customerName: shipping?.name ?? details?.name ?? null,
    shippingAddress: address(shipping?.address),
    billingAddress: address(details?.address),
    taxId: collectedTaxId?.value
      ? { type: collectedTaxId.type, value: collectedTaxId.value }
      : null,
    subtotalMinor,
    discountMinor: session.total_details?.amount_discount ?? 0,
    shippingMinor,
    taxMinor: session.total_details?.amount_tax ?? 0,
    totalMinor: session.amount_total ?? 0,
    currency: session.currency ?? 'sek',
  });

  return {
    matched: true,
    paid: true,
    newlyPaid: paid.newlyPaid,
    stockReady: paid.stockReady,
    orderId: paid.orderId,
  };
}

/**
 * Backstop for lost/delayed webhooks and the session-attachment failure
 * window. It is intentionally bounded: recent unresolved orders plus the most
 * recent 100 Stripe sessions are enough for the scheduled ten-minute cadence.
 */
export async function reconcileRecentCheckoutSessions(): Promise<{
  checked: number;
  repaired: number;
  paid: number;
  stockExceptions: number;
  releasedReservations: number;
  failures: string[];
}> {
  const pending = await getDb().execute(sql`
    select id, stripe_session_id
    from orders
    where payment_status = 'pending'
      and created_at >= now() - interval '3 days'
    order by created_at desc
    limit 100
  `);
  const rows = pending.rows as Array<{ id: number; stripe_session_id: string }>;
  const pendingIds = new Set(rows.map(row => Number(row.id)));
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const failures: string[] = [];

  try {
    const recent = await getStripe().checkout.sessions.list({
      created: { gte: Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60 },
      limit: 100,
    });
    for (const session of recent.data) {
      const metadataOrderId = orderIdFromMetadata(session);
      if (metadataOrderId && pendingIds.has(metadataOrderId)) sessions.set(session.id, session);
    }
  } catch (error) {
    failures.push(`list: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  for (const row of rows) {
    if (!row.stripe_session_id.startsWith('cs_') || sessions.has(row.stripe_session_id)) continue;
    try {
      const session = await getStripe().checkout.sessions.retrieve(row.stripe_session_id);
      sessions.set(session.id, session);
    } catch (error) {
      failures.push(
        `${row.stripe_session_id}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  let repaired = 0;
  let paid = 0;
  let stockExceptions = 0;
  for (const session of sessions.values()) {
    try {
      const hadDirectLink = rows.some(row => row.stripe_session_id === session.id);
      const result = await applyCheckoutSession(session);
      if (result.matched && !hadDirectLink) repaired += 1;
      if (result.newlyPaid) {
        paid += 1;
        if (!result.stockReady) stockExceptions += 1;
        await sendOrderConfirmation(session.id);
      }
    } catch (error) {
      failures.push(`${session.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  const releasedReservations = await releaseExpiredReservations('reconciliation');
  return {
    checked: sessions.size,
    repaired,
    paid,
    stockExceptions,
    releasedReservations,
    failures,
  };
}
