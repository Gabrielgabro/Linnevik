/**
 * Ordrarnas databasskikt. Skilt från kassan i api/checkout därför att både
 * kassan och webhooken skriver här, och adminvyn läser.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  fulfillments,
  customers,
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
import { vatOn } from '@/lib/vat';
import { upsertCustomerFromCheckout } from '@/lib/commerceOperations';
import { stripeTestMode } from '@/lib/stripe';
import { releaseOrderStock, reserveOrderStockStrict } from '@/lib/inventoryDb';

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

/** Orderrad med hur mycket av den som redan gått ut genom dörren. */
export type OrderItemProgress = OrderItemRow & {
  fulfilledQuantity: number;
  remainingQuantity: number;
};

// Omit: en ren korsning hade gett `items` typen OrderItemRow[] & OrderItemProgress[],
// och då plockar TypeScript elementtypen ur den första — fälten nedan syns inte.
export type OrderDetail = Omit<OrderWithItems, 'items'> & {
  clientId: number | null;
  items: OrderItemProgress[];
  refunds: RefundRow[];
  fulfillments: FulfillmentRow[];
  events: OrderEventRow[];
};

/**
 * Hur många enheter per orderrad som redan är levererade. Makulerade
 * försändelser räknas inte — de har lämnat tillbaka sitt utrymme.
 *
 * Både spärren i `createFulfillment` och adminformuläret läser härifrån. Ligger
 * de på var sitt uttryck börjar de förr eller senare svara olika, och då visar
 * formuläret en ruta som servern sedan nekar.
 */
async function fulfilledPerItem(orderId: number): Promise<Map<number, number>> {
  const result = await getDb().execute(sql`
    select oi.id,
      coalesce(sum(fi.quantity) filter (where f.status <> 'cancelled'), 0)::int as fulfilled
    from order_items oi
    left join fulfillment_items fi on fi.order_item_id = oi.id
    left join fulfillments f on f.id = fi.fulfillment_id
    where oi.order_id = ${orderId}
    group by oi.id
  `);
  return new Map(
    (result.rows as Array<{ id: number; fulfilled: number }>).map(row => [
      Number(row.id),
      Number(row.fulfilled),
    ])
  );
}

export type OrderSnapshot = {
  customerNo?: string | null;
  discount?: { id: number; code: string; amountMinor: number } | null;
  shipping?: { id: number; name: string; amountMinor: number } | null;
  /** Hur momsen räknades vid köpet. Se lib/vat.ts och migration 0021. */
  vat?: { mode: 'explicit' | 'automatic'; bps: number; rateId: string | null } | null;
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
  const netMinor = Math.max(0, subtotal - discountMinor + shippingMinor);
  // Beloppen är exklusive moms. Den förväntade momsen skrivs in redan här så
  // att en obetald order inte påstår att den är momsfri; webhooken skriver
  // sedan över med Stripes faktiska `amount_tax` när betalningen är gjord.
  //
  // Frakten räknas med i underlaget: den är momspliktig i båda lägena — som en
  // momsad orderrad när satsen sätts för hand, och genom sin skattekod när
  // Stripe Tax räknar. Förut låg frakten på en fraktrad utan sats, och då
  // stämde inte det här förhandsbeloppet med vad Stripe sedan debiterade.
  const taxMinor = vatOn(netMinor, snapshot.vat ? snapshot.vat.bps / 100 : undefined);
  const total = netMinor + taxMinor;
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
        tax_minor, vat_mode, vat_bps, vat_rate_id,
        total_minor, currency, locale, cart_id, cart_version, test_mode
      )
      select ${pendingSessionId}, 'pending', 'pending', ${subtotal},
             ${snapshot.discount?.id ?? null}, ${snapshot.discount?.code ?? null}, ${discountMinor},
             ${snapshot.shipping?.id ?? null}, ${snapshot.shipping?.name ?? null}, ${shippingMinor},
             ${taxMinor}, ${snapshot.vat?.mode ?? null}, ${snapshot.vat?.bps ?? null},
             ${snapshot.vat?.rateId ?? null},
             ${total}, ${lines[0].currency}, ${locale},
             ${cart?.id ?? null}, ${cart?.version ?? null}, ${stripeTestMode()}
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
  const [attached] = await getDb()
    .update(orders)
    .set({ stripeSessionId: sessionId, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), sql`${orders.stripeSessionId} like 'pending_%'`))
    .returning({ id: orders.id });
  if (!attached) {
    const [existing] = await getDb()
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.stripeSessionId, sessionId)))
      .limit(1);
    if (!existing) throw new Error('Stripe session could not be attached to the order.');
  }
}

/**
 * Recover the order/session link from metadata when session creation succeeded
 * but the following database write did not. Unknown Stripe sessions are never
 * allowed to create customers or orders through the webhook.
 */
export async function reconcileOrderSession(
  orderId: number | null,
  sessionId: string
): Promise<number | null> {
  const result = await getDb().execute(sql`
    update orders set stripe_session_id = ${sessionId}, updated_at = now()
    where stripe_session_id = ${sessionId}
       or (
         id = ${orderId}
         and ${orderId}::int is not null
         and stripe_session_id like 'pending_%'
         and status = 'pending'
       )
    returning id
  `);
  const row = result.rows[0] as { id: number } | undefined;
  return row ? Number(row.id) : null;
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
  /** Fakturaadressen — en momsfaktura måste bära köparens uppgifter. */
  billingAddress?: Record<string, string | null> | null;
  /** Köparens org-/VAT-nummer som Stripe samlade in, t.ex. `eu_vat`/`se_vat`. */
  taxId?: { type: string; value: string } | null;
  subtotalMinor: number;
  discountMinor?: number;
  shippingMinor?: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}): Promise<{ orderId: number; stockReady: boolean; newlyPaid: boolean }> {
  const [target] = await getDb()
    .select({ id: orders.id, paymentStatus: orders.paymentStatus, status: orders.status })
    .from(orders)
    .where(eq(orders.stripeSessionId, input.sessionId))
    .limit(1);
  if (!target) throw new Error(`No Linnevik order is linked to Stripe session ${input.sessionId}.`);
  const newlyPaid = !['paid', 'partially_refunded', 'refunded'].includes(target.paymentStatus);

  // A second successful event (or scheduled reconciliation) must not inspect
  // a reservation that fulfillment may already have consumed. The first paid
  // transition owns the stock, customer and event writes.
  if (!newlyPaid) {
    return {
      orderId: target.id,
      stockReady: target.status !== 'stock_exception',
      newlyPaid: false,
    };
  }

  // New checkouts arrive here with an active pre-payment reservation. For an
  // older session created before that policy, this makes one strict recovery
  // attempt. It either reserves every tracked line or none.
  const stockReady = await reserveOrderStockStrict(target.id, 'stripe', null);
  const customerId = input.email
    ? await upsertCustomerFromCheckout({
        email: input.email,
        stripeCustomerId: input.stripeCustomerId,
        name: input.customerName,
        phone: input.phone,
        customerNo: input.customerNo,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        taxId: input.taxId,
      })
    : null;
  const result = await getDb().execute(sql`
    with updated_order as (
      update orders set
        status = ${stockReady ? 'paid' : 'stock_exception'},
        payment_status = case when refunded_minor > 0 then payment_status else 'paid' end,
        customer_id = ${customerId},
        stripe_payment_intent_id = ${input.paymentIntentId},
        email = ${input.email},
        customer_name = ${input.customerName},
        shipping_address = ${JSON.stringify(input.shippingAddress)}::jsonb,
        billing_address = ${JSON.stringify(input.billingAddress ?? null)}::jsonb,
        -- coalesce: en omsänd webhook utan uppgifterna ska inte radera dem.
        tax_id_type = coalesce(${input.taxId?.type ?? null}, orders.tax_id_type),
        tax_id_value = coalesce(${input.taxId?.value ?? null}, orders.tax_id_value),
        subtotal_minor = ${input.subtotalMinor},
        discount_minor = ${input.discountMinor ?? 0},
        shipping_minor = ${input.shippingMinor ?? 0},
        tax_minor = ${input.taxMinor},
        total_minor = ${input.totalMinor},
        currency = ${input.currency},
        updated_at = now()
      where id = ${target.id} and stripe_session_id = ${input.sessionId}
        and payment_status not in ('paid', 'partially_refunded', 'refunded')
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
             -- Explicit ::text: jsonb_build_object tar "any", och Postgres kan
             -- inte härleda typen på en obunden parameter där. Utan casten
             -- faller hela satsen på "could not determine data type".
             jsonb_build_object('payment_intent_id', ${input.paymentIntentId}::text)
      from updated_order
    ), stock_event as (
      insert into order_events (order_id, kind, actor, detail)
      select id, 'inventory.stock_exception', 'system',
             jsonb_build_object('reason', 'Paid order has no complete stock reservation')
      from updated_order where not ${stockReady}
    ), cart_update as (
      update carts set status = 'converted', updated_at = now()
      where id in (select cart_id from updated_order where cart_id is not null)
    )
    select id from updated_order
  `);
  const row = result.rows[0] as { id: number } | undefined;
  if (!row) {
    // Another paid event won the compare-and-set after our initial read.
    const [current] = await getDb()
      .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(and(eq(orders.id, target.id), eq(orders.stripeSessionId, input.sessionId)))
      .limit(1);
    if (current && ['paid', 'partially_refunded', 'refunded'].includes(current.paymentStatus)) {
      return {
        orderId: current.id,
        stockReady: current.status !== 'stock_exception',
        newlyPaid: false,
      };
    }
    throw new Error('Paid order could not be updated.');
  }
  return { orderId: Number(row.id), stockReady, newlyPaid };
}

/** Release a pre-payment reservation and reopen its cart after setup failed. */
export async function abandonPendingOrder(orderId: number, reason: string): Promise<void> {
  await releaseOrderStock(orderId, 'checkout', reason);
  await getDb().execute(sql`
    with failed_order as (
      update orders set status = 'failed', payment_status = 'failed', updated_at = now()
      where id = ${orderId} and status = 'pending' and payment_status = 'pending'
      returning id, cart_id
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      select id, 'payment.failed', 'checkout', jsonb_build_object('reason', ${reason}::text)
      from failed_order
    )
    update carts set status = 'active', version = version + 1,
      checkout_started_at = null, updated_at = now()
    where id in (select cart_id from failed_order where cart_id is not null)
  `);
}

export async function markOrderFailed(sessionId: string, status: 'expired' | 'failed'): Promise<void> {
  const result = await getDb().execute(sql`
    with updated_order as (
      update orders set status = ${status}, payment_status = ${status}, updated_at = now()
      where stripe_session_id = ${sessionId} and payment_status = 'pending'
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
  // Checkout binds stock before payment, so a failed/expired session releases
  // it and makes the cart editable again.
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
  const [items, orderRefunds, orderFulfillments, events, fulfilled, customer] = await Promise.all([
    getDb().select().from(orderItems).where(eq(orderItems.orderId, id)),
    getDb().select().from(refunds).where(eq(refunds.orderId, id)).orderBy(desc(refunds.createdAt)),
    getDb().select().from(fulfillments).where(eq(fulfillments.orderId, id)).orderBy(desc(fulfillments.createdAt)),
    getDb().select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt)),
    fulfilledPerItem(id),
    order.customerId
      ? getDb()
          .select({ clientId: customers.clientId })
          .from(customers)
          .where(eq(customers.id, order.customerId))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const withProgress: OrderItemProgress[] = items.map(item => {
    const fulfilledQuantity = fulfilled.get(item.id) ?? 0;
    return {
      ...item,
      fulfilledQuantity,
      remainingQuantity: Math.max(0, item.quantity - fulfilledQuantity),
    };
  });
  return {
    ...order,
    clientId: customer[0]?.clientId ?? null,
    items: withProgress,
    refunds: orderRefunds,
    fulfillments: orderFulfillments,
    events,
  };
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
    if (patch.status === 'cancelled') {
      await releaseOrderStock(id, actor, 'Order cancelled');
    }
  }
  return row ?? null;
}

export async function recordRefund(input: {
  orderId: number;
  stripeRefundId: string;
  amountMinor: number;
  /** Utgående moms som återbetalningen vänder tillbaka. Se vat.refundVatMinor. */
  taxMinor: number;
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
      taxMinor: input.taxMinor,
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
    detail: {
      stripeRefundId: input.stripeRefundId,
      amountMinor: input.amountMinor,
      taxMinor: input.taxMinor,
    },
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
  status: 'shipped' | 'delivered';
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
  const payload = JSON.stringify(
    [...requested].map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
  );
  const result = await getDb().execute(sql`
    with locked_order as materialized (
      select id from orders
      where id = ${input.orderId}
        and payment_status in ('paid', 'partially_refunded')
        and status not in ('cancelled', 'failed', 'expired', 'stock_exception')
      for update
    ), requested as materialized (
      select "orderItemId" as order_item_id, sum(quantity)::int as quantity
      from jsonb_to_recordset(${payload}::jsonb)
        as x("orderItemId" integer, quantity integer)
      group by "orderItemId"
    ), order_lines as materialized (
      select oi.id, oi.quantity as ordered_quantity, oi.variant_id,
             coalesce(pv.inventory_tracked, false) as inventory_tracked,
             coalesce(pv.inventory_quantity, 0) as inventory_quantity,
             coalesce((
               select sum(fi.quantity) from fulfillment_items fi
               join fulfillments f on f.id = fi.fulfillment_id
               where fi.order_item_id = oi.id and f.status <> 'cancelled'
             ), 0)::int as fulfilled_quantity,
             r.id as reservation_id, r.quantity as reserved_quantity, r.status as reservation_status
      from locked_order lo
      join order_items oi on oi.order_id = lo.id
      left join product_variants pv on pv.id = oi.variant_id
      left join inventory_reservations r on r.order_item_id = oi.id
    ), validation as materialized (
      select
        exists (select 1 from locked_order)
        and not exists (
          select 1 from requested req
          left join order_lines ol on ol.id = req.order_item_id
          where ol.id is null
             or req.quantity < 1
             or req.quantity > ol.ordered_quantity - ol.fulfilled_quantity
             or (ol.inventory_tracked and (
                  ol.reservation_status <> 'active'
                  or coalesce(ol.reserved_quantity, 0) < req.quantity
                  or ol.inventory_quantity < req.quantity
                ))
        ) as ok
    ), new_fulfillment as (
      insert into fulfillments (
        order_id, status, carrier, tracking_number, tracking_url, note,
        shipped_at, delivered_at, created_by
      )
      select ${input.orderId}, ${input.status}, ${input.carrier ?? null},
        ${input.trackingNumber ?? null}, ${input.trackingUrl ?? null}, ${input.note ?? null},
        ${new Date()},
        ${input.status === 'delivered' ? new Date() : null}, ${input.actor}
      from validation where ok
      returning id
    ), inserted_items as (
      insert into fulfillment_items (fulfillment_id, order_item_id, quantity)
      select nf.id, req.order_item_id, req.quantity
      from new_fulfillment nf cross join requested req
      returning fulfillment_id, order_item_id, quantity
    ), stock_by_variant as materialized (
      select ol.variant_id, sum(ii.quantity)::int as quantity
      from inserted_items ii join order_lines ol on ol.id = ii.order_item_id
      where ol.inventory_tracked
      group by ol.variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_quantity = pv.inventory_quantity - sbv.quantity,
          inventory_reserved = pv.inventory_reserved - sbv.quantity,
          updated_at = now()
      from stock_by_variant sbv
      where pv.id = sbv.variant_id
    ), updated_reservations as (
      update inventory_reservations r
      set quantity = r.quantity - ii.quantity,
          status = case when r.quantity - ii.quantity = 0 then 'consumed' else 'active' end,
          updated_at = now()
      from inserted_items ii join order_lines ol on ol.id = ii.order_item_id
      where r.id = ol.reservation_id and ol.inventory_tracked
    ), movements as (
      insert into inventory_movements (
        variant_id, type, quantity, order_id, order_item_id,
        fulfillment_id, reservation_id, actor
      )
      select ol.variant_id, 'fulfill', ii.quantity, ${input.orderId}, ii.order_item_id,
             ii.fulfillment_id, ol.reservation_id, ${input.actor}
      from inserted_items ii join order_lines ol on ol.id = ii.order_item_id
      where ol.inventory_tracked
    ), totals as materialized (
      select sum(ol.ordered_quantity)::int as ordered,
             sum(ol.fulfilled_quantity + coalesce(req.quantity, 0))::int as fulfilled
      from order_lines ol left join requested req on req.order_item_id = ol.id
    ), order_update as (
      update orders set
        fulfillment_status = case when totals.fulfilled >= totals.ordered then 'fulfilled' else 'partial' end,
        updated_at = now()
      from totals
      where id = ${input.orderId} and exists (select 1 from new_fulfillment)
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      select ${input.orderId}, 'fulfillment.created', ${input.actor},
             jsonb_build_object('status', ${input.status}::text,
                                'tracking_number', ${input.trackingNumber ?? null}::text)
      from new_fulfillment
    )
    select id from new_fulfillment
  `);
  const row = result.rows[0] as { id: number } | undefined;
  if (!row) throw new Error('Order could not be fulfilled.');
  const fulfillmentId = Number(row.id);
  return fulfillmentId;
}

/**
 * Returnerade enheter — separat från en Stripe-återbetalning, som bara rör
 * pengar. `restock` avgör om enheterna går tillbaka till säljbart saldo.
 */
export async function returnOrderItems(input: {
  orderId: number;
  items: Array<{ orderItemId: number; quantity: number }>;
  restock: boolean;
  actor: string;
  note?: string | null;
}): Promise<void> {
  if (!input.items.length) throw new Error('At least one return item is required.');
  const requested = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Return quantities must be positive integers.');
    }
    requested.set(item.orderItemId, (requested.get(item.orderItemId) ?? 0) + item.quantity);
  }
  const items = [...requested].map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const payload = JSON.stringify(items);
  const movementType = input.restock ? 'return' : 'return_no_restock';
  const result = await getDb().execute(sql`
    with locked_order as materialized (
      select id from orders where id = ${input.orderId} for update
    ), requested as materialized (
      select "orderItemId" as order_item_id, sum(quantity)::int as quantity
      from jsonb_to_recordset(${payload}::jsonb)
        as x("orderItemId" integer, quantity integer)
      group by "orderItemId"
    ), progress as materialized (
      select oi.id, oi.variant_id, coalesce(pv.inventory_tracked, false) as inventory_tracked,
             coalesce((
               select sum(fi.quantity) from fulfillment_items fi
               join fulfillments f on f.id = fi.fulfillment_id
               where fi.order_item_id = oi.id and f.status <> 'cancelled'
             ), 0)::int as fulfilled_quantity,
             coalesce((select sum(oir.quantity) from order_item_returns oir
                       where oir.order_item_id = oi.id), 0)::int as returned_quantity
      from locked_order lo
      join order_items oi on oi.order_id = lo.id
      left join product_variants pv on pv.id = oi.variant_id
    ), validation as materialized (
      select exists (select 1 from locked_order)
        and not exists (
          select 1 from requested req
          left join progress p on p.id = req.order_item_id
          where p.id is null or req.quantity < 1
             or req.quantity > p.fulfilled_quantity - p.returned_quantity
        ) as ok
    ), accepted as materialized (
      select req.*, p.variant_id, p.inventory_tracked
      from requested req join progress p on p.id = req.order_item_id
      cross join validation where validation.ok
    ), inserted_returns as (
      insert into order_item_returns (
        order_id, order_item_id, quantity, restock, actor, note
      )
      select ${input.orderId}, order_item_id, quantity, ${input.restock},
             ${input.actor}, ${input.note ?? null}
      from accepted
      returning id, order_item_id, quantity
    ), stock_by_variant as materialized (
      select variant_id, sum(quantity)::int as quantity
      from accepted
      where ${input.restock} and inventory_tracked
      group by variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_quantity = pv.inventory_quantity + sbv.quantity, updated_at = now()
      from stock_by_variant sbv where pv.id = sbv.variant_id
    ), movements as (
      insert into inventory_movements (
        variant_id, type, quantity, order_id, order_item_id, actor, note
      )
      select variant_id, ${movementType}, quantity, ${input.orderId}, order_item_id,
             ${input.actor}, ${input.note ?? null}
      from accepted where inventory_tracked and exists (select 1 from inserted_returns)
      returning id
    ), event as (
      insert into order_events (order_id, kind, actor, detail)
      select ${input.orderId}, 'inventory.returned', ${input.actor},
             jsonb_build_object('items', ${payload}::jsonb, 'restock', ${input.restock},
                                'note', ${input.note ?? null}::text)
      from validation where ok
      returning id
    )
    select id from event
  `);
  if (!result.rows.length) {
    throw new Error('Return quantity exceeds the fulfilled quantity that has not already been returned.');
  }
}
