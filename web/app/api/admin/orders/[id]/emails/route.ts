import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readJson, requireAdmin, routeId } from '@/lib/adminRoute';
import { getOrderById } from '@/lib/ordersDb';
import { invoiceRecipient, sendInvoiceEmail, sendOrderConfirmation, sendShipmentNotice } from '@/lib/orderEmails';
import { currentInvoiceForOrder } from '@/lib/invoicesDb';

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

  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body;
  const template = String(body.template ?? 'confirmation');

  let sent = false;
  let recipient: string | null = order.email;
  if (template === 'invoice' || template === 'invoice_reminder') {
    // Fakturan och påminnelsen gäller bara en obetald, skickad faktura. Hos en
    // betald order är påminnelsen fel och fakturan finns redan som kvitto i
    // orderbekräftelsen.
    const invoice = order.paymentMethod === 'invoice' ? await currentInvoiceForOrder(order.id) : null;
    if (!invoice) {
      return NextResponse.json({ error: 'Ordern har ingen gällande faktura att skicka.' }, { status: 409 });
    }
    if (order.paymentStatus !== 'pending' || order.status === 'cancelled') {
      return NextResponse.json({ error: 'Fakturan är inte längre obetald, inget att skicka om.' }, { status: 409 });
    }
    recipient = invoiceRecipient(invoice);
    sent = await sendInvoiceEmail(invoice, template === 'invoice' ? { force: true } : { reminder: true });
  } else if (template === 'confirmation') {
    // Bekräftelsen säger "vi har tagit emot din betalning". Till en kund med
    // en obetald faktura är det fel, och kan få dem att låta bli att betala.
    if (!['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
      return NextResponse.json(
        { error: 'Ordern är inte betald — orderbekräftelsen säger att betalningen tagits emot.' },
        { status: 409 }
      );
    }
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

  await record(auth.user, 'order.email_resent', String(id), { mall: template, till: recipient });
  return NextResponse.json({ ok: true });
}
