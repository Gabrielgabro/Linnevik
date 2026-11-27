/**
 * §17.2: samma besked från Stripe hanteras en gång. Ett besked som fastnade
 * halvvägs tas upp igen och blir aldrig liggande. Återbetalningar och
 * tvister stäms av varje natt (A7).
 *
 * Förr stod ett besked som föll på en timeout kvar som "processing", och
 * varje nytt försök från Stripe fick "duplicate" till svar.
 *
 * Stripe är utbytt mot en låtsasklient. Allt annat körs mot grenen.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';

const fake = {
  events: { retrieve: vi.fn() },
  refunds: { list: vi.fn() },
  disputes: { list: vi.fn() },
};
vi.mock('@/lib/stripe', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/stripe')>()),
  getStripe: () => fake,
}));
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { orderEvents, orders, refunds, stripeWebhookEvents } from '@/lib/db/schema';
import { claimStripeEvent, completeStripeEvent } from '@/lib/stripeWebhookDb';
import { processStripeEvent } from '@/lib/stripeEvents';
import { reconcileRefundsAndDisputes, retryStuckStripeEvents } from '@/lib/stripeReconcile';
import { applyOrderAction } from '@/lib/orderActions';
import { createPendingOrder, getOrderById, markOrderPaid } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';

let variantId: number;

beforeAll(async () => {
  const product = await createProduct({ title: `A7 ${Date.now()}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `A7-${Date.now()}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

/** En betald kortorder med betalnings-id `pi_<session>`. */
async function paidOrder() {
  const orderId = await createPendingOrder(
    [{ variantId, sku: 'A7', title: 'A7', quantity: 1, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
    'sv',
    undefined,
    { vat: { mode: 'explicit', bps: 2500, rateId: null } }
  );
  const order = (await getOrderById(orderId))!;
  await markOrderPaid({
    sessionId: order.stripeSessionId,
    paymentIntentId: `pi_${order.stripeSessionId}`,
    email: null,
    customerName: 'Test',
    shippingAddress: null,
    subtotalMinor: order.subtotalMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    currency: 'sek',
  });
  return { id: orderId, paymentIntent: `pi_${order.stripeSessionId}`, totalMinor: order.totalMinor };
}

function refundEvent(id: string, refund: Partial<Stripe.Refund>): Stripe.Event {
  return { id, type: 'refund.created', data: { object: { object: 'refund', ...refund } } } as unknown as Stripe.Event;
}

async function refundRows(orderId: number) {
  return getDb().select().from(refunds).where(eq(refunds.orderId, orderId));
}

async function eventRow(eventId: string) {
  const [row] = await getDb().select().from(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, eventId));
  return row;
}

/** Låtsas att anspråket togs för en timme sedan och sedan övergavs. */
async function abandon(eventId: string) {
  await getDb().execute(sql`
    update stripe_webhook_events set claimed_at = now() - interval '1 hour' where event_id = ${eventId}
  `);
}

describe('anspråk på en händelse', () => {
  it('ger en hantering, och ett pågående anspråk är inte en dubblett', async () => {
    const id = `evt_claim_${Date.now()}`;
    expect(await claimStripeEvent(id, 'refund.created')).toBe('claimed');
    expect(await claimStripeEvent(id, 'refund.created')).toBe('in_progress');
    await completeStripeEvent(id);
    expect(await claimStripeEvent(id, 'refund.created')).toBe('processed');
  });

  it('tas över när det har övergivits', async () => {
    const id = `evt_stale_${Date.now()}`;
    expect(await claimStripeEvent(id, 'refund.created')).toBe('claimed');
    await abandon(id);
    expect(await claimStripeEvent(id, 'refund.created')).toBe('claimed');
    expect((await eventRow(id)).attempts).toBe(2);
  });
});

describe('en händelse som fastnade halvvägs', () => {
  it('hanteras när Stripe försöker igen', async () => {
    const order = await paidOrder();
    const event = refundEvent(`evt_retry_${order.id}`, {
      id: `re_retry_${order.id}`,
      amount: 2_500,
      currency: 'sek',
      status: 'succeeded',
      payment_intent: order.paymentIntent,
    });

    // Första försöket tog anspråket och dog utan att bli klart.
    expect(await claimStripeEvent(event.id, event.type)).toBe('claimed');
    expect(await processStripeEvent(event)).toBe('in_progress');
    await abandon(event.id);

    expect(await processStripeEvent(event)).toBe('processed');
    expect((await eventRow(event.id)).status).toBe('processed');
    expect(await refundRows(order.id)).toHaveLength(1);

    // Ett omsänt besked efteråt ändrar ingenting.
    expect(await processStripeEvent(event)).toBe('duplicate');
    expect(await refundRows(order.id)).toHaveLength(1);
  });

  it('tas upp av nattens avstämning om Stripe inte försöker igen', async () => {
    const order = await paidOrder();
    const event = refundEvent(`evt_night_${order.id}`, {
      id: `re_night_${order.id}`,
      amount: 1_000,
      currency: 'sek',
      status: 'succeeded',
      payment_intent: order.paymentIntent,
    });
    await claimStripeEvent(event.id, event.type);
    await abandon(event.id);

    fake.events.retrieve.mockImplementation(async (id: string) => {
      if (id === event.id) return event;
      throw new Error('No such event');
    });
    const result = await retryStuckStripeEvents();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    expect((await eventRow(event.id)).status).toBe('processed');
    expect(await refundRows(order.id)).toHaveLength(1);
  });

  it('släpps och larmar när hanteringen faller, så att nästa försök tar den', async () => {
    const event = {
      id: `evt_fail_${Date.now()}`,
      type: 'charge.refunded',
      data: { object: { id: 'ch_fail' } },
    } as unknown as Stripe.Event;
    fake.refunds.list.mockImplementationOnce(() => {
      throw new Error('Stripe nere');
    });
    expect(await processStripeEvent(event)).toBe('failed');
    expect(await eventRow(event.id)).toBeUndefined();
    const alerts = await getDb().execute(sql`select 1 from ops_alerts where dedupe_key = ${`webhook:${event.id}`}`);
    expect(alerts.rows).toHaveLength(1);
  });
});

/** Stripes listor går att läsa med `for await`. */
function list<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

describe('nattens avstämning av återbetalningar och tvister', () => {
  it('fångar en återbetalning som webhooken missade, en gång', async () => {
    const order = await paidOrder();
    const refund = { id: `re_missed_${order.id}`, amount: 3_000, currency: 'sek', status: 'succeeded', payment_intent: order.paymentIntent };
    fake.refunds.list.mockImplementation(() => list([refund]));
    fake.disputes.list.mockImplementation(() => list([]));

    await reconcileRefundsAndDisputes();
    await reconcileRefundsAndDisputes();
    const rows = await refundRows(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountMinor).toBe(3_000);
    const [paid] = await getDb().select({ refunded: orders.refundedMinor }).from(orders).where(eq(orders.id, order.id));
    expect(paid.refunded).toBe(3_000);
  });

  it('pausar en order med en missad tvist, och pausar den inte igen när admin har återupptagit den', async () => {
    const order = await paidOrder();
    const dispute = { id: `dp_night_${order.id}`, payment_intent: order.paymentIntent, status: 'needs_response', amount: order.totalMinor, reason: 'fraudulent', evidence_details: null };
    fake.refunds.list.mockImplementation(() => list([]));
    fake.disputes.list.mockImplementation(() => list([dispute]));

    await reconcileRefundsAndDisputes();
    expect((await getOrderById(order.id))!.status).toBe('disputed');

    await applyOrderAction({ orderId: order.id, action: 'resume', actor: 'Gabriel', note: 'Underlag skickat, levereras.' });
    await reconcileRefundsAndDisputes();
    expect((await getOrderById(order.id))!.status).toBe('paid');

    const events = await getDb()
      .select({ kind: orderEvents.kind })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id));
    expect(events.filter(event => event.kind === 'payment.disputed')).toHaveLength(1);
  });
});
