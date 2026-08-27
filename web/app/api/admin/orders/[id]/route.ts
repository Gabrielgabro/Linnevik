import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { getOrderById, updateOrderManagement } from '@/lib/ordersDb';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const order = await getOrderById(id);
  return order
    ? NextResponse.json({ order })
    : NextResponse.json({ error: 'Order not found.' }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const body = await readBody(request);
  const status = body.status === undefined ? undefined : String(body.status);
  if (status && !['pending', 'paid', 'on_hold', 'cancelled', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
  }
  const notes = body.notes === undefined ? undefined : String(body.notes).trim() || null;
  let order;
  try {
    order = await updateOrderManagement(id, { status, notes }, auth.user);
  } catch (error) {
    // The one failure this route can hit is voiding the Stripe invoice while
    // cancelling an invoice order. Surface it so the admin fixes it in Stripe
    // rather than seeing a bare 500 — the order was left unchanged.
    console.error('[admin] updateOrderManagement failed:', error);
    return NextResponse.json(
      { error: 'Kunde inte makulera Stripe-fakturan. Ordern är oförändrad — försök igen eller makulera fakturan i Stripe.' },
      { status: 502 }
    );
  }
  return order
    ? NextResponse.json({ order })
    : NextResponse.json({ error: 'Order not found.' }, { status: 404 });
}
