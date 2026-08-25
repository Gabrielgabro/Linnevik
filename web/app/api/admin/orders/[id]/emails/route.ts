import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { getOrderById } from '@/lib/ordersDb';
import { sendOrderConfirmation, sendShipmentNotice } from '@/lib/orderEmails';

export const runtime = 'nodejs';

/**
 * Skickar om ett kundutskick.
 *
 * Ett mejl som inte gick fram loggades förr som `email.failed` i
 * ordertidslinjen och stannade där: det fanns ingen väg tillbaka utom att
 * göra om betalningen. Nu larmar det (se opsAlerts) och går att skicka om
 * härifrån.
 *
 * Utskicken är samma funktioner som webhooken och fulfillment använder, så
 * innehållet blir identiskt med det kunden skulle ha fått.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const order = await getOrderById(id);
  if (!order) return NextResponse.json({ error: 'Ordern finns inte.' }, { status: 404 });
  if (!order.email) {
    return NextResponse.json(
      { error: 'Ordern saknar e-postadress — det finns ingen att skicka till.' },
      { status: 409 }
    );
  }

  const body = await readBody(request);
  const template = String(body.template ?? 'confirmation');

  let sent = false;
  if (template === 'confirmation') {
    sent = await sendOrderConfirmation(order.stripeSessionId);
  } else if (template === 'shipment') {
    // Den senaste försändelsen är den kunden frågar om. Äldre aviseringar
    // skickas inte om — de beskriver ett paket som redan kommit fram.
    const latest = order.fulfillments.find(
      fulfillment => fulfillment.status === 'shipped' || fulfillment.status === 'delivered'
    );
    if (!latest) {
      return NextResponse.json(
        { error: 'Ordern har ingen skickad försändelse att avisera.' },
        { status: 409 }
      );
    }
    sent = await sendShipmentNotice(order.id, latest.id);
  } else {
    return NextResponse.json({ error: 'Okänd malltyp.' }, { status: 400 });
  }

  if (!sent) {
    // Utskicket loggar redan sitt eget fel i ordertidslinjen och larmar.
    return NextResponse.json(
      { error: 'Utskicket gick inte igenom. Se historiken på ordern.' },
      { status: 502 }
    );
  }

  await record(auth.user, 'order.email_resent', String(id), { mall: template, till: order.email });
  return NextResponse.json({ ok: true });
}
