/**
 * Atomärt lagerskikt. Neon HTTP saknar interaktiva transaktioner, så varje
 * operation är en enda SQL-sats: flera CTE:er i samma `execute`-anrop körs i
 * en och samma databastransaktion, och `for update` inom satsen låser
 * varianterna mot samtidiga reservationer av samma enheter.
 *
 * inventory_quantity = fysiskt saldo. inventory_reserved = bundet av aktiva
 * reservationer. Vad som går att sälja är inventory_quantity - inventory_reserved.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/**
 * Reserve every tracked line of an order, or reserve nothing. This is the
 * checkout policy: stock is bound before Stripe is allowed to accept payment.
 * The statement is both idempotent and concurrency-safe; variant rows are
 * locked in a stable order and all writes are gated by one eligibility result.
 */
export async function reserveOrderStockStrict(
  orderId: number,
  actor = 'checkout',
  expiresAt: Date | null = null
): Promise<boolean> {
  const result = await getDb().execute(sql`
    with tracked_items as materialized (
      select oi.id as order_item_id, oi.variant_id, oi.quantity
      from order_items oi
      join product_variants pv on pv.id = oi.variant_id and pv.inventory_tracked
      where oi.order_id = ${orderId}
    ), locked_variants as materialized (
      select pv.id, pv.inventory_quantity, pv.inventory_reserved
      from product_variants pv
      where pv.id in (select distinct variant_id from tracked_items)
      order by pv.id
      for update
    ), state as materialized (
      select ti.*, lv.inventory_quantity - lv.inventory_reserved as available,
             r.id as reservation_id, r.quantity as reserved_quantity, r.status as reservation_status
      from tracked_items ti
      join locked_variants lv on lv.id = ti.variant_id
      left join inventory_reservations r on r.order_item_id = ti.order_item_id
    ), needed_by_variant as materialized (
      select variant_id, sum(quantity)::int as quantity, min(available)::int as available
      from state where reservation_id is null group by variant_id
    ), eligibility as materialized (
      select
        not exists (
          select 1 from state
          where reservation_id is not null
            and not (reservation_status = 'active' and reserved_quantity >= quantity)
        )
        and not exists (
          select 1 from needed_by_variant where quantity > available
        ) as ok
    ), inserted_reservations as (
      insert into inventory_reservations (
        variant_id, order_id, order_item_id, quantity, status, expires_at
      )
      select state.variant_id, ${orderId}, state.order_item_id, state.quantity, 'active', ${expiresAt}
      from state cross join eligibility
      where eligibility.ok and state.reservation_id is null
      returning id, variant_id, order_item_id, quantity
    ), refreshed_reservations as (
      update inventory_reservations r
      set expires_at = ${expiresAt}, updated_at = now()
      from state cross join eligibility
      where eligibility.ok and r.id = state.reservation_id
        and state.reservation_status = 'active'
    ), reserved_by_variant as (
      select variant_id, sum(quantity)::int as quantity
      from inserted_reservations group by variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = pv.inventory_reserved + rbv.quantity, updated_at = now()
      from reserved_by_variant rbv
      where pv.id = rbv.variant_id
    ), movements as (
      insert into inventory_movements (
        variant_id, type, quantity, order_id, order_item_id, reservation_id, actor
      )
      select variant_id, 'reserve', quantity, ${orderId}, order_item_id, id, ${actor}
      from inserted_reservations
    )
    select ok from eligibility
  `);
  return (result.rows[0] as { ok?: boolean } | undefined)?.ok === true;
}

/**
 * Släpper alla aktiva reservationer för en order — vid makulering eller att
 * en obetald order/faktura gått ut. Idempotent: en order utan aktiva
 * reservationer rör inget.
 */
export async function releaseOrderStock(orderId: number, actor: string, reason?: string): Promise<void> {
  await getDb().execute(sql`
    with active_res as (
      select id, variant_id, quantity from inventory_reservations
      where order_id = ${orderId} and status = 'active'
      for update
    ), released_by_variant as materialized (
      select variant_id, sum(quantity)::int as quantity
      from active_res group by variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = greatest(0, pv.inventory_reserved - rbv.quantity), updated_at = now()
      from released_by_variant rbv
      where pv.id = rbv.variant_id
    ), updated_res as (
      update inventory_reservations r
      set status = 'released', updated_at = now()
      from active_res ar
      where r.id = ar.id
    )
    insert into inventory_movements (variant_id, type, quantity, order_id, reservation_id, actor, note)
    select variant_id, 'release', quantity, ${orderId}, id, ${actor}, ${reason ?? null}
    from active_res
  `);
}

/**
 * Släpper alla reservationer vars expires_at har passerat — för fakturor med
 * betalningsvillkor som aldrig godkänns/betalas i tid. Tänkt att köras
 * periodiskt (cron).
 */
export async function releaseExpiredReservations(actor = 'system'): Promise<number> {
  const result = await getDb().execute(sql`
    with active_res as (
      select id, variant_id, order_id, quantity from inventory_reservations
      where status = 'active' and expires_at is not null and expires_at <= now()
      for update
    ), released_by_variant as materialized (
      select variant_id, sum(quantity)::int as quantity
      from active_res group by variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = greatest(0, pv.inventory_reserved - rbv.quantity), updated_at = now()
      from released_by_variant rbv
      where pv.id = rbv.variant_id
    ), affected_orders as materialized (
      select distinct order_id from active_res
    ), updated_res as (
      update inventory_reservations r
      set status = 'released', updated_at = now()
      from active_res ar
      where r.id = ar.id
    ), movements as (
      insert into inventory_movements (variant_id, type, quantity, order_id, reservation_id, actor, note)
      select variant_id, 'release', quantity, order_id, id, ${actor}, 'Reservation expired'
      from active_res
      returning id
    ), expired_orders as (
      update orders set status = 'expired', payment_status = 'expired', updated_at = now()
      where id in (select order_id from affected_orders)
        and status = 'pending' and payment_status = 'pending'
      returning id, cart_id
    ), reopened_carts as (
      update carts set status = 'active', version = version + 1,
        checkout_started_at = null, updated_at = now()
      where id in (select cart_id from expired_orders where cart_id is not null)
    ), events as (
      insert into order_events (order_id, kind, actor, detail)
      select id, 'payment.expired', ${actor}, jsonb_build_object('reason', 'stock reservation expired')
      from expired_orders
    )
    select count(*)::int as released from movements
  `);
  const row = result.rows[0] as { released: number } | undefined;
  return row ? Number(row.released) : 0;
}

/**
 * Sätter det fysiska saldot för hand — inventering, svinn, en leverans som
 * kommit in. Två skäl att den inte går via `updateVariant`:
 *
 * 1. Saldot får aldrig understiga det som är reserverat av pågående ordrar.
 *    Kolumnernas check-villkor säger samma sak, men ett brutet villkor blir
 *    ett 500 utan förklaring — här blir det ett svar som säger hur många
 *    enheter som är bundna och av vad.
 * 2. Varje annan lagerändring skrivs i inventory_movements. En handpåläggning
 *    som inte gör det är just den rad som saknas den dagen saldot ska förklaras.
 *
 * Rörelsens `quantity` är skillnaden och kan vara negativ — en justering är
 * åt något håll, och magnituden ensam hade inte gått att läsa i efterhand.
 */
export async function setVariantStock(
  variantId: number,
  quantity: number,
  actor: string,
  note?: string | null
): Promise<{ ok: boolean; before: number; reserved: number }> {
  const result = await getDb().execute(sql`
    with locked as materialized (
      select id, inventory_quantity, inventory_reserved, inventory_tracked
      from product_variants where id = ${variantId}
      for update
    ), eligibility as materialized (
      select id, inventory_quantity as before, inventory_reserved as reserved,
             (not inventory_tracked or ${quantity} >= inventory_reserved) as ok
      from locked
    ), updated as (
      update product_variants pv
      set inventory_quantity = ${quantity}, updated_at = now()
      from eligibility e
      where pv.id = e.id and e.ok and e.before <> ${quantity}
    ), movement as (
      insert into inventory_movements (variant_id, type, quantity, actor, note)
      select id, 'adjust', ${quantity} - before, ${actor}, ${note ?? null}
      from eligibility
      where ok and before <> ${quantity}
    )
    select ok, before, reserved from eligibility
  `);
  const row = result.rows[0] as { ok: boolean; before: number; reserved: number } | undefined;
  // Varianten hann tas bort mellan läsningen och den här satsen.
  if (!row) return { ok: false, before: 0, reserved: 0 };
  return { ok: row.ok === true, before: Number(row.before), reserved: Number(row.reserved) };
}

export type InventoryMovementView = {
  id: number;
  type: string;
  quantity: number;
  orderId: number | null;
  note: string | null;
  actor: string;
  createdAt: string;
};

/**
 * Lagerhistoriken för en variant.
 *
 * Tabellen har funnits sedan 0011 och skrivits av varje reservation, plock och
 * retur, men ingen vy visade den — frågan "varför står det 3 här när jag
 * räknade 5 i hyllan" gick bara att svara på i psql. Hämtas per variant och
 * först när raden öppnas, så att produktsidan inte drar hem hela historiken
 * för varenda variant i onödan.
 */
export async function listVariantMovements(
  variantId: number,
  limit = 50
): Promise<InventoryMovementView[]> {
  const result = await getDb().execute(sql`
    select id, type, quantity, order_id, note, actor, created_at
      from inventory_movements
     where variant_id = ${variantId}
     order by created_at desc, id desc
     limit ${limit}
  `);
  return (result.rows as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    type: String(row.type),
    quantity: Number(row.quantity),
    orderId: row.order_id === null || row.order_id === undefined ? null : Number(row.order_id),
    note: (row.note as string | null) ?? null,
    actor: String(row.actor),
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export type LowStockRow = {
  sku: string;
  productTitle: string;
  available: number;
};

/**
 * Varianter som håller på att ta slut.
 *
 * "Tillgängligt" är fysiskt saldo minus det som pågående ordrar reserverat —
 * samma tal som kassan räknar på, inte hyllsaldot. Bara spårade och säljbara
 * varianter räknas: en variant vi ändå inte säljer kan inte ta slut.
 *
 * Frågas av dygnskörningen. Listan är ett larm, inte en rapport: produktlistan
 * i /admin har redan ett "Slut"-filter för den som går och tittar.
 */
export async function lowStockVariants(threshold: number): Promise<LowStockRow[]> {
  const result = await getDb().execute(sql`
    select v.sku, p.title as product_title,
           (v.inventory_quantity - v.inventory_reserved) as available
      from product_variants v
      join products p on p.id = v.product_id
     where v.inventory_tracked
       and v.active and v.available_for_sale
       and p.status = 'active'
       and (v.inventory_quantity - v.inventory_reserved) <= ${threshold}
     order by available asc, v.sku asc
  `);
  return (result.rows as Array<Record<string, unknown>>).map(row => ({
    sku: String(row.sku),
    productTitle: String(row.product_title),
    available: Number(row.available),
  }));
}
