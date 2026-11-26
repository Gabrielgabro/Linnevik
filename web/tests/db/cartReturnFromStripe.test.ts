/**
 * §5.5: när kunden går till kassan fryses korgen. Avbryter kunden hos Stripe
 * och går tillbaka kommer hen till samma korg, med samma varor, och kan
 * ändra eller försöka igen (A4). Förr svarade korgen 404 och webbläsaren
 * glömde den.
 *
 * Ordern här har ingen riktig Stripe-session (id:t börjar med `pending_`),
 * så ingen betalsida behöver stängas. Att en öppen betalsida stängs görs av
 * `retireAttempt`, samma funktion som kassan redan använde.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orders, productVariants } from '@/lib/db/schema';
import {
  createOwnedCart,
  getOwnedCart,
  markOwnedCartCheckoutStarted,
  setOwnedCartItem,
  updateOwnedCartItem,
} from '@/lib/cartDb';
import { createPendingOrder } from '@/lib/ordersDb';
import { reserveOrderStockStrict } from '@/lib/inventoryDb';
import { createProduct, createVariant } from '@/lib/productsDb';
import { GET } from '../../app/api/store/cart/[id]/route';

let variantId: number;

beforeAll(async () => {
  process.env.OWNED_COMMERCE_ENABLED = 'true';
  const product = await createProduct({ title: `A4 ${Date.now()}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `A4-${Date.now()}`,
    priceMinor: 10_000,
    inventoryTracked: true,
    inventoryQuantity: 10,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

async function goToCheckout(paymentMethod: 'checkout' | 'invoice' = 'checkout') {
  const cart = await createOwnedCart();
  await setOwnedCartItem(cart.id, variantId, 2);
  const frozen = (await getOwnedCart(cart.id))!;
  const orderId = await createPendingOrder(
    frozen.lines.map(line => ({
      variantId: line.variantId,
      sku: line.sku,
      title: line.productTitle,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      currency: line.currency,
      stripeProductId: null,
    })),
    'sv',
    { id: frozen.id, version: frozen.version },
    { paymentMethod }
  );
  expect(await reserveOrderStockStrict(orderId, 'checkout', new Date(Date.now() + 45 * 60_000))).toBe(true);
  await markOwnedCartCheckoutStarted(frozen.id, frozen.version);
  return { cartId: frozen.id, version: frozen.version, orderId };
}

async function getCart(id: string) {
  return GET(new NextRequest(`http://localhost/api/store/cart/${id}`), { params: Promise.resolve({ id }) });
}

async function reserved() {
  const [row] = await getDb()
    .select({ reserved: productVariants.inventoryReserved })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row.reserved;
}

describe('varukorgen efter ett avbrutet kortköp', () => {
  it('finns kvar med samma varor', async () => {
    const { cartId } = await goToCheckout();
    const response = await getCart(cartId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cart.lines).toHaveLength(1);
    expect(body.cart.lines[0]).toMatchObject({ variantId, quantity: 2 });
  });

  it('öppnas av första ändringen, och lagret släpps', async () => {
    const before = await reserved();
    const { cartId, version, orderId } = await goToCheckout();
    expect(await reserved()).toBe(before + 2);

    const frozen = (await getOwnedCart(cartId))!;
    await updateOwnedCartItem(cartId, frozen.lines[0].id, 3);

    const cart = (await getOwnedCart(cartId))!;
    expect(cart.status).toBe('active');
    expect(cart.version).toBeGreaterThan(version);
    expect(cart.lines[0].quantity).toBe(3);
    const [order] = await getDb().select().from(orders).where(eq(orders.id, orderId));
    expect(order.paymentStatus).toBe('failed');
    expect(await reserved()).toBe(before);
  });

  it('glöms när ordern är en faktura, som redan är ett köp', async () => {
    const { cartId } = await goToCheckout('invoice');
    expect((await getCart(cartId)).status).toBe(404);
    const frozen = (await getOwnedCart(cartId))!;
    await expect(updateOwnedCartItem(cartId, frozen.lines[0].id, 3)).rejects.toThrow('kan inte längre ändras');
  });
});
