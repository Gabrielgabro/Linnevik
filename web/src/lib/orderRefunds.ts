/**
 * Att återbetala en order (source_of_truth §8.11). Delas av återbetalningen i
 * admin och av avbokningen av en betald order, som återbetalar i samma steg
 * (§8.8).
 *
 * - Det som betalades med kort återbetalas genom Stripe.
 * - Det som betalades till bankgirot har admin redan betalat tillbaka från
 *   banken. Det registreras här, och en kreditfaktura görs (§9.8).
 *
 * Beloppet bokas av på ordern före allt annat, så att två samtidiga
 * återbetalningar aldrig tillsammans överstiger det som betalades. Går
 * återbetalningen inte igenom släpps bokningen.
 */

import { getStripe, stripeConfigured } from '@/lib/stripe';
import { refundVatMinor } from '@/lib/vat';
import { claimRefundAmount, recordRefund, syncRefundedTotal, type OrderWithItems } from '@/lib/ordersDb';
import { issueCreditNote } from '@/lib/invoicesDb';
import { sendInvoiceEmail } from '@/lib/orderEmails';
import type { RefundRow } from '@/lib/db/schema';

export class RefundError extends Error {
  constructor(
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'RefundError';
  }
}

export type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer';

const PAID = ['paid', 'partially_refunded'];

/** Ordern betalades till bankgirot, inte i Stripe. */
export function paidByBank(order: Pick<OrderWithItems, 'paymentMethod' | 'stripePaymentIntentId' | 'paymentStatus'>) {
  return order.paymentMethod === 'invoice' && !order.stripePaymentIntentId && PAID.includes(order.paymentStatus);
}

export async function refundOrder(input: {
  order: OrderWithItems;
  amountMinor: number;
  reason?: RefundReason;
  note?: string | null;
  /** Gör ett omsänt anrop till samma återbetalning. */
  requestKey: string;
  actor: string;
}): Promise<{ refund: RefundRow; creditNoteNumber: number | null }> {
  const { order, amountMinor } = input;
  if (!PAID.includes(order.paymentStatus)) throw new RefundError('Ordern har ingen betalning att återbetala.');
  const bank = paidByBank(order);
  if (!bank && !order.stripePaymentIntentId) throw new RefundError('Ordern har ingen betalning att återbetala.');
  if (!bank && !stripeConfigured()) throw new RefundError('Stripe är inte konfigurerat.', 503);

  const remaining = order.totalMinor - order.refundedMinor;
  if (!Number.isInteger(amountMinor) || amountMinor < 1 || amountMinor > remaining) {
    throw new RefundError(`Beloppet ska vara mellan 1 och ${remaining} öre.`, 400);
  }
  // Återbetalningen görs mot betalningen, alltså brutto. Momsdelen sparas, så
  // att det står hur mycket utgående moms som vändes tillbaka (§16.3).
  const taxMinor = refundVatMinor({
    refundMinor: amountMinor,
    orderTaxMinor: order.taxMinor,
    orderTotalMinor: order.totalMinor,
  });
  const reason = input.reason ?? 'requested_by_customer';
  if (!(await claimRefundAmount(order.id, amountMinor))) {
    throw new RefundError('Beloppet överskrider vad som återstår att återbetala. Ladda om ordern.');
  }

  try {
    if (bank) {
      const refund = await recordRefund({
        orderId: order.id,
        stripeRefundId: `bank_${order.id}_${input.requestKey}`,
        amountMinor,
        taxMinor,
        currency: order.currency,
        reason,
        status: 'succeeded',
        note: input.note ?? null,
        actor: input.actor,
      });
      const creditNote = await issueCreditNote({ refundId: refund.id, amountMinor, taxMinor, actor: input.actor });
      await sendInvoiceEmail(creditNote);
      return { refund, creditNoteNumber: creditNote.number };
    }

    const stripeRefund = await getStripe().refunds.create(
      {
        payment_intent: order.stripePaymentIntentId!,
        amount: amountMinor,
        reason,
        metadata: {
          linnevik_order_id: String(order.id),
          actor: input.actor,
          linnevik_refund_vat_minor: String(taxMinor),
        },
      },
      { idempotencyKey: `linnevik_refund_${order.id}_${input.requestKey}` }
    );
    const refund = await recordRefund({
      orderId: order.id,
      stripeRefundId: stripeRefund.id,
      amountMinor,
      taxMinor,
      currency: order.currency,
      reason,
      status: stripeRefund.status ?? 'pending',
      note: input.note ?? null,
      actor: input.actor,
    });
    return { refund, creditNoteNumber: null };
  } catch (error) {
    // Återbetalningen gick inte igenom. Bokningen släpps, annars ser ordern
    // för alltid ut att ha återbetalats mer än den har.
    await syncRefundedTotal(order.id).catch(releaseError => {
      console.error('[Refund] Could not release the claimed amount:', releaseError);
    });
    throw error;
  }
}
