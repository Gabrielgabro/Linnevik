/**
 * Vad admin får göra med en orders status (source_of_truth §8.4–8.13).
 *
 * Orderstatusen följer betalningen av sig själv. Admin sätter den bara genom
 * de här åtgärderna, aldrig till ett godtyckligt värde (A9):
 *
 * - **Pausa** och **återuppta**. En pausad order kan inte skickas (§8.9).
 * - **Avboka** (§8.8). En obetald order avbokas direkt: fakturan makuleras och
 *   lagret släpps. En betald order avbokas tillsammans med en återbetalning
 *   av det som återstår, i samma steg. Ingen betald order blir avbokad med
 *   pengarna kvar hos oss.
 * - **Avsluta**, när allt är skickat eller återbetalat.
 * - **Reservera på nytt**, för ett lagerundantag när lagret är påfyllt (§8.6).
 *
 * En tvist pausar ordern på samma sätt, men det är Stripe som öppnar den. När
 * den är avgjord ändrar systemet ingenting själv (§8.12): admin återupptar
 * eller avslutar, och skriver varför.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orderEvents, orders } from '@/lib/db/schema';
import { reserveOrderStockStrict } from '@/lib/inventoryDb';
import { getOrderById, updateOrderManagement } from '@/lib/ordersDb';
import { orderStatusLabel } from '@/lib/adminLabels';
import { refundOrder } from '@/lib/orderRefunds';

export class OrderActionError extends Error {
  constructor(
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'OrderActionError';
  }
}


export { allowedOrderActions, ORDER_ACTION_LABEL, type OrderAction } from '@/lib/orderActionRules';
import { allowedOrderActions, ORDER_ACTION_LABEL, type OrderAction } from '@/lib/orderActionRules';

const PAID = ['paid', 'partially_refunded', 'refunded'];

/** Statusen ordern hade innan den pausades eller hamnade i tvist. */
async function statusBeforePause(orderId: number): Promise<string | null> {
  const [event] = await getDb()
    .select({ detail: orderEvents.detail })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), inArray(orderEvents.kind, ['order.paused', 'payment.disputed'])))
    .orderBy(desc(orderEvents.id))
    .limit(1);
  const from = (event?.detail as { from?: unknown } | undefined)?.from;
  return typeof from === 'string' && !['on_hold', 'disputed'].includes(from) ? from : null;
}

async function setStatus(orderId: number, from: string, to: string, kind: string, actor: string, detail: object = {}) {
  // Jämför-och-sätt: två samtidiga klick ändrar bara en gång.
  const result = await getDb().execute(sql`
    with changed as (
      update orders set status = ${to}, updated_at = now()
      where id = ${orderId} and status = ${from}
      returning id
    )
    insert into order_events (order_id, kind, actor, detail)
    select id, ${kind}, ${actor}, ${JSON.stringify({ from, to, ...detail })}::jsonb from changed
    returning id
  `);
  if (result.rows.length === 0) throw new OrderActionError('Ordern ändrades samtidigt. Ladda om och försök igen.');
}

export async function applyOrderAction(input: {
  orderId: number;
  action: OrderAction;
  actor: string;
  /** Varför, när admin skrev något. Sparas i orderns historik. */
  note?: string | null;
}): Promise<void> {
  const order = await getOrderById(input.orderId);
  if (!order) throw new OrderActionError('Ordern finns inte.', 404);
  if (!allowedOrderActions(order).includes(input.action)) {
    throw new OrderActionError(`${ORDER_ACTION_LABEL[input.action]} går inte när ordern är ${orderStatusLabel(order.status).toLowerCase()}.`);
  }
  const note = input.note?.trim() || undefined;

  switch (input.action) {
    case 'pause':
      return setStatus(order.id, order.status, 'on_hold', 'order.paused', input.actor, { note });

    case 'resume': {
      // Tillbaka dit ordern var. Saknas spåret följer statusen betalningen.
      const fallback = PAID.includes(order.paymentStatus) ? 'paid' : 'pending';
      const to = (await statusBeforePause(order.id)) ?? fallback;
      return setStatus(order.id, order.status, to, 'order.resumed', input.actor, { note });
    }

    case 'reserve': {
      if (!(await reserveOrderStockStrict(order.id, input.actor, null))) {
        throw new OrderActionError('Lagret räcker fortfarande inte. Fyll på lagret för varorna på ordern och försök igen.');
      }
      return setStatus(order.id, 'stock_exception', 'paid', 'inventory.reserved_again', input.actor, { note });
    }

    case 'close':
      return setStatus(order.id, order.status, 'closed', 'order.closed', input.actor, { note });

    case 'cancel': {
      // En betald order: först tillbaka med det som återstår, i samma steg.
      // Går återbetalningen inte igenom avbokas ingenting.
      const remaining = order.totalMinor - order.refundedMinor;
      if (PAID.includes(order.paymentStatus) && remaining > 0) {
        await refundOrder({
          order,
          amountMinor: remaining,
          reason: 'requested_by_customer',
          note: note ?? 'Avbokad order',
          requestKey: `cancel_${order.id}`,
          actor: input.actor,
        });
      }
      await updateOrderManagement(order.id, { status: 'cancelled' }, input.actor);
      if (note) {
        await getDb().insert(orderEvents).values({ orderId: order.id, kind: 'order.note', actor: input.actor, detail: { note } });
      }
      return;
    }
  }
}

/** Orderns nuvarande status, för svar till admin. */
export async function orderStatus(orderId: number): Promise<string | null> {
  const [row] = await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
  return row?.status ?? null;
}
