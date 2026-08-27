/**
 * Kundutskicken kring en order.
 *
 * Två regler gäller här:
 *
 * 1. Ingenting kastar. Anropen sitter i Stripes webhook och i adminvyns
 *    fulfillment-endpoint. Ett fel i SMTP får aldrig göra att webhooken svarar
 *    500 — då försöker Stripe igen, och en order kan bli behandlad två gånger
 *    för att mejlet inte gick fram.
 * 2. Varje försök loggas i order_events, så att adminvyn kan visa om och när
 *    kunden faktiskt fick sitt mejl.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sendEmail, mailConfigured } from '@/lib/mailer';
import { invoiceCreatedEmail, orderConfirmationEmail, shipmentEmail } from '@/lib/emailTemplates';
import { raiseAlert } from '@/lib/opsAlerts';
import { getOrderById, getOrderBySession } from '@/lib/ordersDb';

/** Skriver spåret. Sväljer sina egna fel — loggning får inte fälla utskicket. */
async function record(
  orderId: number,
  kind: 'email.sent' | 'email.failed',
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await getDb().execute(sql`
      insert into order_events (order_id, kind, actor, detail)
      values (${orderId}, ${kind}, 'system', ${JSON.stringify(detail)}::jsonb)
    `);
  } catch (error) {
    console.error('[orderEmails] Kunde inte logga e-posthändelsen:', error);
  }
}

async function deliver(
  orderId: number,
  template: 'order.confirmation' | 'order.shipped' | 'order.invoice',
  to: string,
  message: { subject: string; html: string }
): Promise<boolean> {
  const result = await sendEmail({ to, subject: message.subject, html: message.html });
  if (result.success) {
    await record(orderId, 'email.sent', { template, to, messageId: result.messageId });
    return true;
  }
  await record(orderId, 'email.failed', { template, to, error: result.error });
  // En kund som betalat och inte fått sin bekräftelse hör av sig till oss, inte
  // tvärtom. Larmet gör att vi vet innan dess — mejlet går att skicka om från
  // orderkortet.
  const subjects: Record<typeof template, string> = {
    'order.confirmation': `Orderbekräftelsen för order ${orderId} gick inte fram`,
    'order.shipped': `Leveransaviseringen för order ${orderId} gick inte fram`,
    'order.invoice': `Fakturamejlet för order ${orderId} gick inte fram`,
  };
  await raiseAlert({
    kind: 'email.failed',
    key: `order:${orderId}:${template}`,
    subject: subjects[template],
    detail: { order: orderId, mottagare: to, fel: result.error },
    href: `/admin/orders/${orderId}`,
  });
  return false;
}

/**
 * Orderbekräftelse. Anropas från Stripes webhook efter att ordern skrivits som
 * betald — sessionen är nyckeln vi har där.
 */
export async function sendOrderConfirmation(sessionId: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const order = await getOrderBySession(sessionId);
    if (!order) {
      console.warn('[orderEmails] Ingen order för session', sessionId);
      return false;
    }
    if (!order.email) {
      await record(order.id, 'email.failed', {
        template: 'order.confirmation',
        error: 'Ordern saknar e-postadress.',
      });
      return false;
    }
    return await deliver(
      order.id,
      'order.confirmation',
      order.email,
      orderConfirmationEmail({
        id: order.id,
        currency: order.currency,
        customerName: order.customerName,
        subtotalMinor: order.subtotalMinor,
        discountMinor: order.discountMinor,
        discountCode: order.discountCode,
        shippingMinor: order.shippingMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        shippingAddress: order.shippingAddress ?? null,
        items: order.items,
      })
    );
  } catch (error) {
    console.error('[orderEmails] Orderbekräftelsen misslyckades:', error);
    return false;
  }
}

/**
 * Fakturamejl. Anropas direkt när fakturan skickats i Stripe, alltså långt
 * innan den är betald.
 *
 * Stripe skickar visserligen sitt eget fakturamejl, men det går bara om
 * inställningen för det är påslagen på kontot, och det är inte vårt utskick.
 * En kund som betalar mot faktura ska höra av oss vid köpet — inte först när
 * betalningen kommer in en månad senare.
 *
 * Som allt annat här: sväljer sina fel. En faktura är skapad och skickad i
 * Stripe när det här körs, och det får inte rullas tillbaka för ett SMTP-fel.
 */
export async function sendInvoiceCreatedNotice(
  sessionId: string,
  invoice: { hostedUrl: string | null; number: string | null; dueDate: Date | null }
): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const order = await getOrderBySession(sessionId);
    if (!order?.email) {
      console.warn('[orderEmails] Ingen order eller e-postadress för faktura', sessionId);
      return false;
    }
    // Fakturarutten kan spela om ett avbrutet försök, och `sendInvoice` är
    // idempotent hos Stripe — men ett andra mejl om samma faktura är inte
    // idempotent hos mottagaren. Spåret vi redan skriver är svaret på om det
    // gått i väg en gång.
    const alreadySent = await getDb().execute(sql`
      select 1 from order_events
      where order_id = ${order.id} and kind = 'email.sent'
        and detail->>'template' = 'order.invoice'
      limit 1
    `);
    if (alreadySent.rows.length > 0) return true;
    return await deliver(
      order.id,
      'order.invoice',
      order.email,
      invoiceCreatedEmail(
        {
          id: order.id,
          currency: order.currency,
          customerName: order.customerName,
          subtotalMinor: order.subtotalMinor,
          discountMinor: order.discountMinor,
          discountCode: order.discountCode,
          shippingMinor: order.shippingMinor,
          taxMinor: order.taxMinor,
          totalMinor: order.totalMinor,
          shippingAddress: order.shippingAddress ?? null,
          items: order.items,
        },
        invoice
      )
    );
  } catch (error) {
    console.error('[orderEmails] Fakturamejlet misslyckades:', error);
    return false;
  }
}

/**
 * Leveransavisering. Bara `shipped` och `delivered` mejlas — `pending` och
 * `cancelled` är interna tillstånd som kunden inte ska få post om.
 */
export async function sendShipmentNotice(
  orderId: number,
  fulfillmentId: number
): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    const order = await getOrderById(orderId);
    if (!order?.email) return false;

    const shipment = order.fulfillments.find(row => row.id === fulfillmentId);
    if (!shipment) return false;
    if (shipment.status !== 'shipped' && shipment.status !== 'delivered') return false;

    // Raderna som ingår i just den här försändelsen, inte hela ordern: vid en
    // delleverans ska kunden se vad som faktiskt är på väg.
    const shipped = await getDb().execute(sql`
      select oi.title, oi.sku, oi.unit_amount_minor, fi.quantity
      from fulfillment_items fi
      join order_items oi on oi.id = fi.order_item_id
      where fi.fulfillment_id = ${fulfillmentId}
      order by oi.id
    `);
    const items = (
      shipped.rows as Array<{
        title: string;
        sku: string;
        unit_amount_minor: number;
        quantity: number;
      }>
    ).map(row => ({
      title: row.title,
      sku: row.sku,
      quantity: Number(row.quantity),
      unitAmountMinor: Number(row.unit_amount_minor),
    }));
    if (items.length === 0) return false;

    return await deliver(
      order.id,
      'order.shipped',
      order.email,
      shipmentEmail(
        {
          id: order.id,
          currency: order.currency,
          customerName: order.customerName,
          subtotalMinor: order.subtotalMinor,
          discountMinor: order.discountMinor,
          discountCode: order.discountCode,
          shippingMinor: order.shippingMinor,
          taxMinor: order.taxMinor,
          totalMinor: order.totalMinor,
          shippingAddress: order.shippingAddress ?? null,
          items: order.items,
        },
        {
          status: shipment.status,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          trackingUrl: shipment.trackingUrl,
          items,
        }
      )
    );
  } catch (error) {
    console.error('[orderEmails] Leveransaviseringen misslyckades:', error);
    return false;
  }
}
