/**
 * Mallar för utgående kundmejl. Ren tabellbaserad HTML med inline-stilar —
 * e-postklienter stödjer varken flexbox, grid eller externa stilmallar, och
 * Outlook renderar fortfarande med Words motor.
 *
 * Färgerna är butikens: grönt #0B3D2E, beige #FAF7F2.
 */

import { escapeHtml } from './mailer';
import { formatMinor } from './money';

const BRAND = '#0B3D2E';
const BEIGE = '#FAF7F2';
const RULE = '#E5E0D6';
const INK = '#1A1A1A';
const INK_2 = '#5A5A5A';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://linnevik.se';

/** Gemensamt skal: grön topp, vitt kort, diskret fot. */
export function layout({
  title,
  preheader,
  body,
}: {
  title: string;
  /** Raden som visas som förhandstext i inkorgen innan mejlet öppnas. */
  preheader: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BEIGE};">
  <span style="display:none;font-size:1px;color:${BEIGE};max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BEIGE};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${RULE};border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;">
        <tr><td style="background:${BRAND};padding:22px 28px;">
          <div style="color:#F5EFE7;font-size:19px;letter-spacing:-0.01em;">Linnevik</div>
        </td></tr>
        <tr><td style="padding:28px;color:${INK};font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK};font-weight:600;">${escapeHtml(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${RULE};color:#8A8A8A;font-size:12px;line-height:1.6;">
          Linnevik · <a href="${SITE}" style="color:${INK_2};">linnevik.se</a><br>
          Har du frågor? Svara på det här mejlet.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

type EmailOrderLine = { title: string; sku: string; quantity: number; unitAmountMinor: number };

type EmailOrder = {
  id: number;
  currency: string;
  customerName: string | null;
  subtotalMinor: number;
  discountMinor: number;
  discountCode: string | null;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  shippingAddress: Record<string, string | null> | null;
  items: EmailOrderLine[];
};

function money(minor: number, currency: string): string {
  return escapeHtml(formatMinor(minor, currency));
}

function lineTable(items: EmailOrderLine[], currency: string): string {
  const rows = items
    .map(
      item => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${RULE};">
          <div style="color:${INK};">${escapeHtml(item.title)}</div>
          <div style="color:#8A8A8A;font-size:12px;font-family:monospace;">${escapeHtml(item.sku)} · ${item.quantity} st</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${RULE};color:${INK};white-space:nowrap;">
          ${money(item.unitAmountMinor * item.quantity, currency)}
        </td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;font-size:14px;">${rows}</table>`;
}

function totalsTable(order: EmailOrder): string {
  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:4px 0;color:${strong ? INK : INK_2};${strong ? 'font-weight:600;font-size:16px;' : ''}">${escapeHtml(label)}</td>
      <td align="right" style="padding:4px 0;color:${INK};white-space:nowrap;${strong ? 'font-weight:600;font-size:16px;' : ''}">${value}</td>
    </tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid ${RULE};padding-top:8px;">
    ${row('Delsumma', money(order.subtotalMinor, order.currency))}
    ${order.discountMinor > 0 ? row(order.discountCode ? `Rabatt (${order.discountCode})` : 'Rabatt', `−${money(order.discountMinor, order.currency)}`) : ''}
    ${order.shippingMinor > 0 ? row('Frakt', money(order.shippingMinor, order.currency)) : ''}
    ${order.taxMinor > 0 ? row('Varav moms', money(order.taxMinor, order.currency)) : ''}
    ${row('Totalt', money(order.totalMinor, order.currency), true)}
  </table>`;
}

function addressBlock(address: Record<string, string | null> | null, name: string | null): string {
  if (!address) return '';
  const lines = [
    name,
    address.line1,
    address.line2,
    [address.postal_code, address.city].filter(Boolean).join(' '),
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
  if (lines.length === 0) return '';
  return `<div style="margin:18px 0;padding:14px 16px;background:${BEIGE};border-radius:8px;font-size:14px;line-height:1.6;color:${INK_2};">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;margin-bottom:6px;">Leveransadress</div>
    ${lines.map(line => escapeHtml(line)).join('<br>')}
  </div>`;
}

/** Orderbekräftelse. Skickas när Stripe-webhooken har markerat ordern betald. */
export function orderConfirmationEmail(order: EmailOrder): { subject: string; html: string } {
  const greeting = order.customerName ? `Hej ${escapeHtml(order.customerName)},` : 'Hej,';
  return {
    subject: `Orderbekräftelse · order #${order.id}`,
    html: layout({
      title: `Tack för din order #${order.id}`,
      preheader: `Vi har tagit emot din betalning på ${formatMinor(order.totalMinor, order.currency)}.`,
      body: `
        <p style="margin:0 0 8px;">${greeting}</p>
        <p style="margin:0 0 8px;color:${INK_2};">
          Vi har tagit emot din betalning och börjar plocka ordern. Du får ett nytt mejl
          med spårningsinformation så snart den skickas.
        </p>
        ${lineTable(order.items, order.currency)}
        ${totalsTable(order)}
        ${addressBlock(order.shippingAddress, order.customerName)}
        <p style="margin:18px 0 0;color:#8A8A8A;font-size:13px;">
          Spara det här mejlet som kvitto. Ordernummer: <strong style="color:${INK};">#${order.id}</strong>
        </p>`,
    }),
  };
}

/** Leveransavisering. Skickas när admin skapar en shipped/delivered-fulfillment. */
export function shipmentEmail(
  order: EmailOrder,
  shipment: {
    status: 'shipped' | 'delivered';
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    items: EmailOrderLine[];
  }
): { subject: string; html: string } {
  const delivered = shipment.status === 'delivered';
  const partial = shipment.items.length < order.items.length;
  const greeting = order.customerName ? `Hej ${escapeHtml(order.customerName)},` : 'Hej,';

  const tracking = shipment.trackingNumber
    ? `<div style="margin:18px 0;padding:14px 16px;background:${BEIGE};border-radius:8px;font-size:14px;">
         <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8A8A8A;margin-bottom:6px;">Spårning</div>
         ${shipment.carrier ? `<div style="color:${INK_2};">${escapeHtml(shipment.carrier)}</div>` : ''}
         <div style="font-family:monospace;color:${INK};">${escapeHtml(shipment.trackingNumber)}</div>
         ${
           shipment.trackingUrl
             ? `<a href="${escapeHtml(shipment.trackingUrl)}" style="display:inline-block;margin-top:10px;padding:9px 16px;background:${BRAND};color:#F5EFE7;text-decoration:none;border-radius:6px;font-size:14px;">Spåra försändelsen</a>`
             : ''
         }
       </div>`
    : '';

  return {
    subject: delivered
      ? `Din order #${order.id} är levererad`
      : `Din order #${order.id} har skickats`,
    html: layout({
      title: delivered ? `Order #${order.id} är levererad` : `Order #${order.id} är på väg`,
      preheader: delivered
        ? 'Försändelsen är levererad.'
        : shipment.trackingNumber
          ? `Spårningsnummer ${shipment.trackingNumber}`
          : 'Din order har lämnat lagret.',
      body: `
        <p style="margin:0 0 8px;">${greeting}</p>
        <p style="margin:0 0 8px;color:${INK_2};">
          ${
            delivered
              ? 'Försändelsen är markerad som levererad.'
              : 'Din order har lämnat vårt lager.'
          }
          ${partial ? ' Den här försändelsen innehåller en del av ordern — resten kommer separat.' : ''}
        </p>
        ${tracking}
        ${lineTable(shipment.items, order.currency)}
        ${addressBlock(order.shippingAddress, order.customerName)}`,
    }),
  };
}

/**
 * Fakturan är skapad och skickad.
 *
 * Skickas när fakturan lämnat oss, inte när den betalas — orderbekräftelsen
 * kommer först 30 dagar senare, och utan det här mejlet fick köparen ingenting
 * alls från oss vid köptillfället. Länken går till Stripes fakturasida, där
 * fakturan både kan läsas, laddas ned som pdf och betalas.
 */
export function invoiceCreatedEmail(
  order: EmailOrder,
  invoice: { hostedUrl: string | null; number: string | null; dueDate: Date | null }
): { subject: string; html: string } {
  const greeting = order.customerName ? `Hej ${escapeHtml(order.customerName)},` : 'Hej,';
  const due = invoice.dueDate
    ? new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long' }).format(invoice.dueDate)
    : null;

  return {
    subject: `Faktura${invoice.number ? ` ${invoice.number}` : ''} · order #${order.id}`,
    html: layout({
      title: `Din faktura för order #${order.id}`,
      preheader: `${formatMinor(order.totalMinor, order.currency)}${due ? ` att betala senast ${due}` : ''}.`,
      body: `
        <p style="margin:0 0 8px;">${greeting}</p>
        <p style="margin:0 0 8px;color:${INK_2};">
          Tack för din beställning. Vi har reserverat varorna och skickat fakturan
          till dig${due ? `, med betalning senast <strong style="color:${INK};">${escapeHtml(due)}</strong>` : ''}.
          Ordern plockas och skickas enligt överenskommelse.
        </p>
        ${
          invoice.hostedUrl
            ? `<p style="margin:18px 0;"><a href="${escapeHtml(invoice.hostedUrl)}" style="display:inline-block;padding:11px 20px;background:${BRAND};color:#F5EFE7;text-decoration:none;border-radius:6px;font-size:15px;">Öppna fakturan</a></p>`
            : ''
        }
        ${lineTable(order.items, order.currency)}
        ${totalsTable(order)}
        ${addressBlock(order.shippingAddress, order.customerName)}
        <p style="margin:18px 0 0;color:#8A8A8A;font-size:13px;">
          Ordernummer: <strong style="color:${INK};">#${order.id}</strong>${
            invoice.number ? ` · Fakturanummer: <strong style="color:${INK};">${escapeHtml(invoice.number)}</strong>` : ''
          }
        </p>`,
    }),
  };
}

/**
 * Inloggningslänk. Länken går till en sida som kräver ett aktivt klick på en
 * knapp innan sessionen faktiskt löses in — se lib/magicLink.ts för varför:
 * e-postsäkerhetsfilter (Microsoft Defender med flera) hämtar länkar i mejl
 * automatiskt för att kontrollera dem, och en länk som loggar in vid GET
 * skulle vara förbrukad innan mottagaren själv hunnit klicka.
 */
export function magicLinkEmail(url: string): { subject: string; html: string } {
  return {
    subject: 'Din inloggningslänk till Linnevik',
    html: layout({
      title: 'Logga in på Linnevik',
      preheader: 'Länken gäller i 15 minuter och går bara att använda en gång.',
      body: `
        <p style="margin:0 0 8px;">Hej,</p>
        <p style="margin:0 0 16px;color:${INK_2};">
          Klicka på knappen för att logga in. Länken gäller i 15 minuter och går bara att använda en gång.
        </p>
        <div style="margin:20px 0;text-align:center;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;background:${BRAND};color:#F5EFE7;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">Logga in</a>
        </div>
        <p style="margin:0;color:#8A8A8A;font-size:13px;">
          Fungerar inte knappen? Kopiera in den här adressen i webbläsaren:<br>
          <span style="word-break:break-all;color:${INK_2};">${escapeHtml(url)}</span>
        </p>
        <p style="margin:16px 0 0;color:#8A8A8A;font-size:13px;">
          Har du inte försökt logga in kan du bortse från det här mejlet — ingen kommer in utan att klicka på länken.
        </p>`,
    }),
  };
}
