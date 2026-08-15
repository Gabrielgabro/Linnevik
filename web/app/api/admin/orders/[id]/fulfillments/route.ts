import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { createFulfillment } from '@/lib/ordersDb';
import { sendShipmentNotice } from '@/lib/orderEmails';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const orderId = routeId((await params).id);
  if (orderId === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const body = await readBody(request);
  const status = String(body.status ?? 'shipped');
  if (!['pending', 'shipped', 'delivered', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid fulfillment status.' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an array.' }, { status: 400 });
  }
  try {
    const fulfillmentId = await createFulfillment({
      orderId,
      status: status as 'pending' | 'shipped' | 'delivered' | 'cancelled',
      carrier: body.carrier ? String(body.carrier).trim().slice(0, 200) : null,
      trackingNumber: body.trackingNumber ? String(body.trackingNumber).trim().slice(0, 200) : null,
      trackingUrl: body.trackingUrl ? String(body.trackingUrl).trim().slice(0, 2_000) : null,
      note: body.note ? String(body.note).trim().slice(0, 2_000) : null,
      items: body.items.map(item => ({
        orderItemId: Number((item as Record<string, unknown>).orderItemId),
        quantity: Number((item as Record<string, unknown>).quantity),
      })),
      actor: auth.user,
    });
    // Aviseringen skickas bara för shipped/delivered, vilket sendShipmentNotice
    // avgör. Den kastar inte: en försändelse är skapad även om mejlet fastnar,
    // och utfallet hamnar i order_events.
    const emailed = await sendShipmentNotice(orderId, fulfillmentId);
    return NextResponse.json({ fulfillmentId, emailed }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Fulfillment failed.' }, { status: 400 });
  }
}
