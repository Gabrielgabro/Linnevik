/**
 * §8.11, §9.8, §16.3: en fakturaorder som betalats via bank återbetalas från
 * banken. Admin registrerar det, och en kreditfaktura görs automatiskt med
 * nästa nummer i serien, hänvisar till fakturan och kommer med i exporten.
 *
 * Admininloggningen är utbytt. Allt annat körs på riktigt mot grenen.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';

vi.mock('@/lib/adminRoute', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/adminRoute')>()),
  requireAdmin: vi.fn(async () => ({ user: 'Gabriel' })),
}));
const sent: Array<{ to: string; subject: string; attachments?: Array<{ filename: string }> }> = [];
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
    sent.push(message);
    return { success: true, messageId: 'test' };
  }),
}));

import { getDb } from '@/lib/db';
import { clients, invoices, orders } from '@/lib/db/schema';
import { createManualInvoice } from '@/lib/manualInvoice';
import { registerBankPayment } from '@/lib/invoiceOrders';
import { refundsCsv } from '@/lib/bookkeepingExport';
import { createProduct, createVariant } from '@/lib/productsDb';
import { POST } from '../../app/api/admin/orders/[id]/refunds/route';

let clientId: number;
let variantId: number;

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  const stamp = Date.now();
  const [client] = await getDb()
    .insert(clients)
    .values({
      customerNo: `K${stamp}`,
      name: 'Kredithotellet AB',
      orgNumber: 'SE556345678801',
      addressLine1: 'Torget 1',
      postalCode: '753 10',
      city: 'Uppsala',
    })
    .returning();
  clientId = client.id;
  const product = await createProduct({ title: `Kredit ${stamp}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `KRE-${stamp}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

async function paidInvoiceOrder() {
  const result = await createManualInvoice(
    {
      clientId,
      recipient: {
        email: 'ekonomi@kredithotellet.test',
        companyName: 'Kredithotellet AB',
        organizationNumber: '556345-6788',
        address: { line1: 'Torget 1', line2: '', postalCode: '753 10', city: 'Uppsala' },
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
  const today = new Date().toISOString().slice(0, 10);
  const paid = await registerBankPayment({ orderId: result.orderId, amountMinor: result.totalMinor, paidOn: today, note: null, actor: 'Gabriel' });
  expect(paid.ok).toBe(true);
  return result;
}

async function refund(orderId: number, amountMinor: number, requestKey: string) {
  return POST(
    new NextRequest(`http://localhost/api/admin/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountMinor, requestKey }),
    }),
    { params: Promise.resolve({ id: String(orderId) }) }
  );
}

describe('kreditfakturor', () => {
  it('krediterar en delåterbetalning med momsen i samma proportion', async () => {
    const { orderId, number, totalMinor } = await paidInvoiceOrder();
    expect(totalMinor).toBe(50_000);

    const response = await refund(orderId, 12_500, 'del-1');
    expect(response.status).toBe(201);
    const { creditNoteNumber } = await response.json();
    expect(creditNoteNumber).toBe(number + 1);

    const [credit] = await getDb().select().from(invoices).where(eq(invoices.number, creditNoteNumber));
    const [original] = await getDb().select().from(invoices).where(eq(invoices.number, number));
    expect(credit).toMatchObject({ kind: 'credit', creditsInvoiceId: original.id, totalMinor: 12_500, taxMinor: 2_500, netMinor: 10_000 });
    expect(credit.pdfBase64).toBeTruthy();

    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order).toMatchObject({ paymentStatus: 'partially_refunded', refundedMinor: 12_500 });

    const mail = sent.find(message => message.subject.startsWith(`Kreditfaktura ${creditNoteNumber}`));
    expect(mail?.to).toBe('ekonomi@kredithotellet.test');
    expect(mail?.attachments?.[0].filename).toBe(`kreditfaktura-${creditNoteNumber}.pdf`);
  });

  it('krediterar resten med fakturans rader, och inte mer än som betalades', async () => {
    const { orderId, number } = await paidInvoiceOrder();
    await refund(orderId, 10_000, 'a');
    const rest = await refund(orderId, 40_000, 'b');
    expect(rest.status).toBe(201);
    // Allt är återbetalat: rutten säger nej.
    expect((await refund(orderId, 1, 'c')).status).not.toBe(201);

    const credits = await getDb()
      .select()
      .from(invoices)
      .where(sql`${invoices.orderId} = ${orderId} and ${invoices.kind} = 'credit'`);
    expect(credits.map(row => row.totalMinor).sort((a, b) => a - b)).toEqual([10_000, 40_000]);
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order.paymentStatus).toBe('refunded');
    expect(credits.every(row => row.number > number)).toBe(true);
  });

  it('ger samma kreditfaktura för ett omsänt anrop', async () => {
    const { orderId } = await paidInvoiceOrder();
    const first = await (await refund(orderId, 5_000, 'samma')).json();
    const second = await (await refund(orderId, 5_000, 'samma')).json();
    // Samma nyckel skriver samma återbetalning, och orderns summa räknas om
    // ur återbetalningarna: omsändningen ger varken en ny kreditfaktura eller
    // ett dubbelt belopp.
    expect(second.creditNoteNumber).toBe(first.creditNoteNumber);
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order.refundedMinor).toBe(5_000);
  });

  it('kommer med i exporten med kreditfakturans nummer', async () => {
    const { orderId } = await paidInvoiceOrder();
    const { creditNoteNumber } = await (await refund(orderId, 50_000, 'hel')).json();
    // Den lokala Stripe-nyckeln är en testnyckel, så ordern skapades som
    // testorder, och testordrar kommer aldrig med i exporten (§16.4).
    await getDb().update(orders).set({ testMode: false }).where(eq(orders.id, orderId));
    const today = new Date().toISOString().slice(0, 10);
    const csv = await refundsCsv({ from: today, to: today });
    const line = csv.split('\r\n').find(row => row.includes(`;${orderId};`));
    expect(line).toBeTruthy();
    expect(line!.endsWith(`;${creditNoteNumber}`)).toBe(true);
  });
});
