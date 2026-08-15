/**
 * Ordrarnas databasskikt. Skilt från kassan i api/checkout därför att både
 * kassan och webhooken skriver här, och adminvyn läser.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  fulfillments,
  orderEvents,
  orderItems,
  orders,
  refunds,
  type FulfillmentRow,
  type OrderEventRow,
  type OrderItemRow,
  type OrderRow,
  type RefundRow,
} from '@/lib/db/schema';
import type { PricedLine } from '@/lib/pricing';
import { upsertCustomerFromCheckout } from '@/lib/commerceOperations';
import { fulfillReservedStock, releaseOrderStock, reserveOrderStock } from '@/lib/inventoryDb';

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };
export type OrderDetail = OrderWithItems & {
  refunds: RefundRow[];
  fulfillments: FulfillmentRow[];
  events: OrderEventRow[];
};

export type OrderSnapshot = {
  customerNo?: string | null;
  discount?: { id: number; code: string; amountMinor: number } | null;
  shipping?: { id: number; name: string; amountMinor: number } | null;
};

/**
 * Läggs upp innan Stripe-sessionen skapas, så att raderna finns kvar även om
 * kunden aldrig betalar. Stripes metadata rymmer bara 500 tecken per fält —
 * en korg med många rader får inte plats där, så ordern bär raderna och
 * sessionen bär bara ordernumret.
 */
export async function createPendingOrder(
  lines: PricedLine[],
  locale: string,
  cart?: { id: string; version: number },
  snapshot: OrderSnapshot = {}
): Promise<number> {
  const subtotal = lines.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);
  const discountMinor = snapshot.discount?.amountMinor ?? 0;
  const shippingMinor = snapshot.shipping?.amountMinor ?? 0;
  const total = Math.max(0, subtotal - discountMinor + shippingMinor);
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
        stripe_session_id, status, payment_status, subtotal_minor,
        discount_code_id, discount_code, discount_minor,
        shipping_rule_id, shipping_method, shipping_minor,
        total_minor, currency, locale, cart_id, cart_version
      )
      select ${pendingSessionId}, 'pending', 'pending', ${subtotal},
             ${snapshot.discount?.id ?? null}, ${snapshot.discount?.code ?? null}, ${discountMinor},
             ${snapshot.shipping?.id ?? null}, ${snapshot.shipping?.name ?? null}, ${shippingMinor},
             ${total}, ${lines[0].currency}, ${locale},
             ${cart?.id ?? null}, ${cart?.version ?? null}
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
  stripeCustomerId?: string | null;
  phone?: string | null;
  customerNo?: string | null;
  customerName: string | null;
  shippingAddress: Record<string, string | null> | null;
  subtotalMinor: number;
  discountMinor?: number;
  shippingMinor?: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}): Promise<void> {
  const customerId = input.email
    ? await upsertCustomerFromCheckout({
        email: input.email,
        stripeCustomerId: input.stripeCustomerId,
        name: input.customerName,
        phone: input.phone,
        customerNo: input.customerNo,
        shippingAddress: input.shippingAddress,
      })
    : null;
  const result = await getDb().execute(sql`
    with updated_order as (
      update orders set
        status = 'paid',
        payment_status = case when refunded_minor > 0 then payment_status else 'paid' end,
        customer_id = ${customerId},
        stripe_payment_intent_id = ${input.paymentIntentId},
        email = ${input.email},
        customer_name = ${input.customerName},
        shipping_address = ${JSON.stringify(input.shippingAddress)}::jsonb,
        subtotal_minor = ${input.subtotalMinor},
        discount_minor = ${input.discountMinor ?? 0},
        shipping_minor = ${input.shippingMinor ?? 0},
        tax_minor = ${input.taxMinor},
        total_minor = ${input.totalMinor},
        currency = ${input.currency},
        updated_at = now()
      where stripe_session_id = ${input.sessionId}
      returning id, cart_id, discount_code_id, discount_minor, email
    ), redemption as (
      insert into discount_redemptions (
        discount_code_id, order_id, customer_id, email, amount_minor
      )
      select discount_code_id, id, ${customerId}, email, discount_minor
      from updated_order where discount_code_id is not null
      on conflict (order_id) do nothing
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      select id, 'payment.paid', 'stripe',
             jsonb_build_object('payment_intent_id', ${input.paymentIntentId})
      from updated_order
    ), cart_update as (
      update carts set status = 'converted', updated_at = now()
      where id in (select cart_id from updated_order where cart_id is not null)
    )
    select id from updated_order
  `);
  const row = result.rows[0] as { id: number } | undefined;
  // Lagret binds efter att ordern är kvitterad som betald, inte innan — annars
  // hade en misslyckad reservation kunnat lämna ordern i limbo. En order utan
  // träff (t.ex. en omsänd webhook för en okänd session) har inget att reservera.
  if (row) await reserveOrderStock(Number(row.id), 'stripe');
}

export async function markOrderFailed(sessionId: string, status: 'expired' | 'failed'): Promise<void> {
  const result = await getDb().execute(sql`
    with updated_order as (
      update orders set status = ${status}, payment_status = ${status}, updated_at = now()
      where stripe_session_id = ${sessionId} and status <> 'paid'
      returning id, cart_id
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      select id, ${`payment.${status}`}, 'stripe', '{}'::jsonb from updated_order
    ), cart_update as (
      update carts set
        status = 'active',
        version = version + 1,
        checkout_started_at = null,
        updated_at = now()
      where id in (select cart_id from updated_order where cart_id is not null)
    )
    select id from updated_order
  `);
  const row = result.rows[0] as { id: number } | undefined;
  // Ingen reservation finns normalt vid det här laget (den görs först när
  // ordern betalas), men det kostar inget att släppa idempotent om en
  // godkänd faktura ändå hann binda lager innan den gick ut/misslyckades.
  if (row) await releaseOrderStock(Number(row.id), 'stripe', `Payment ${status}`);
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

export async function getOrderById(id: number): Promise<OrderDetail | null> {
  const [order] = await getDb().select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const [items, orderRefunds, orderFulfillments, events] = await Promise.all([
    getDb().select().from(orderItems).where(eq(orderItems.orderId, id)),
    getDb().select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.createdAt)),
    getDb().select().from(fulfillments).where(eq(fulfillments.orderId, id)).orderBy(desc(fulfillments.createdAt)),
    getDb().select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
  ]);
  return { ...order, items, refunds: orderRefunds, fulfillments: orderFulfillments, events };
}

export async function updateOrderManagement(
  id: number,
  patch: { status?: string; notes?: string | null },
  actor: string
): Promise<OrderRow | null> {
  const [row] = await getDb()
    .update(orders)
    .set({
      status: patch.status,
      notes: patch.notes,
      cancelledAt: patch.status === 'cancelled' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning();
  if (row) {
    await getDb().insert(orderEvents).values({
      orderId: id,
      kind: 'order.updated',
      actor,
      detail: patch,
    });
  }
  return row ?? null;
}

export async function recordRefund(input: {
  orderId: number;
  stripeRefundId: string;
  amountMinor: number;
  currency: string;
  reason?: string | null;
  status: string;
  note?: string | null;
  actor: string;
}): Promise<RefundRow> {
  const [row] = await getDb()
    .insert(refunds)
    .values({
      orderId: input.orderId,
      stripeRefundId: input.stripeRefundId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reason: input.reason,
      status: input.status,
      note: input.note,
      actor: input.actor,
    })
    .onConflictDoUpdate({
      target: refunds.stripeRefundId,
      set: { status: input.status, updatedAt: new Date() },
    })
    .returning();
  const [{ total }] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.orderId, input.orderId), sql`${refunds.status} in ('pending', 'succeeded')`));
  await getDb().execute(sql`
    update orders set refunded_minor = ${total},
      payment_status = case when ${total} >= total_minor then 'refunded' else 'partially_refunded' end,
      updated_at = now() where id = ${input.orderId}
  `);
  await getDb().insert(orderEvents).values({
    orderId: input.orderId,
    kind: 'refund.created',
    actor: input.actor,
    detail: { stripeRefundId: input.stripeRefundId, amountMinor: input.amountMinor },
  });
  return row;
}

export async function updateRefundStatus(stripeRefundId: string, status: string): Promise<void> {
  await getDb().execute(sql`
    with changed as (
      update refunds set status = ${status}, updated_at = now()
      where stripe_refund_id = ${stripeRefundId}
      returning order_id
    )
    update orders set
      refunded_minor = (
        select coalesce(sum(amount_minor), 0)::int from refunds
        where order_id in (select order_id from changed) and status = 'succeeded'
      ),
      payment_status = case
        when (select coalesce(sum(amount_minor), 0) from refunds
              where order_id in (select order_id from changed) and status = 'succeeded') >= total_minor
          then 'refunded'
        when (select coalesce(sum(amount_minor), 0) from refunds
              where order_id in (select order_id from changed) and status = 'succeeded') > 0
          then 'partially_refunded'
        else 'paid'
      end,
      updated_at = now()
    where id in (select order_id from changed)
  `);
}

export async function createFulfillment(input: {
  orderId: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  note?: string | null;
  items: Array<{ orderItemId: number; quantity: number }>;
  actor: string;
}): Promise<number> {
  if (!input.items.length) throw new Error('At least one fulfillment item is required.');
  const requested = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Fulfillment quantities must be positive integers.');
    }
    requested.set(item.orderItemId, (requested.get(item.orderItemId) ?? 0) + item.quantity);
  }
  const availability = await getDb().execute(sql`
    select oi.id, oi.quantity,
      coalesce(sum(fi.quantity) filter (where f.status <> 'cancelled'), 0)::int as fulfilled
    from order_items oi
    left join fulfillment_items fi on fi.order_item_id = oi.id
    left join fulfillments f on f.id = fi.fulfillment_id
    where oi.order_id = ${input.orderId}
    group by oi.id, oi.quantity
  `);
  const remaining = new Map(
    (availability.rows as Array<{ id: number; quantity: number; fulfilled: number }>).map(row => [
      Number(row.id),
      Number(row.quantity) - Number(row.fulfilled),
    ])
  );
  for (const [id, quantity] of requested) {
    if (!remaining.has(id) || quantity > (remaining.get(id) ?? 0)) {
      throw new Error('Fulfillment quantity exceeds the unfulfilled order quantity.');
    }
  }
  const payload = JSON.stringify(input.items);
  const result = await getDb().execute(sql`
    with new_fulfillment as (
      insert into fulfillments (
        order_id, status, carrier, tracking_number, tracking_url, note,
        shipped_at, delivered_at, created_by
      ) values (
        ${input.orderId}, ${input.status}, ${input.carrier ?? null},
        ${input.trackingNumber ?? null}, ${input.trackingUrl ?? null}, ${input.note ?? null},
        ${input.status === 'shipped' || input.status === 'delivered' ? new Date() : null},
        ${input.status === 'delivered' ? new Date() : null}, ${input.actor}
      ) returning id
    ), payload as (
      select * from jsonb_to_recordset(${payload}::jsonb)
        as x("orderItemId" integer, quantity integer)
    ), inserted_items as (
      insert into fulfillment_items (fulfillment_id, order_item_id, quantity)
      select new_fulfillment.id, payload."orderItemId", payload.quantity
      from new_fulfillment cross join payload
      join order_items on order_items.id = payload."orderItemId"
      where order_items.order_id = ${input.orderId}
      returning fulfillment_id
    ), order_update as (
      update orders set fulfillment_status = ${input.status}, updated_at = now()
      where id = ${input.orderId}
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      values (${input.orderId}, 'fulfillment.created', ${input.actor},
              jsonb_build_object('status', ${input.status}, 'tracking_number', ${input.trackingNumber ?? null}))
    )
    select id from new_fulfillment
  `);
  const row = result.rows[0] as { id: number } | undefined;
  if (!row) throw new Error('Order could not be fulfilled.');
  return Number(row.id);
}
