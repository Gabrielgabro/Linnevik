/**
 * Vilka åtgärder en order tillåter (source_of_truth §8.5). Ren logik utan
 * databas, så att både servern och knapparna i admin läser samma regler.
 * Se orderActions.ts för vad åtgärderna gör.
 */

import type { OrderWithItems } from '@/lib/ordersDb';

export type OrderAction = 'pause' | 'resume' | 'cancel' | 'close' | 'reserve';

export const ORDER_ACTION_LABEL: Record<OrderAction, string> = {
  pause: 'Pausa',
  resume: 'Återuppta',
  cancel: 'Avboka',
  close: 'Avsluta',
  reserve: 'Reservera lager på nytt',
};

export type OrderState = Pick<OrderWithItems, 'status' | 'paymentStatus' | 'fulfillmentStatus'>;

const PAID = ['paid', 'partially_refunded', 'refunded'];
const FINAL = ['cancelled', 'closed', 'failed', 'expired'];

/** Åtgärderna som går att göra i orderns nuvarande läge. */
export function allowedOrderActions(order: OrderState): OrderAction[] {
  if (FINAL.includes(order.status)) return [];
  const actions: OrderAction[] = [];
  const paused = order.status === 'on_hold' || order.status === 'disputed';
  if (paused) actions.push('resume');
  else actions.push('pause');
  if (order.status === 'stock_exception') actions.push('reserve');
  // Något som redan har skickats avbokas inte. Det går tillbaka som retur och
  // återbetalning. En order under tvist rör vi inte: pengarna hålls av Stripe.
  if (order.fulfillmentStatus === 'unfulfilled' && order.status !== 'disputed') actions.push('cancel');
  const settled = order.fulfillmentStatus === 'fulfilled' || order.paymentStatus === 'refunded';
  if (PAID.includes(order.paymentStatus) && settled && !paused) actions.push('close');
  return actions;
}

