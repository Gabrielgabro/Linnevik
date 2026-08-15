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

export type ReservationShortfall = {
  orderItemId: number;
  variantId: number;
  requested: number;
  reserved: number;
};

/**
 * Binder lager för en betald order (eller en godkänd faktura). Reserverar så
 * mycket som finns kvar av varje spårad variant; räcker det inte loggas en
 * 'oversold'-rörelse så att admin kan hantera restnotering eller återbetalning
 * manuellt — betalningen är redan tagen och kan inte tystas bort här.
 *
 * Körs bara för orderrader som saknar reservation sedan tidigare, så ett
 * omsänt webhook-anrop är ofarligt att köra igen.
 */
export async function reserveOrderStock(
  orderId: number,
  actor = 'system',
  expiresAt: Date | null = null
): Promise<ReservationShortfall[]> {
  const result = await getDb().execute(sql`
    with items as (
      select oi.id as order_item_id, oi.variant_id, oi.quantity
      from order_items oi
      where oi.order_id = ${orderId}
        and oi.variant_id is not null
        and not exists (select 1 from inventory_reservations r where r.order_item_id = oi.id)
    ), locked_variants as (
      select pv.id, pv.inventory_tracked, pv.inventory_quantity, pv.inventory_reserved
      from product_variants pv
      join items on items.variant_id = pv.id
      for update
    ), reserve_calc as (
      select items.order_item_id, items.variant_id, items.quantity,
        case when lv.inventory_tracked
          then greatest(0, least(items.quantity, lv.inventory_quantity - lv.inventory_reserved))
          else items.quantity
        end as reserved_qty
      from items join locked_variants lv on lv.id = items.variant_id
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = pv.inventory_reserved + rc.reserved_qty, updated_at = now()
      from reserve_calc rc
      where pv.id = rc.variant_id and rc.reserved_qty > 0
    ), inserted_reservations as (
      insert into inventory_reservations (variant_id, order_id, order_item_id, quantity, status, expires_at)
      select variant_id, ${orderId}, order_item_id, reserved_qty, 'active', ${expiresAt}
      from reserve_calc where reserved_qty > 0
      returning id, variant_id, order_item_id
    ), reserve_movements as (
      insert into inventory_movements (variant_id, type, quantity, order_id, order_item_id, reservation_id, actor)
      select ir.variant_id, 'reserve', rc.reserved_qty, ${orderId}, ir.order_item_id, ir.id, ${actor}
      from inserted_reservations ir
      join reserve_calc rc on rc.order_item_id = ir.order_item_id
    ), shortfall_movements as (
      insert into inventory_movements (variant_id, type, quantity, order_id, order_item_id, actor, note)
      select rc.variant_id, 'oversold', rc.quantity - rc.reserved_qty, ${orderId}, rc.order_item_id, ${actor},
             'Insufficient stock at reservation time'
      from reserve_calc rc where rc.quantity - rc.reserved_qty > 0
      returning order_item_id
    )
    select rc.order_item_id, rc.variant_id, rc.quantity as requested, rc.reserved_qty as reserved
    from reserve_calc rc
    where rc.quantity - rc.reserved_qty > 0
  `);
  return (result.rows as Array<{ order_item_id: number; variant_id: number; requested: number; reserved: number }>).map(
    row => ({
      orderItemId: Number(row.order_item_id),
      variantId: Number(row.variant_id),
      requested: Number(row.requested),
      reserved: Number(row.reserved),
    })
  );
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
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = greatest(0, pv.inventory_reserved - ar.quantity), updated_at = now()
      from active_res ar
      where pv.id = ar.variant_id
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
    ), updated_variants as (
      update product_variants pv
      set inventory_reserved = greatest(0, pv.inventory_reserved - ar.quantity), updated_at = now()
      from active_res ar
      where pv.id = ar.variant_id
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
    )
    select count(*)::int as released from movements
  `);
  const row = result.rows[0] as { released: number } | undefined;
  return row ? Number(row.released) : 0;
}

/**
 * Drar av det fysiska lagersaldot när en order plockas. Konsumerar aktiva
 * reservationer för de angivna orderraderna — det som redan var bundet blir
 * nu permanent avdraget i stället för bara reserverat. En rad kan plockas i
 * flera omgångar; reservationen minskas i takt med det och markeras 'consumed'
 * först när den är helt förbrukad.
 */
export async function fulfillReservedStock(input: {
  orderId: number;
  fulfillmentId: number;
  items: Array<{ orderItemId: number; quantity: number }>;
  actor: string;
}): Promise<void> {
  if (!input.items.length) return;
  const payload = JSON.stringify(input.items);
  await getDb().execute(sql`
    with input as (
      select * from jsonb_to_recordset(${payload}::jsonb) as x("orderItemId" integer, quantity integer)
    ), res as (
      select r.id, r.variant_id, r.order_item_id, r.quantity as reserved_qty, i.quantity as fulfill_qty
      from inventory_reservations r
      join input i on i."orderItemId" = r.order_item_id
      where r.order_id = ${input.orderId} and r.status = 'active'
      for update
    ), updated_variants as (
      update product_variants pv
      set inventory_quantity = pv.inventory_quantity - res.fulfill_qty,
          inventory_reserved = greatest(0, pv.inventory_reserved - res.fulfill_qty),
          updated_at = now()
      from res
      where pv.id = res.variant_id
    ), updated_res as (
      update inventory_reservations r
      set quantity = greatest(0, res.reserved_qty - res.fulfill_qty),
          status = case when res.reserved_qty - res.fulfill_qty <= 0 then 'consumed' else r.status end,
          updated_at = now()
      from res
      where r.id = res.id
    )
    insert into inventory_movements (variant_id, type, quantity, order_id, order_item_id, fulfillment_id, reservation_id, actor)
    select variant_id, 'fulfill', fulfill_qty, ${input.orderId}, order_item_id, ${input.fulfillmentId}, id, ${input.actor}
    from res
  `);
}

/**
 * Returnerar enheter från en order. `restock` styr om det fysiska saldot ska
 * öka igen (skadat gods vid retur ska t.ex. inte läggas tillbaka).
 */
export async function recordInventoryReturn(input: {
  orderId: number;
  items: Array<{ orderItemId: number; quantity: number }>;
  restock: boolean;
  actor: string;
  note?: string | null;
}): Promise<void> {
  if (!input.items.length) return;
  const payload = JSON.stringify(input.items);
  const movementType = input.restock ? 'return' : 'return_no_restock';

  if (input.restock) {
    await getDb().execute(sql`
      with input as (
        select * from jsonb_to_recordset(${payload}::jsonb) as x("orderItemId" integer, quantity integer)
      ), items as (
        select oi.id as order_item_id, oi.variant_id, i.quantity
        from order_items oi
        join input i on i."orderItemId" = oi.id
        where oi.order_id = ${input.orderId} and oi.variant_id is not null
      ), locked as (
        select pv.id from product_variants pv join items on items.variant_id = pv.id for update
      ), updated_variants as (
        update product_variants pv
        set inventory_quantity = pv.inventory_quantity + items.quantity, updated_at = now()
        from items
        where pv.id = items.variant_id
      )
      insert into inventory_movements (variant_id, type, quantity, order_id, order_item_id, actor, note)
      select variant_id, ${movementType}, quantity, ${input.orderId}, order_item_id, ${input.actor}, ${input.note ?? null}
      from items
    `);
    return;
  }

  await getDb().execute(sql`
    with input as (
      select * from jsonb_to_recordset(${payload}::jsonb) as x("orderItemId" integer, quantity integer)
    ), items as (
      select oi.id as order_item_id, oi.variant_id, i.quantity
      from order_items oi
      join input i on i."orderItemId" = oi.id
      where oi.order_id = ${input.orderId} and oi.variant_id is not null
    )
    insert into inventory_movements (variant_id, type, quantity, order_id, order_item_id, actor, note)
    select variant_id, ${movementType}, quantity, ${input.orderId}, order_item_id, ${input.actor}, ${input.note ?? null}
    from items
  `);
}
