/**
 * §9.1–9.6: egna fakturor. En obruten nummerserie, beloppen från ordern,
 * pdf:en sparad, och en makulerad faktura som behåller sitt nummer.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { createPendingOrder } from '@/lib/ordersDb';
import {
  buyerSnapshot,
  currentInvoiceForOrder,
  invoicePdf,
  issueInvoiceForOrder,
  sellerSnapshot,
  voidInvoiceForOrder,
} from '@/lib/invoicesDb';

const buyer = buyerSnapshot({
  companyName: 'Hotell Test AB',
  organizationNumber: '556016-0680',
  address: { line1: 'Storgatan 1', postal_code: '111 20', city: 'Stockholm' },
  email: 'ekonomi@test.linnevik.se',
  reference: 'Anna',
});

beforeAll(() => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
});

async function invoiceOrder() {
  return createPendingOrder(
    [
      { variantId: null as never, sku: 'A-1', title: 'Kudde', quantity: 3, unitAmountMinor: 24_000, currency: 'sek', stripeProductId: null },
      { variantId: null as never, sku: 'B-2', title: 'Täcke', quantity: 1, unitAmountMinor: 59_500, currency: 'sek', stripeProductId: null },
    ],
    'sv',
    undefined,
    {
      paymentMethod: 'invoice',
      discount: { id: null as never, code: null as never, amountMinor: 1_000 },
      shipping: { id: null as never, name: 'Frakt', amountMinor: 9_900 },
      vat: { mode: 'explicit', bps: 2500, rateId: null },
    }
  );
}

async function lastNumber() {
  const result = await getDb().execute(sql`select last_number from invoice_numbers`);
  return Number((result.rows[0] as { last_number: number }).last_number);
}

describe('egna fakturor', () => {
  it('har orderns belopp, en sparad pdf och orderns referens', async () => {
    const orderId = await invoiceOrder();
    const invoice = await issueInvoiceForOrder({ orderId, buyer, dueDays: 30, actor: 'test' });
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));

    expect(invoice).toMatchObject({
      kind: 'invoice',
      goodsMinor: 3 * 24_000 + 59_500,
      discountMinor: 1_000,
      shippingMinor: 9_900,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      ocr: expect.stringMatching(new RegExp(`^${orderId}`)),
    });
    expect(invoice.buyer).toMatchObject({ orgNumber: '556016-0680', vatNumber: 'SE556016068001' });
    expect(invoice.seller.bankgiro).toBe('5673-8776');
    expect(order.stripeSessionId).toBe(`faktura_${invoice.number}`);

    const pdf = await invoicePdf(invoice);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(invoice.pdfBase64).toBeTruthy();
  });

  it('tar nummer i en obruten serie, även när två anrop krockar', async () => {
    const before = await lastNumber();
    const [a, b] = [await invoiceOrder(), await invoiceOrder()];

    // Samma order två gånger samtidigt, och en annan order.
    const issued = await Promise.all([
      issueInvoiceForOrder({ orderId: a, buyer, dueDays: 30, actor: 'test' }),
      issueInvoiceForOrder({ orderId: a, buyer, dueDays: 30, actor: 'test' }),
      issueInvoiceForOrder({ orderId: b, buyer, dueDays: 30, actor: 'test' }),
    ]);
    expect(issued[0].id).toBe(issued[1].id);
    expect(new Set([issued[0].number, issued[2].number])).toEqual(new Set([before + 1, before + 2]));
    expect(await lastNumber()).toBe(before + 2);
  });

  it('behåller numret på en makulerad faktura och ger nästa nummer till den nya', async () => {
    const orderId = await invoiceOrder();
    const first = await issueInvoiceForOrder({ orderId, buyer, dueDays: 10, actor: 'test' });
    expect(await voidInvoiceForOrder(orderId, 'test')).toBe(true);
    expect(await currentInvoiceForOrder(orderId)).toBeNull();

    const second = await issueInvoiceForOrder({ orderId, buyer, dueDays: 10, actor: 'test' });
    expect(second.number).toBe(first.number + 1);
    const numbers = await getDb().execute(sql`select number from invoices where order_id = ${orderId} order by number`);
    expect(numbers.rows.map(row => Number((row as { number: number }).number))).toEqual([first.number, second.number]);
  });

  it('räknar förfallodagen från förfallotiden', async () => {
    const orderId = await invoiceOrder();
    const invoice = await issueInvoiceForOrder({ orderId, buyer, dueDays: 10, actor: 'test' });
    const days = (Date.parse(`${invoice.dueOn}T00:00:00Z`) - Date.parse(`${invoice.issuedAt.toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000;
    expect(Math.abs(days - 10)).toBeLessThanOrEqual(1);
    await expect(issueInvoiceForOrder({ orderId: await invoiceOrder(), buyer, dueDays: 0, actor: 'test' })).rejects.toThrow('1–120');
  });

  it('säljaren kräver ett giltigt bankgiro', () => {
    expect(() => sellerSnapshot({ INVOICE_BANKGIRO: '' })).toThrow();
    expect(sellerSnapshot({ INVOICE_BANKGIRO: '5673-8776' })).toMatchObject({ name: 'Linneviken AB', vatNumber: 'SE559307295101' });
  });
});
