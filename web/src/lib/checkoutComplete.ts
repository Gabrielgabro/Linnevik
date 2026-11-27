/**
 * Vad sidan efter betalningen visar (source_of_truth §6.4).
 *
 * Kunden ser om pengarna har kommit in, inte våra interna lägen. En betald
 * order som har fått ett lagerundantag eller en tvist är fortfarande betald
 * för kunden. Förr visade sidan "betalningen behandlas" för dem, eftersom
 * den läste orderns status och inte betalningens.
 */

const PAID = ['paid', 'partially_refunded', 'refunded'];
const ENDED = ['cancelled', 'failed', 'expired'];

export type CheckoutCompleteState =
  /** Pengarna har kommit in. */
  | 'paid'
  /** En fakturaorder som väntar på bankbetalning. */
  | 'invoice'
  /** En kortbetalning som Stripe ännu inte har bekräftat. Sidan uppdaterar sig. */
  | 'pending'
  /** Kortbetalningen gick inte igenom. */
  | 'failed'
  /** Ordern är avbokad. */
  | 'cancelled';

export function checkoutCompleteState(order: {
  status: string;
  paymentStatus: string;
  paymentMethod: string;
}): CheckoutCompleteState {
  if (PAID.includes(order.paymentStatus)) return 'paid';
  if (order.status === 'cancelled') return 'cancelled';
  if (ENDED.includes(order.status) || ENDED.includes(order.paymentStatus)) {
    return order.paymentMethod === 'invoice' ? 'cancelled' : 'failed';
  }
  return order.paymentMethod === 'invoice' ? 'invoice' : 'pending';
}
