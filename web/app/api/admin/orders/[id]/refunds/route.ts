import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { claimRefundAmount, getOrderById, recordRefund, syncRefundedTotal } from '@/lib/ordersDb';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { refundVatMinor } from '@/lib/vat';
import { issueCreditNote } from '@/lib/invoicesDb';
import { sendInvoiceEmail } from '@/lib/orderEmails';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  // En faktura betald via bankgiro har ingen betalning i Stripe. Pengarna går
  // tillbaka samma väg de kom, från bankkontot, och admin registrerar det här.
  // Kreditfakturan görs då automatiskt (§8.11, §9.8).
  if (!order.stripePaymentIntentId && order.paymentMethod === 'invoice'
    && ['paid', 'partially_refunded'].includes(order.paymentStatus)) {
    return bankRefund(request, order, auth.user);
  }
  if (!stripeConfigured()) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
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
    return NextResponse.json({ refund }, { status: 201 });
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

/**
 * En återbetalning av en fakturaorder som betalats via bank (§8.11). Admin
 * har betalat tillbaka från bankkontot och registrerar det här. Beloppet
 * bokas av på ordern först, så att två samtidiga registreringar aldrig
 * återbetalar mer än det som betalades. Sedan görs kreditfakturan och mejlas.
 */
async function bankRefund(
  request: NextRequest,
  order: NonNullable<Awaited<ReturnType<typeof getOrderById>>>,
  actor: string
) {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  const amountMinor = Number(body.amountMinor);
  const remaining = order.totalMinor - order.refundedMinor;
  if (!Number.isInteger(amountMinor) || amountMinor < 1 || amountMinor > remaining) {
    return NextResponse.json({ error: `Beloppet ska vara mellan 1 och ${remaining} öre.` }, { status: 400 });
  }
  const taxMinor = refundVatMinor({
    refundMinor: amountMinor,
    orderTaxMinor: order.taxMinor,
    orderTotalMinor: order.totalMinor,
  });
  const note = body.note ? String(body.note).trim().slice(0, 2_000) : null;
  const submittedKey = body.requestKey ? String(body.requestKey) : '';
  const requestKey = /^[a-zA-Z0-9_-]{1,80}$/.test(submittedKey) ? submittedKey : crypto.randomUUID();
  if (!(await claimRefundAmount(order.id, amountMinor))) {
    return NextResponse.json(
      { error: 'Beloppet överskrider vad som återstår att återbetala. Ladda om ordern.' },
      { status: 409 }
    );
  }
  try {
    const refund = await recordRefund({
      orderId: order.id,
      // Ingen betalning i Stripe. Nyckeln gör ett omsänt anrop till samma rad.
      stripeRefundId: `bank_${order.id}_${requestKey}`,
      amountMinor,
      taxMinor,
      currency: order.currency,
      reason: 'requested_by_customer',
      status: 'succeeded',
      note,
      actor,
    });
    const creditNote = await issueCreditNote({ refundId: refund.id, amountMinor, taxMinor, actor });
    await sendInvoiceEmail(creditNote);
    return NextResponse.json({ refund, creditNoteNumber: creditNote.number }, { status: 201 });
  } catch (error) {
    await syncRefundedTotal(order.id).catch(releaseError => {
      console.error('[Refund] Could not release the claimed amount:', releaseError);
    });
    console.error('[Refund] Bank refund failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Återbetalningen misslyckades.' }, { status: 500 });
  }
}
