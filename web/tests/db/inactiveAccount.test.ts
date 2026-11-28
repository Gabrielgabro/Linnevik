/**
 * §11.9: ett inaktivt webbkonto kan inte logga in och inte köpa (A16).
 * Förr stoppades bara fakturaköpet. Kontot kunde begära länkar, lösa in dem,
 * behålla sin session och betala med kort, och betalningen kopplades till
 * kontot.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
  headers: async () => new Headers(),
}));

vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { customers } from '@/lib/db/schema';
import { registerCustomer } from '@/lib/commerceOperations';
import { claimMagicLinkToken, requestMagicLink } from '@/lib/magicLink';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionValue } from '@/lib/customerSession';
import { createPendingOrder, getOrderById, markOrderPaid } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';
import { POST as checkout } from '../../app/api/checkout/route';

let variantId: number;

beforeAll(async () => {
  process.env.CUSTOMER_SESSION_SECRET ??= 'test-secret-for-sessions';
  const product = await createProduct({ title: `A16 ${Date.now()}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `A16-${Date.now()}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

async function account(label: string) {
  const email = `a16-${label}-${Date.now()}@test.linnevik.se`;
  const result = await registerCustomer({
    email,
    firstName: 'Ina',
    lastName: 'Aktiv',
    companyName: 'Inaktivhotellet AB',
    taxId: '5564813318',
    address: { line1: 'Gatan 1', line2: null, state: null, postal_code: '111 11', city: 'Stockholm', country: 'SE' },
  });
  if (result.status !== 'created') throw new Error('Kontot skapades inte.');
  return { id: result.id, email };
}

async function deactivate(id: number) {
  await getDb().update(customers).set({ status: 'inactive' }).where(eq(customers.id, id));
}

async function tokenCount(id: number) {
  const result = await getDb().execute(sql`select count(*)::int as n from customer_login_tokens where customer_id = ${id}`);
  return Number((result.rows[0] as { n: number }).n);
}

describe('ett inaktivt webbkonto', () => {
  it('får ingen inloggningslänk', async () => {
    const { id, email } = await account('lank');
    await deactivate(id);
    expect(await requestMagicLink({ email, locale: 'sv', ip: null, userAgent: null })).toBe(false);
    expect(await tokenCount(id)).toBe(0);
  });

  it('kan inte lösa in en länk som skickades innan kontot blev inaktivt', async () => {
    const { id, email } = await account('inlosen');
    const send = (await import('@/lib/mailer')).sendEmail as ReturnType<typeof vi.fn>;
    send.mockClear();
    expect(await requestMagicLink({ email, locale: 'sv', ip: null, userAgent: null })).toBe(true);
    const html = String(send.mock.calls[0][0].html);
    const token = decodeURIComponent(/token=([^"&<\s]+)/.exec(html)![1]);

    await deactivate(id);
    expect(await claimMagicLinkToken(token)).toEqual({ status: 'invalid' });
  });

  it('är utloggat även med en giltig session', async () => {
    const { id } = await account('session');
    cookieJar.set(CUSTOMER_SESSION_COOKIE, (await createCustomerSessionValue(id)).value);
    expect((await getCurrentCustomerFromCookies())?.id).toBe(String(id));

    await deactivate(id);
    expect(await getCurrentCustomerFromCookies()).toBeNull();
    cookieJar.clear();
  });

  it('kan inte gå till kortkassan med sin e-post', async () => {
    process.env.OWNED_COMMERCE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY ??= 'sk_test_unused';
    const { id, email } = await account('kassa');
    await deactivate(id);

    const response = await checkout(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ cartId: crypto.randomUUID(), email }),
      })
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('ACCOUNT_INACTIVE');
  });

  it('kan inte gå till kortkassan inloggad, fast inget e-post skickas (H4)', async () => {
    // Knappen skickar bara korg och rabattkod. Kontot syns bara i kakan.
    process.env.OWNED_COMMERCE_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY ??= 'sk_test_unused';
    const { id } = await account('kaka');
    cookieJar.set(CUSTOMER_SESSION_COOKIE, (await createCustomerSessionValue(id)).value);
    await deactivate(id);

    const response = await checkout(
      new NextRequest('http://localhost/api/checkout', {
        method: 'POST',
        body: JSON.stringify({ cartId: crypto.randomUUID() }),
      })
    );
    cookieJar.clear();
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('ACCOUNT_INACTIVE');
  });

  it('kopplas inte till en kortbetalning som ändå kommer, och admin larmas', async () => {
    const { id, email } = await account('betalning');
    await deactivate(id);

    const orderId = await createPendingOrder(
      [{ variantId, sku: 'A16', title: 'A16', quantity: 1, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
      'sv',
      undefined,
      { vat: { mode: 'explicit', bps: 2500, rateId: null } }
    );
    const order = (await getOrderById(orderId))!;
    await markOrderPaid({
      sessionId: order.stripeSessionId,
      paymentIntentId: `pi_${order.stripeSessionId}`,
      email,
      customerName: 'Någon Annan',
      shippingAddress: null,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      currency: 'sek',
    });

    const paid = (await getOrderById(orderId))!;
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.customerId).toBeNull();

    const [row] = await getDb().select().from(customers).where(eq(customers.id, id));
    expect(row.status).toBe('inactive');
    expect(row.firstName).toBe('Ina');

    const alerts = await getDb().execute(
      sql`select 1 from ops_alerts where kind = 'order.inactive_account' and dedupe_key = ${`order:${orderId}:inactive-account`}`
    );
    expect(alerts.rows).toHaveLength(1);
  });
});
