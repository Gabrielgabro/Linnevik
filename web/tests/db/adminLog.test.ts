/**
 * §15.2: allt admin ändrar loggas med vem, när och vad, och ändringar på en
 * order syns i Aktivitet (A25). §4.15: listpriset loggas med gammalt och nytt
 * pris och sidan det ändrades från (A24). §15.3: översikten visar det som
 * väntar på någon (A24).
 *
 * Admininloggningen är utbytt. Allt annat körs mot grenen.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/adminRoute', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/adminRoute')>()),
  requireAdmin: vi.fn(async () => ({ user: 'Johan' })),
}));
vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { list } from '@/lib/adminActivity';
import { loadOverview } from '@/lib/adminOverview';
import { applyOrderAction } from '@/lib/orderActions';
import { createPendingOrder, getOrderById, markOrderPaid } from '@/lib/ordersDb';
import { createProduct, createVariant } from '@/lib/productsDb';
import { createSampleRequest } from '@/lib/sampleRequestsDb';
import { PATCH as patchVariant } from '../../app/api/admin/variants/[id]/route';

let variantId: number;
let sku: string;

beforeAll(async () => {
  const product = await createProduct({ title: `Logg ${Date.now()}`, status: 'active' });
  sku = `LOG-${Date.now()}`;
  const variant = await createVariant(product.id, {
    sku,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

async function paidOrder() {
  const orderId = await createPendingOrder(
    [{ variantId, sku, title: 'Logg', quantity: 1, unitAmountMinor: 10_000, currency: 'sek', stripeProductId: null }],
    'sv',
    undefined,
    { vat: { mode: 'explicit', bps: 2500, rateId: null } }
  );
  const order = (await getOrderById(orderId))!;
  await markOrderPaid({
    sessionId: order.stripeSessionId,
    paymentIntentId: `pi_${order.stripeSessionId}`,
    email: null,
    customerName: 'Loggkund',
    shippingAddress: null,
    subtotalMinor: order.subtotalMinor,
    taxMinor: order.taxMinor,
    totalMinor: order.totalMinor,
    currency: 'sek',
  });
  return orderId;
}

describe('Aktivitet', () => {
  it('visar admins ändringar på en order, med vem och på svenska, men inte Stripes', async () => {
    const orderId = await paidOrder();
    await applyOrderAction({ orderId, action: 'pause', actor: 'Ahron', note: 'Kunden ringde' });

    const entries = (await list(500)).filter(entry => entry.href === `/admin/orders/${orderId}`);
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toBe('Ahron');
    expect(entries[0].label).toBe(`Order #${orderId}: pausad`);
    expect(entries[0].detail).toMatchObject({ från: 'betald', till: 'pausad', varför: 'Kunden ringde' });
  });

  it('loggar ett ändrat listpris med gammalt och nytt pris och sidan', async () => {
    const response = await patchVariant(
      new NextRequest(`http://localhost/api/admin/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceMinor: 12_500, priceSource: 'Franzén' }),
      }),
      { params: Promise.resolve({ id: String(variantId) }) }
    );
    expect(response.status).toBe(200);
    const change = (await list(500)).find(entry => entry.action === 'variant.price_changed' && entry.detail.sku === sku);
    expect(change).toMatchObject({ actor: 'Johan', label: 'Ändrade listpris' });
    expect(change?.detail).toMatchObject({ före: '100,00', efter: '125,00', sida: 'Franzén' });
  });
});

describe('Översikten', () => {
  it('visar ordrar att skicka, lagerundantag och nya provbeställningar', async () => {
    const toShip = await paidOrder();
    const exception = await paidOrder();
    await getDb().update(orders).set({ status: 'stock_exception' }).where(eq(orders.id, exception));
    const sampleId = await createSampleRequest({
      contactName: 'Olle Översikt',
      organizationName: 'Översiktshotellet AB',
      organizationNumber: '556888-3218',
      email: `oversikt-${Date.now()}@test.linnevik.se`,
      phone: '',
      address: 'Vägen 1',
      postalCode: '111 11',
      city: 'Stockholm',
      country: 'SE',
      items: [],
    });

    const before = await loadOverview();
    // Grenen är en kopia av produktionen. Listorna visar de äldsta först, så
    // det som prövas är att de nya raderna räknas och att de syns när det
    // finns plats.
    const ids = (rows: { id: number }[]) => rows.map(row => row.id);
    const visible = <T extends { id: number }>(list: { rows: T[]; total: number }, id: number) =>
      list.total > list.rows.length || ids(list.rows).includes(id);
    expect(visible(before.needsDecision, exception)).toBe(true);
    expect(ids(before.toShip.rows)).not.toContain(exception);
    expect(visible(before.toShip, toShip)).toBe(true);
    expect(visible(before.newSamples, sampleId)).toBe(true);

    await applyOrderAction({ orderId: toShip, action: 'pause', actor: 'Gabriel' });
    const after = await loadOverview();
    expect(after.toShip.total).toBe(before.toShip.total - 1);
    expect(ids(after.toShip.rows)).not.toContain(toShip);
  });
});
