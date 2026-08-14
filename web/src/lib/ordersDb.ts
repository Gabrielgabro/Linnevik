/**
 * Ordrarnas databasskikt. Skilt från kassan i api/checkout därför att både
 * kassan och webhooken skriver här, och adminvyn läser.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
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
  locale: string,
  cart?: { id: string; version: number }
): Promise<number> {
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);
  const pendingSessionId = `pending_${crypto.randomUUID()}`;
  const payload = JSON.stringify(
    lines.map(line => ({
      variantId: line.variantId,
      sku: line.sku,
      title: line.title,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
    }))
  );

  // Neon HTTP saknar interaktiva transaktioner. En enda dataändrande CTE gör
  // därför orderhuvud + rader atomiska ändå. För en egen korg krävs exakt den
  // version som prissattes; en samtidig korgändring kan inte frysa gamla rader.
  const result = await getDb().execute(sql`
    with eligible_cart as (
      select id from carts
      where id = ${cart?.id ?? null}
        and version = ${cart?.version ?? null}
        and status = 'active'
        and expires_at > now()
      for update
    ), new_order as (
      insert into orders (
        stripe_session_id, status, subtotal_minor, total_minor, currency, locale,
        cart_id, cart_version
      )
      select ${pendingSessionId}, 'pending', ${subtotal}, ${subtotal}, ${lines[0].currency},
             ${locale}, ${cart?.id ?? null}, ${cart?.version ?? null}
      where ${cart?.id ?? null}::text is null
         or exists (select 1 from eligible_cart)
      on conflict (cart_id, cart_version)
        where cart_id is not null and cart_version is not null
        do nothing
      returning id
    ), payload as (
      select * from jsonb_to_recordset(${payload}::jsonb) as x(
        "variantId" integer,
        sku text,
        title text,
        quantity integer,
        "unitAmountMinor" integer
      )
    ), inserted_items as (
      insert into order_items (order_id, variant_id, sku, title, quantity, unit_amount_minor)
      select new_order.id, payload."variantId", payload.sku, payload.title,
             payload.quantity, payload."unitAmountMinor"
      from new_order cross join payload
      returning order_id
    )
    select id from new_order
    union all
    select id from orders
    where cart_id = ${cart?.id ?? null} and cart_version = ${cart?.version ?? null}
      and not exists (select 1 from new_order)
    limit 1
  `);
  const row = (result.rows as Array<{ id: number }>)[0];
  if (!row) throw new Error('Cart changed while checkout was starting.');
  return Number(row.id);
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
  await getDb().execute(sql`
    with updated_order as (
      update orders set
        status = 'paid',
        stripe_payment_intent_id = ${input.paymentIntentId},
        email = ${input.email},
        customer_name = ${input.customerName},
        shipping_address = ${JSON.stringify(input.shippingAddress)}::jsonb,
        subtotal_minor = ${input.subtotalMinor},
        tax_minor = ${input.taxMinor},
        total_minor = ${input.totalMinor},
        currency = ${input.currency},
        updated_at = now()
      where stripe_session_id = ${input.sessionId}
      returning cart_id
    )
    update carts set status = 'converted', updated_at = now()
    where id in (select cart_id from updated_order where cart_id is not null)
  `);
}

export async function markOrderFailed(sessionId: string, status: 'expired' | 'failed'): Promise<void> {
  await getDb().execute(sql`
    with updated_order as (
      update orders set status = ${status}, updated_at = now()
      where stripe_session_id = ${sessionId} and status <> 'paid'
      returning cart_id
    )
    update carts set
      status = 'active',
      version = version + 1,
      checkout_started_at = null,
      updated_at = now()
    where id in (select cart_id from updated_order where cart_id is not null)
  `);
}

export async function getOrderBySession(sessionId: string): Promise<OrderWithItems | null> {
  const [order] = await getDb().select().from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);
  if (!order) return null;
  const items = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

export async function getOrderByCartVersion(
  cartId: string,
  cartVersion: number
): Promise<OrderWithItems | null> {
  const [order] = await getDb()
    .select()
    .from(orders)
    .where(and(eq(orders.cartId, cartId), eq(orders.cartVersion, cartVersion)))
    .limit(1);
  if (!order) return null;
  const items = await getDb().select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { ...order, items };
}

export async function listRecentOrders(limit = 50): Promise<OrderRow[]> {
  return getDb().select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
}
