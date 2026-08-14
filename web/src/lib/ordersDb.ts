/**
 * Ordrarnas databasskikt. Skilt från kassan i api/checkout därför att både
 * kassan och webhooken skriver här, och adminvyn läser.
 */

import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orderItems, orders, type OrderItemRow, type OrderRow } from '@/lib/db/schema';
import type { PricedLine } from '@/lib/pricing';

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/**
 * Läggs upp innan Stripe-sessionen skapas, så att raderna finns kvar även om
 * kunden aldrig betalar. Stripes metadata rymmer bara 500 tecken per fält —
 * en korg med många rader får inte plats där, så ordern bär raderna och
 * sessionen bär bara ordernumret.
 */
export async function createPendingOrder(
  lines: PricedLine[],
  locale: string
): Promise<number> {
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);

  const [order] = await getDb()
    .insert(orders)
    .values({
      // Fylls i när sessionen finns; unikt index tillåter inte NULL-dubbletter
      // så ett provisoriskt värde används tills dess.
      stripeSessionId: `pending_${crypto.randomUUID()}`,
      status: 'pending',
      subtotalMinor: subtotal,
      totalMinor: subtotal,
      currency: lines[0].currency,
      locale,
    })
    .returning({ id: orders.id });

  await getDb().insert(orderItems).values(
    lines.map(line => ({
      orderId: order.id,
      variantId: line.variantId,
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
    }))
  );

  return order.id;
}

export async function attachSession(orderId: number, sessionId: string): Promise<void> {
  await getDb()
    .update(orders)
    .set({ stripeSessionId: sessionId, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

/**
 * Skrivs av webhooken. Beloppen tas från Stripe och inte från vår egen
 * uträkning: det är dem kunden faktiskt debiterats.
 *
 * Idempotent — en omsänd webhook skriver samma värden igen utan att skapa
 * något nytt.
 */
export async function markOrderPaid(input: {
  sessionId: string;
  paymentIntentId: string | null;
  email: string | null;
  customerName: string | null;
  shippingAddress: Record<string, string | null> | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}): Promise<void> {
  await getDb()
    .update(orders)
    .set({
      status: 'paid',
      stripePaymentIntentId: input.paymentIntentId,
      email: input.email,
      customerName: input.customerName,
      shippingAddress: input.shippingAddress,
      subtotalMinor: input.subtotalMinor,
      taxMinor: input.taxMinor,
      totalMinor: input.totalMinor,
      currency: input.currency,
      updatedAt: new Date(),
    })
    .where(eq(orders.stripeSessionId, input.sessionId));
}

export async function markOrderFailed(sessionId: string, status: 'expired' | 'failed'): Promise<void> {
  await getDb()
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.stripeSessionId, sessionId));
}

export async function getOrderBySession(sessionId: string): Promise<OrderWithItems | null> {
  const [order] = await getDb().select().from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);
  if (!order) return null;
  const items = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

export async function listRecentOrders(limit = 50): Promise<OrderRow[]> {
  return getDb().select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
}
