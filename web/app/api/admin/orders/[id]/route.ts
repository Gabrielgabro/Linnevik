import { NextRequest, NextResponse } from 'next/server';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { getOrderById, updateOrderManagement } from '@/lib/ordersDb';
import { applyOrderAction, ORDER_ACTION_LABEL, OrderActionError, type OrderAction } from '@/lib/orderActions';
import { RefundError } from '@/lib/orderRefunds';

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

/**
 * Ändrar en order: en av de tillåtna åtgärderna (`allowedOrderActions`) och
 * eller den interna noteringen. Status sätts aldrig fritt (§8.5, A9).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  if (body.status !== undefined) {
    return NextResponse.json({ error: 'Status sätts inte fritt. Använd en åtgärd.' }, { status: 400 });
  }
  const action = body.action === undefined ? undefined : String(body.action);
  if (action && !(action in ORDER_ACTION_LABEL)) {
    return NextResponse.json({ error: 'Okänd åtgärd.' }, { status: 400 });
  }
  try {
    if (action) {
      await applyOrderAction({
        orderId: id,
        action: action as OrderAction,
        actor: auth.user,
        note: body.note === undefined ? null : String(body.note).slice(0, 2_000),
      });
    }
    if (body.notes !== undefined) {
      await updateOrderManagement(id, { notes: String(body.notes).trim() || null }, auth.user);
    }
  } catch (error) {
    if (error instanceof OrderActionError || error instanceof RefundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[admin] Order action failed:', error);
    return NextResponse.json({ error: 'Åtgärden misslyckades. Ordern kan vara oförändrad, ladda om.' }, { status: 500 });
  }
  const order = await getOrderById(id);
  return order
    ? NextResponse.json({ order })
    : NextResponse.json({ error: 'Ordern finns inte.' }, { status: 404 });
}
