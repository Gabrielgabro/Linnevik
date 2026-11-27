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

import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { invoices, type InvoiceRow } from '@/lib/db/schema';
import { invoicePdf } from '@/lib/invoicesDb';
import { invoicePaymentDetailsOrNull } from '@/lib/invoicePayment';
import { sendEmail, mailConfigured } from '@/lib/mailer';
import {
  creditNoteEmail,
  invoiceCreatedEmail,
  invoiceReminderEmail,
  orderConfirmationEmail,
  shipmentEmail,
  type InvoiceEmailDetails,
} from '@/lib/emailTemplates';
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
  template: 'order.confirmation' | 'order.shipped' | 'order.invoice' | 'order.invoice_reminder' | 'order.credit_note',
  to: string,
  message: { subject: string; html: string },
  attachments?: Array<{ filename: string; content: Uint8Array; contentType: string }>
): Promise<boolean> {
  const result = await sendEmail({ to, subject: message.subject, html: message.html, attachments });
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
    'order.invoice_reminder': `Betalningspåminnelsen för order ${orderId} gick inte fram`,
    'order.credit_note': `Kreditfakturan för order ${orderId} gick inte fram`,
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

/** Det mejlen behöver veta om en faktura, ur vår egen fakturarad. */
export function invoiceEmailDetails(invoice: InvoiceRow): InvoiceEmailDetails {
  return {
    number: String(invoice.number),
    dueDate: invoice.dueOn ? new Date(`${invoice.dueOn}T12:00:00Z`) : null,
    payment: invoicePaymentDetailsOrNull(),
    ocr: invoice.ocr ?? '',
  };
}

/** Vart fakturapost för fakturan ska: dit fakturan gick, annars köparens adress. */
export function invoiceRecipient(invoice: InvoiceRow): string | null {
  return invoice.emailedTo?.trim() || invoice.buyer.email?.trim() || null;
}

/**
 * Fakturan, eller en påminnelse om den, med pdf:en som bilaga (§9.6, §9.7,
 * §13.1). Påminnelsen går till samma adress som fakturan gick till.
 *
 * Fakturamejlet skickas en gång. Ett omspelat anrop ska inte ge mottagaren
 * två mejl om samma faktura, så spåret i ordern avgör, om inte admin skickar
 * om med flit (`force`).
 *
 * Sväljer sina fel, som allt annat här: fakturan finns redan, och den rullas
 * inte tillbaka för ett SMTP-fel. Ett misslyckat utskick larmar (`deliver`).
 */
export async function sendInvoiceEmail(
  invoice: InvoiceRow,
  options: { reminder?: boolean; force?: boolean } = {}
): Promise<boolean> {
  if (!mailConfigured()) return false;
  const credit = invoice.kind === 'credit';
  const template = credit ? 'order.credit_note' : options.reminder ? 'order.invoice_reminder' : 'order.invoice';
  try {
    const order = await getOrderById(invoice.orderId);
    const recipient = invoiceRecipient(invoice);
    if (!order || !recipient) {
      if (order) await record(order.id, 'email.failed', { template, error: 'Fakturan saknar e-postadress.' });
      return false;
    }
    if (!options.reminder && !options.force && invoice.emailedAt) return true;

    const emailOrder = {
      id: order.id,
      currency: order.currency,
      customerName: invoice.buyer.reference || order.customerName,
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      discountCode: order.discountCode,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      shippingAddress: order.shippingAddress ?? null,
      items: order.items,
    };
    const details = invoiceEmailDetails(invoice);
    let message: { subject: string; html: string };
    if (credit) {
      const [credited] = await getDb()
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditsInvoiceId!));
      message = creditNoteEmail({
        orderId: order.id,
        customerName: emailOrder.customerName,
        number: invoice.number,
        creditsNumber: credited?.number ?? 0,
        totalMinor: invoice.totalMinor,
        currency: invoice.currency,
      });
    } else {
      message = options.reminder
        ? invoiceReminderEmail(emailOrder, { ...details, amountDueMinor: invoice.totalMinor })
        : invoiceCreatedEmail(emailOrder, details);
    }
    const pdf = await invoicePdf(invoice);
    const sent = await deliver(order.id, template, recipient, message, [
      { filename: `${credit ? 'kreditfaktura' : 'faktura'}-${invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' },
    ]);
    if (sent && !options.reminder) {
      await getDb()
        .update(invoices)
        .set({ emailedTo: recipient, emailedAt: new Date() })
        .where(eq(invoices.id, invoice.id));
    }
    return sent;
  } catch (error) {
    console.error(`[orderEmails] ${options.reminder ? 'Påminnelsen' : 'Fakturamejlet'} misslyckades:`, error);
    return false;
  }
}

/** Har ordern redan fått en påminnelse som gick fram? */
export async function invoiceReminderSent(orderId: number): Promise<boolean> {
  const result = await getDb().execute(sql`
    select 1 from order_events
    where order_id = ${orderId} and kind = 'email.sent'
      and detail->>'template' = 'order.invoice_reminder'
    limit 1
  `);
  return result.rows.length > 0;
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
