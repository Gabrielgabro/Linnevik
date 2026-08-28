import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { claimRefundAmount, getOrderById, recordRefund, syncRefundedTotal } from '@/lib/ordersDb';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { refundVatMinor } from '@/lib/vat';
import { ensureCreditNoteForRefund } from '@/lib/creditNotes';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!stripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (!order.stripePaymentIntentId || order.paymentStatus === 'pending') {
    return NextResponse.json({ error: 'Order has no refundable payment.' }, { status: 409 });
  }
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  const amountMinor = Number(body.amountMinor);
  const remaining = order.totalMinor - order.refundedMinor;
  if (!Number.isInteger(amountMinor) || amountMinor < 1 || amountMinor > remaining) {
    return NextResponse.json({ error: `Refund must be between 1 and ${remaining}.` }, { status: 400 });
  }
  const reason = body.reason ? String(body.reason) : 'requested_by_customer';
  if (!['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
    return NextResponse.json({ error: 'Invalid refund reason.' }, { status: 400 });
  }
  // Återbetalningen görs mot betalningen, alltså brutto. Momsdelen räknas ut
  // och sparas här — annars står det ingenstans hur mycket utgående moms som
  // vändes tillbaka, och den delen av redovisningen blir handpåläggning.
  const taxMinor = refundVatMinor({
    refundMinor: amountMinor,
    orderTaxMinor: order.taxMinor,
    orderTotalMinor: order.totalMinor,
  });
  const note = body.note ? String(body.note).trim().slice(0, 2_000) : null;
  const submittedKey = body.requestKey ? String(body.requestKey) : '';
  const requestKey = /^[a-zA-Z0-9_-]{1,80}$/.test(submittedKey) ? submittedKey : crypto.randomUUID();
  // Beloppet bokas av på ordern före Stripe-anropet. Kontrollen ovan läser ett
  // värde som hinner bli inaktuellt; den här bokningen är den som faktiskt
  // håller, och den andra av två samtidiga återbetalningar stoppas här.
  if (!(await claimRefundAmount(id, amountMinor))) {
    return NextResponse.json(
      { error: 'Beloppet överskrider vad som återstår att återbetala. Ladda om ordern.' },
      { status: 409 }
    );
  }
  try {
    const stripeRefund = await getStripe().refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        amount: amountMinor,
        reason: reason as 'duplicate' | 'fraudulent' | 'requested_by_customer',
        metadata: {
          linnevik_order_id: String(id),
          actor: auth.user,
          linnevik_refund_vat_minor: String(taxMinor),
        },
      },
      { idempotencyKey: `linnevik_refund_${id}_${requestKey}` }
    );
    const refund = await recordRefund({
      orderId: id,
      stripeRefundId: stripeRefund.id,
      amountMinor,
      taxMinor,
      currency: order.currency,
      reason,
      status: stripeRefund.status ?? 'pending',
      note,
      actor: auth.user,
    });
    // En faktura som återbetalas ska krediteras med en egen handling som
    // hänvisar till den. Anropet sväljer sina fel med flit: pengarna är redan
    // återbetalade, och ett fel här får inte få adminvyn att tro motsatsen.
    const creditNoteId = await ensureCreditNoteForRefund({
      stripeRefundId: stripeRefund.id,
      status: stripeRefund.status ?? 'pending',
      reason,
    });
    return NextResponse.json({ refund, creditNoteId }, { status: 201 });
  } catch (error) {
    // Stripe tog aldrig emot beloppet — släpp bokningen, annars ser ordern
    // för alltid ut att ha återbetalats mer än den har.
    await syncRefundedTotal(id).catch(releaseError => {
      console.error('[Refund] Could not release the claimed amount:', releaseError);
    });
    console.error('[Refund] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Refund failed.' }, { status: 502 });
  }
}
