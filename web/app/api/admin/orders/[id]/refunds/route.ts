import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { getOrderById } from '@/lib/ordersDb';
import { refundOrder, RefundError, type RefundReason } from '@/lib/orderRefunds';

type Params = { params: Promise<{ id: string }> };

/** Återbetalar en order, med kort genom Stripe eller registrerad via bank. Se `refundOrder`. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });
  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: 'Ordern finns inte.' }, { status: 404 });
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;

  const reason = body.reason ? String(body.reason) : 'requested_by_customer';
  if (!['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
    return NextResponse.json({ error: 'Okänd orsak.' }, { status: 400 });
  }
  const submittedKey = body.requestKey ? String(body.requestKey) : '';
  try {
    const result = await refundOrder({
      order,
      amountMinor: Number(body.amountMinor),
      reason: reason as RefundReason,
      note: body.note ? String(body.note).trim().slice(0, 2_000) : null,
      requestKey: /^[a-zA-Z0-9_-]{1,80}$/.test(submittedKey) ? submittedKey : crypto.randomUUID(),
      actor: auth.user,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[Refund] Failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Återbetalningen misslyckades.' }, { status: 502 });
  }
}
