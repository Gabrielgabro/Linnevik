/**
 * §16.2: ordrar exporteras efter betalningsdag, i svensk tid. En redan
 * stängd månad ändras inte när en sen faktura betalas. §16.3:
 * återbetalningar efter sin egen dag (A18). Förr tog exporten ordrar efter
 * skapad dag och räknade i UTC.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { clients, orders, refunds } from '@/lib/db/schema';
import { createManualInvoice } from '@/lib/manualInvoice';
import { registerBankPayment } from '@/lib/invoiceOrders';
import { ordersCsv, refundsCsv, vatSummary } from '@/lib/bookkeepingExport';
import { createPendingOrder, getOrderById, markOrderPaid } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';

let clientId: number;
let variantId: number;

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  const stamp = Date.now();
  const [client] = await getDb()
    .insert(clients)
    .values({
      customerNo: `E${stamp}`,
      name: 'Exporthotellet AB',
      orgNumber: 'SE556777124001',
      addressLine1: 'Kajen 4',
      postalCode: '753 10',
      city: 'Uppsala',
    })
    .returning();
  clientId = client.id;
  const product = await createProduct({ title: `Export ${stamp}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `EXP-${stamp}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

/** Exporten tar aldrig med testordrar (§16.4). Ordrarna här ska räknas. */
async function live(orderId: number) {
  await getDb().update(orders).set({ testMode: false }).where(eq(orders.id, orderId));
}

function rowFor(csv: string, orderId: number) {
  return csv.split('\r\n').find(row => row.startsWith(`${orderId};`));
}

describe('exportens period', () => {
  it('räknar en sent betald faktura till betalningsdagen, inte orderdagen', async () => {
    const invoice = await createManualInvoice(
      {
        clientId,
        recipient: {
          email: 'ekonomi@exporthotellet.test',
          companyName: 'Exporthotellet AB',
          organizationNumber: '556777-1240',
          address: { line1: 'Kajen 4', line2: '', postalCode: '753 10', city: 'Uppsala' },
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
    // Fakturan skapades i en månad som redan är stängd.
    await getDb()
      .update(orders)
      .set({ createdAt: new Date('2025-10-15T10:00:00Z'), testMode: false })
      .where(eq(orders.id, invoice.orderId));

    const before = await vatSummary({ from: '2025-10-01', to: '2025-10-31' });
    const paid = await registerBankPayment({
      orderId: invoice.orderId,
      amountMinor: invoice.totalMinor,
      paidOn: '2025-11-03',
      note: null,
      actor: 'Gabriel',
    });
    expect(paid.ok).toBe(true);

    expect(rowFor(await ordersCsv({ from: '2025-10-01', to: '2025-10-31' }), invoice.orderId)).toBeUndefined();
    expect(await vatSummary({ from: '2025-10-01', to: '2025-10-31' })).toEqual(before);

    const row = rowFor(await ordersCsv({ from: '2025-11-01', to: '2025-11-30' }), invoice.orderId);
    expect(row?.split(';').slice(1, 3)).toEqual(['2025-11-03', '2025-10-15']);
  });

  it('ger en kortbetalning dagens svenska datum', async () => {
    const orderId = await createPendingOrder(
      [{ variantId, sku: 'EXP', title: 'Export', quantity: 1, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
      'sv',
      undefined,
      { vat: { mode: 'explicit', bps: 2500, rateId: null } }
    );
    await live(orderId);
    const order = (await getOrderById(orderId))!;
    await markOrderPaid({
      sessionId: order.stripeSessionId,
      paymentIntentId: `pi_${order.stripeSessionId}`,
      email: null,
      customerName: 'Kort',
      shippingAddress: null,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      currency: 'sek',
    });
    expect((await getOrderById(orderId))!.paidOn).toBe(today);
    expect(rowFor(await ordersCsv({ from: today, to: today }), orderId)?.split(';')[1]).toBe(today);
  });

  it('lägger en återbetalning strax efter midnatt på rätt svensk dag', async () => {
    const orderId = await createPendingOrder(
      [{ variantId, sku: 'EXP', title: 'Export', quantity: 1, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
      'sv',
      undefined,
      { vat: { mode: 'explicit', bps: 2500, rateId: null } }
    );
    await live(orderId);
    // 00:30 svensk tid den 1 november är 23:30 UTC den 31 oktober.
    const [refund] = await getDb()
      .insert(refunds)
      .values({
        orderId,
        stripeRefundId: `re_export_${orderId}`,
        amountMinor: 1_000,
        taxMinor: 200,
        status: 'succeeded',
        actor: 'Gabriel',
        createdAt: new Date('2025-10-31T23:30:00Z'),
      })
      .returning();

    const october = await refundsCsv({ from: '2025-10-01', to: '2025-10-31' });
    expect(october.split('\r\n').some(row => row.startsWith(`${refund.id};`))).toBe(false);
    const november = await refundsCsv({ from: '2025-11-01', to: '2025-11-30' });
    const row = november.split('\r\n').find(line => line.startsWith(`${refund.id};`));
    expect(row?.split(';')[1]).toBe('2025-11-01');
  });
});
