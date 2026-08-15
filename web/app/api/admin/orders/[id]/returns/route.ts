import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { returnOrderItems } from '@/lib/ordersDb';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const orderId = routeId((await params).id);
  if (orderId === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const body = await readBody(request);
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an array.' }, { status: 400 });
  }
  try {
    await returnOrderItems({
      orderId,
      items: body.items.map(item => ({
        orderItemId: Number((item as Record<string, unknown>).orderItemId),
        quantity: Number((item as Record<string, unknown>).quantity),
      })),
      restock: body.restock !== false,
      actor: auth.user,
      note: body.note ? String(body.note).trim().slice(0, 2_000) : null,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Return failed.' }, { status: 400 });
  }
}
