/**
 * Fakturakassan (source_of_truth §7) med vår egen faktura.
 *
 * Bara inloggningen och språket är utbytta: rutten läser dem ur kakor och
 * rubriker som inte finns i ett test. Allt annat körs på riktigt mot grenen.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';

const session = { id: '0' };
vi.mock('@/lib/customerAccount', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/customerAccount')>()),
  getCurrentCustomerFromCookies: vi.fn(async () => session),
}));
vi.mock('@/lib/language', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/language')>()),
  getServerLanguage: vi.fn(async () => 'sv'),
}));
const sent: Array<{ to: string; subject: string }> = [];
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async (message: (typeof sent)[number]) => {
    sent.push(message);
    return { success: true, messageId: 'test' };
  }),
}));

import { getDb } from '@/lib/db';
import { carts, clients, customers, orders } from '@/lib/db/schema';
import { registerCustomer } from '@/lib/commerceOperations';
import { createOwnedCart, setOwnedCartItem } from '@/lib/cartDb';
import { currentInvoiceForOrder } from '@/lib/invoicesDb';
import { createPendingOrder, getOrderById } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';
import { POST } from '../../app/api/invoice/route';

let variantId: number;
let accountId: number;
let clientId: number;
const email = `kassa-${Date.now()}@kassahotellet.test`;

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  process.env.OWNED_COMMERCE_ENABLED = 'true';
  const product = await createProduct({ title: `Kassa ${Date.now()}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `KAS-${Date.now()}`,
    priceMinor: 15_000,
    inventoryTracked: true,
    inventoryQuantity: 50,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;

  await registerCustomer({
    email,
    firstName: 'Karin',
    lastName: 'Lund',
    taxId: '5562345677',
    companyName: 'Kassahotellet AB',
    address: { line1: 'Kungsgatan 3', line2: null, postal_code: '411 19', city: 'Göteborg', state: null, country: 'SE' },
  });
  const [account] = await getDb().select().from(customers).where(sql`lower(${customers.email}) = ${email}`);
  accountId = account.id;
  clientId = account.clientId;
  session.id = String(account.id);
  await getDb().update(clients).set({ invoiceEmail: 'faktura@kassahotellet.test' }).where(eq(clients.id, clientId));
});

beforeEach(() => {
  sent.length = 0;
});

async function checkout(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/invoice', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` },
      body: JSON.stringify(body),
    })
  );
}

describe('fakturakassan', () => {
  it('gör en egen faktura till företaget, med personen som referens', async () => {
    const cart = await createOwnedCart();
    await setOwnedCartItem(cart.id, variantId, 4);

    const response = await checkout({ cartId: cart.id, profile: { purchaseOrder: 'IO-55' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoiceNumber).toBeGreaterThan(0);

    const [order] = await getDb().select().from(orders).where(eq(orders.stripeSessionId, `faktura_${body.invoiceNumber}`));
    expect(order).toMatchObject({ customerId: accountId, clientId, paymentMethod: 'invoice', vatBps: 2500 });
    const invoice = await currentInvoiceForOrder(order.id);
    expect(invoice?.buyer).toMatchObject({
      name: 'Kassahotellet AB',
      reference: 'Karin Lund',
      purchaseOrder: 'IO-55',
      email: 'faktura@kassahotellet.test',
    });
    expect(invoice?.totalMinor).toBe(order.totalMinor);

    // Fakturamejlet går till företagets fakturabrevlåda (§13.1).
    expect(sent.map(message => message.to)).toEqual(['faktura@kassahotellet.test']);
  });

  it('ger samma faktura vid ett omsänt anrop, och inget andra mejl', async () => {
    const cart = await createOwnedCart();
    await setOwnedCartItem(cart.id, variantId, 1);
    const first = await (await checkout({ cartId: cart.id })).json();
    const second = await (await checkout({ cartId: cart.id })).json();
    expect(second.invoiceNumber).toBe(first.invoiceNumber);
    expect(second.reused).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('går att välja efter en avbruten kortkassa, och kortförsöket avslutas', async () => {
    // Kunden gick till kortkassan, avbröt hos Stripe och kom tillbaka (§5.5).
    // Förr var korgen låst för fakturan tills Stripes session gick ut.
    const cart = await createOwnedCart();
    await setOwnedCartItem(cart.id, variantId, 2);
    const [current] = await getDb().select({ version: carts.version }).from(carts).where(eq(carts.id, cart.id));
    const cardAttempt = await createPendingOrder(
      [{ variantId, sku: 'KAS', title: 'Kassa', quantity: 2, unitAmountMinor: 15_000, currency: 'sek', stripeProductId: null }],
      'sv',
      { id: cart.id, version: current.version },
      { vat: { mode: 'explicit', bps: 2500, rateId: null } }
    );
    await getDb().update(carts).set({ status: 'checkout_started', checkoutStartedAt: new Date() }).where(eq(carts.id, cart.id));

    const response = await checkout({ cartId: cart.id });
    expect(response.status).toBe(200);
    expect((await response.json()).invoiceNumber).toBeGreaterThan(0);
    expect((await getOrderById(cardAttempt))!.status).not.toBe('pending');
  });

  it('går att välja när kassan föll innan någon order skapades', async () => {
    const cart = await createOwnedCart();
    await setOwnedCartItem(cart.id, variantId, 1);
    await getDb().update(carts).set({ status: 'checkout_started', checkoutStartedAt: new Date() }).where(eq(carts.id, cart.id));
    const response = await checkout({ cartId: cart.id });
    expect(response.status).toBe(200);
  });
});
