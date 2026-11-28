/**
 * Orderns lägen (source_of_truth §8.4–8.13): lagerundantag och ny
 * reservation (A5, A6), tillåtna åtgärder i stället för fri status (A9),
 * avbokning med återbetalning (§8.8), tvist som admin avgör (A8) och lager
 * som släpps vid hel återbetalning före leverans (A11).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { clients, invoices, orderItems, orders, productVariants } from '@/lib/db/schema';
import { createPendingOrder, createFulfillment, markOrderPaid } from '@/lib/ordersDb';
import { releaseExpiredReservations, reserveOrderStockStrict, setVariantStock } from '@/lib/inventoryDb';
import { applyOrderAction, allowedOrderActions } from '@/lib/orderActions';
import { refundOrder } from '@/lib/orderRefunds';
import { createManualInvoice } from '@/lib/manualInvoice';
import { registerBankPayment } from '@/lib/invoiceOrders';
import { syncStripeDispute } from '@/lib/stripeRefunds';
import { getOrderById } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';

let variantId: number;
let clientId: number;

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  const stamp = Date.now();
  const product = await createProduct({ title: `Status ${stamp}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `STA-${stamp}`,
    priceMinor: 10_000,
    inventoryTracked: true,
    inventoryQuantity: 1_000,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
  const [client] = await getDb()
    .insert(clients)
    .values({ customerNo: `S${stamp}`, name: 'Statushotellet AB', addressLine1: 'Gatan 1', postalCode: '111 11', city: 'Stockholm' })
    .returning();
  clientId = client.id;
});

async function stock() {
  const [row] = await getDb()
    .select({ quantity: productVariants.inventoryQuantity, reserved: productVariants.inventoryReserved })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row;
}

/** En kortorder som har gått till kassan och reserverat lager. */
async function cardOrder(quantity: number, expiresAt: Date) {
  const orderId = await createPendingOrder(
    [{ variantId, sku: 'STA', title: 'Status', quantity, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
    'sv',
    undefined,
    { vat: { mode: 'explicit', bps: 2500, rateId: null } }
  );
  expect(await reserveOrderStockStrict(orderId, 'checkout', expiresAt)).toBe(true);
  return (await getOrderById(orderId))!;
}

async function pay(order: { stripeSessionId: string; subtotalMinor: number; taxMinor: number; totalMinor: number }) {
  return markOrderPaid({
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
}

async function status(orderId: number) {
  const [row] = await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return row.status;
}

describe('lagerundantag', () => {
  it('blir inte ett lagerundantag när reservationen gick ut men lagret räcker (A6)', async () => {
    const order = await cardOrder(2, new Date(Date.now() - 60_000));
    await releaseExpiredReservations('test');
    const paid = await pay(order);
    expect(paid.stockReady).toBe(true);
    expect(await status(order.id)).toBe('paid');
  });

  it('reserveras på nytt när admin har fyllt på lagret (A5)', async () => {
    const order = await cardOrder(3, new Date(Date.now() - 60_000));
    await releaseExpiredReservations('test');
    const before = await stock();
    // Någon annan har köpt allt under tiden.
    await setVariantStock(variantId, before.reserved, 'test', 'slut');
    expect((await pay(order)).stockReady).toBe(false);
    expect(await status(order.id)).toBe('stock_exception');

    await expect(applyOrderAction({ orderId: order.id, action: 'reserve', actor: 'Gabriel' })).rejects.toThrow('räcker fortfarande inte');
    await setVariantStock(variantId, before.reserved + 100, 'test', 'påfyllt');
    await applyOrderAction({ orderId: order.id, action: 'reserve', actor: 'Gabriel' });
    expect(await status(order.id)).toBe('paid');

    const [item] = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await createFulfillment({ orderId: order.id, status: 'shipped', items: [{ orderItemId: item.id, quantity: 3 }], actor: 'Gabriel' });
    await setVariantStock(variantId, 1_000 + (await stock()).reserved, 'test', 'återställt');
  });
});

describe('åtgärder i stället för fri status (A9)', () => {
  it('tillåter bara det som passar orderns läge', () => {
    expect(allowedOrderActions({ status: 'paid', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual(['pause', 'cancel']);
    expect(allowedOrderActions({ status: 'paid', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' })).toEqual(['pause', 'close']);
    expect(allowedOrderActions({ status: 'on_hold', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual(['resume', 'cancel']);
    expect(allowedOrderActions({ status: 'disputed', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual(['resume']);
    expect(allowedOrderActions({ status: 'cancelled', paymentStatus: 'failed', fulfillmentStatus: 'unfulfilled' })).toEqual([]);
  });

  it('stoppar leverans av en pausad order och återupptar till samma läge', async () => {
    const order = await cardOrder(1, new Date(Date.now() + 3_600_000));
    await pay(order);
    await applyOrderAction({ orderId: order.id, action: 'pause', actor: 'Gabriel', note: 'Kunden ringde' });
    const [item] = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await expect(
      createFulfillment({ orderId: order.id, status: 'shipped', items: [{ orderItemId: item.id, quantity: 1 }], actor: 'Gabriel' })
    ).rejects.toThrow();
    await expect(applyOrderAction({ orderId: order.id, action: 'close', actor: 'Gabriel' })).rejects.toThrow();
    await applyOrderAction({ orderId: order.id, action: 'resume', actor: 'Gabriel' });
    expect(await status(order.id)).toBe('paid');
  });
});

describe('tvist (A8)', () => {
  it('pausar ordern, och en avgjord tvist ändrar ingenting av sig själv', async () => {
    const order = await cardOrder(1, new Date(Date.now() + 3_600_000));
    await pay(order);
    const paymentIntent = `pi_${order.stripeSessionId}`;
    const dispute = (status: string) =>
      ({ id: `dp_${order.id}`, payment_intent: paymentIntent, status, amount: order.totalMinor, reason: 'fraudulent', evidence_details: null }) as never;

    await syncStripeDispute(dispute('needs_response'));
    expect(await status(order.id)).toBe('disputed');
    await syncStripeDispute(dispute('won'));
    expect(await status(order.id)).toBe('disputed');

    await applyOrderAction({ orderId: order.id, action: 'resume', actor: 'Gabriel', note: 'Vunnen tvist' });
    expect(await status(order.id)).toBe('paid');
  });
});

describe('avbokning av en betald fakturaorder (§8.8)', () => {
  it('återbetalar det som återstår, gör en kreditfaktura och släpper lagret', async () => {
    const before = await stock();
    const result = await createManualInvoice(
      {
        clientId,
        recipient: {
          email: 'ekonomi@statushotellet.test',
          companyName: 'Statushotellet AB',
          organizationNumber: '556234-5677',
          address: { line1: 'Gatan 1', line2: '', postalCode: '111 11', city: 'Stockholm' },
        },
        reference: '',
        purchaseOrder: '',
        lines: [{ variantId, quantity: 2, unitAmountMinor: null }],
        shipping: { mode: 'none' },
        daysUntilDue: 30,
        memo: '',
        note: '',
      },
      'Gabriel'
    );
    await registerBankPayment({
      orderId: result.orderId,
      amountMinor: result.totalMinor,
      paidOn: new Date().toISOString().slice(0, 10),
      note: null,
      actor: 'Gabriel',
    });
    expect((await stock()).reserved).toBe(before.reserved + 2);

    await applyOrderAction({ orderId: result.orderId, action: 'cancel', actor: 'Gabriel', note: 'Kunden ångrade sig' });
    const order = (await getOrderById(result.orderId))!;
    expect(order).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', refundedMinor: result.totalMinor });
    const credits = await getDb().select().from(invoices).where(sql`${invoices.orderId} = ${result.orderId} and ${invoices.kind} = 'credit'`);
    expect(credits.map(row => row.totalMinor)).toEqual([result.totalMinor]);
    expect((await stock()).reserved).toBe(before.reserved);
  });
});

describe('hel återbetalning före leverans (A11)', () => {
  it('släpper reservationen men låter ordern stå kvar', async () => {
    const before = await stock();
    const result = await createManualInvoice(
      {
        clientId,
        recipient: {
          email: 'ekonomi@statushotellet.test',
          companyName: 'Statushotellet AB',
          organizationNumber: '556234-5677',
          address: { line1: 'Gatan 1', line2: '', postalCode: '111 11', city: 'Stockholm' },
        },
        reference: '',
        purchaseOrder: '',
        lines: [{ variantId, quantity: 4, unitAmountMinor: null }],
        shipping: { mode: 'none' },
        daysUntilDue: 30,
        memo: '',
        note: '',
      },
      'Gabriel'
    );
    await registerBankPayment({
      orderId: result.orderId,
      amountMinor: result.totalMinor,
      paidOn: new Date().toISOString().slice(0, 10),
      note: null,
      actor: 'Gabriel',
    });
    expect((await stock()).reserved).toBe(before.reserved + 4);

    const order = (await getOrderById(result.orderId))!;
    await refundOrder({ order, amountMinor: order.totalMinor, requestKey: 'hel', actor: 'Gabriel' });
    expect((await stock()).reserved).toBe(before.reserved);
    expect(await status(result.orderId)).toBe('paid');
  });
});

describe('en pausad order som betalas', () => {
  it('förblir pausad, och blir betald när admin återupptar den (§8.9)', async () => {
    const result = await createManualInvoice(
      {
        clientId,
        recipient: {
          email: 'ekonomi@statushotellet.test',
          companyName: 'Statushotellet AB',
          organizationNumber: '556234-5677',
          address: { line1: 'Gatan 1', line2: '', postalCode: '111 11', city: 'Stockholm' },
        },
        reference: '',
        purchaseOrder: '',
        lines: [{ variantId, quantity: 1, unitAmountMinor: null }],
        shipping: { mode: 'none' },
        daysUntilDue: 30,
        memo: '',
        note: '',
      },
      'Gabriel'
    );
    await applyOrderAction({ orderId: result.orderId, action: 'pause', actor: 'Gabriel', note: 'Kunden ringde' });

    const paid = await registerBankPayment({
      orderId: result.orderId,
      amountMinor: result.totalMinor,
      paidOn: new Date().toISOString().slice(0, 10),
      note: null,
      actor: 'Gabriel',
    });
    expect(paid.ok).toBe(true);
    const during = (await getOrderById(result.orderId))!;
    expect(during.paymentStatus).toBe('paid');
    expect(during.status).toBe('on_hold');

    await applyOrderAction({ orderId: result.orderId, action: 'resume', actor: 'Gabriel' });
    expect((await getOrderById(result.orderId))!.status).toBe('paid');
  });
});

