/**
 * Fakturaflödena utan Stripe (source_of_truth §9, §10).
 *
 * - En manuell faktura skapar aldrig något webbkonto, och ordern hör till
 *   företaget (§10.8, A12).
 * - Fakturamejlet bär pdf:en och går till fakturans adress (§9.6, §13.1).
 * - En registrerad bankbetalning gör ordern betald, utan webbkonto (§9.9).
 * - En avbokning makulerar fakturan, som behåller sitt nummer (§8.8, §9.5).
 * - Förfallna fakturor larmar och påminns, aldrig makuleras (§9.7).
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

const sent: Array<{ to: string; subject: string; attachments?: Array<{ filename: string; content: Uint8Array }> }> = [];
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
    sent.push(message);
    return { success: true, messageId: `test-${sent.length}` };
  }),
}));

import { getDb } from '@/lib/db';
import { clients, customers, invoices, opsAlerts, orders, productVariants } from '@/lib/db/schema';
import { createManualInvoice } from '@/lib/manualInvoice';
import { registerBankPayment, reconcileOpenInvoices } from '@/lib/invoiceOrders';
import { currentInvoiceForOrder } from '@/lib/invoicesDb';
import { createPendingOrder, updateOrderManagement } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';

let clientId: number;
let variantId: number;

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  process.env.OWNED_COMMERCE_ENABLED = 'true';
  const stamp = Date.now();
  const [client] = await getDb()
    .insert(clients)
    .values({
      customerNo: `F${stamp}`,
      name: 'Fakturahotellet AB',
      orgNumber: 'SE556123456701',
      invoiceEmail: 'ekonomi@fakturahotellet.test',
      addressLine1: 'Hamngatan 2',
      postalCode: '111 47',
      city: 'Stockholm',
      tags: ['Tvätterikund'],
    })
    .returning();
  clientId = client.id;
  const product = await createProduct({ title: `Faktura ${stamp}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `FAK-${stamp}`,
    priceMinor: 20_000,
    inventoryTracked: true,
    inventoryQuantity: 100,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

beforeEach(() => {
  sent.length = 0;
});

async function manualInvoice(quantity = 5) {
  return createManualInvoice(
    {
      clientId,
      recipient: {
        email: 'ekonomi@fakturahotellet.test',
        companyName: 'Fakturahotellet AB',
        organizationNumber: '556123-4567',
        address: { line1: 'Hamngatan 2', line2: '', postalCode: '111 47', city: 'Stockholm' },
      },
      reference: 'Eva Ek',
      purchaseOrder: 'PO-7',
      lines: [{ variantId, quantity, unitAmountMinor: null }],
      shipping: { mode: 'manual', name: 'Frakt', amountMinor: 9_900 },
      daysUntilDue: 30,
      memo: '',
      note: '',
    },
    'Gabriel'
  );
}

async function reserved() {
  const [row] = await getDb()
    .select({ reserved: productVariants.inventoryReserved })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row.reserved;
}

async function accountsFor(email: string) {
  return getDb().select().from(customers).where(sql`lower(${customers.email}) = ${email}`);
}

describe('manuell faktura', () => {
  it('kopplar ordern till företaget och skapar inget webbkonto', async () => {
    const before = await reserved();
    const result = await manualInvoice(5);

    const [order] = await getDb().select().from(orders).where(eq(orders.id, result.orderId));
    expect(order).toMatchObject({ clientId, customerId: null, paymentMethod: 'invoice', paymentStatus: 'pending' });
    expect(order.stripeSessionId).toBe(`faktura_${result.number}`);
    expect(await accountsFor('ekonomi@fakturahotellet.test')).toHaveLength(0);
    expect(await reserved()).toBe(before + 5);

    const invoice = await currentInvoiceForOrder(result.orderId);
    expect(invoice?.buyer).toMatchObject({ name: 'Fakturahotellet AB', reference: 'Eva Ek', purchaseOrder: 'PO-7' });
    expect(invoice?.totalMinor).toBe(order.totalMinor);
  });

  it('mejlar fakturan med pdf:en som bilaga till fakturans adress', async () => {
    const result = await manualInvoice(1);
    expect(result.emailed).toBe(true);
    const mail = sent.find(message => message.subject.includes(`Faktura ${result.number}`));
    expect(mail?.to).toBe('ekonomi@fakturahotellet.test');
    expect(mail?.attachments?.[0].filename).toBe(`faktura-${result.number}.pdf`);
    expect(Buffer.from(mail!.attachments![0].content).subarray(0, 5).toString()).toBe('%PDF-');

    const [row] = await getDb().select().from(invoices).where(eq(invoices.number, result.number));
    expect(row.emailedTo).toBe('ekonomi@fakturahotellet.test');
  });
});

describe('bankbetalning', () => {
  it('vägrar en delbetalning och gör ordern betald när hela beloppet kommit', async () => {
    const { orderId, totalMinor } = await manualInvoice(2);
    const today = new Date().toISOString().slice(0, 10);

    const short = await registerBankPayment({ orderId, amountMinor: totalMinor - 500, paidOn: today, note: null, actor: 'Gabriel' });
    expect(short).toMatchObject({ ok: false, status: 409 });

    const paid = await registerBankPayment({ orderId, amountMinor: totalMinor, paidOn: today, note: null, actor: 'Gabriel' });
    expect(paid).toMatchObject({ ok: true, newlyPaid: true });
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order).toMatchObject({ paymentStatus: 'paid', clientId, customerId: null });
    // Betalningen skapade inget webbkonto (§10.8).
    expect(await accountsFor('ekonomi@fakturahotellet.test')).toHaveLength(0);

    const again = await registerBankPayment({ orderId, amountMinor: totalMinor, paidOn: today, note: null, actor: 'Gabriel' });
    expect(again).toMatchObject({ ok: false, status: 409 });
  });
});

describe('avbokning', () => {
  it('makulerar fakturan, behåller numret och släpper lagret', async () => {
    const before = await reserved();
    const { orderId, number } = await manualInvoice(3);
    expect(await reserved()).toBe(before + 3);

    await updateOrderManagement(orderId, { status: 'cancelled' }, 'Gabriel');
    expect(await currentInvoiceForOrder(orderId)).toBeNull();
    const [row] = await getDb().select().from(invoices).where(eq(invoices.number, number));
    expect(row.voidedAt).not.toBeNull();
    expect(row.voidedBy).toBe('Gabriel');
    expect(await reserved()).toBe(before);
  });
});

describe('nattens avstämning', () => {
  it('larmar och påminner om en förfallen faktura, men makulerar den aldrig', async () => {
    const { orderId, number } = await manualInvoice(1);
    await getDb()
      .update(invoices)
      .set({ dueOn: '2026-01-01' })
      .where(eq(invoices.number, number));

    const result = await reconcileOpenInvoices();
    expect(result.overdue).toBeGreaterThanOrEqual(1);

    const [row] = await getDb().select().from(invoices).where(eq(invoices.number, number));
    expect(row.voidedAt).toBeNull();
    const alerts = await getDb().select().from(opsAlerts).where(sql`${opsAlerts.dedupeKey} like ${`invoice-overdue:${number}:%`}`);
    expect(alerts.length).toBe(1);
    const reminder = sent.find(message => message.subject.startsWith('Påminnelse') && message.subject.includes(`order #${orderId}`));
    expect(reminder?.to).toBe('ekonomi@fakturahotellet.test');
    expect(reminder?.attachments?.[0].filename).toBe(`faktura-${number}.pdf`);

    // En andra körning skickar ingen ny påminnelse och inget nytt larm.
    sent.length = 0;
    await reconcileOpenInvoices();
    expect(sent.filter(message => message.subject.includes(`order #${orderId}`))).toHaveLength(0);
  });

  it('släpper en fakturaorder som aldrig fick någon faktura', async () => {
    const orderId = await createPendingOrder(
      [{ variantId, sku: 'X', title: 'X', quantity: 1, unitAmountMinor: 100, currency: 'sek', stripeProductId: null }],
      'sv',
      undefined,
      { paymentMethod: 'invoice', vat: { mode: 'explicit', bps: 2500, rateId: null } }
    );
    await getDb().execute(sql`update orders set created_at = now() - interval '2 hours' where id = ${orderId}`);
    await reconcileOpenInvoices();
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order.paymentStatus).toBe('failed');
  });
});
