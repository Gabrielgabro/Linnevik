import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const invoiceRoute = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const invoices = readFileSync(resolve('src/lib/stripeInvoices.ts'), 'utf8');
const webhook = readFileSync(resolve('app/api/stripe/webhook/route.ts'), 'utf8');
const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const migration = readFileSync(resolve('drizzle/0034_stripe_invoice_payment_method.sql'), 'utf8');
const cartRoute = readFileSync(resolve('app/api/store/cart/[id]/route.ts'), 'utf8');
const orderEmails = readFileSync(resolve('src/lib/orderEmails.ts'), 'utf8');

describe('Stripe invoice checkout contracts', () => {
  it('prints a human reference and stays inside Stripe\'s four custom fields', () => {
    expect(invoiceRoute).toContain("{ name: 'Er referens', value: reference }");
    expect(invoiceRoute).toContain('account.contactName');
    // Organisationsnummer, Momsreg.nr, Ordernummer och Er referens är fyra —
    // Stripe tar inte fler, så inköpsordernumret delar fält med referensen.
    const fields = invoiceRoute.slice(invoiceRoute.indexOf('custom_fields: ['));
    expect(fields.slice(0, fields.indexOf('],')).match(/name: '/g)).toHaveLength(4);
    expect(invoiceRoute).toContain('Ert ordernr');
  });

  it('creates a 30-day Stripe send-invoice flow from server-priced cart data', () => {
    expect(invoiceRoute).toContain("collection_method: 'send_invoice'");
    expect(invoiceRoute).toContain('days_until_due: INVOICE_DUE_DAYS');
    expect(invoiceRoute).toContain('reserveOrderStockStrict(orderId, \'invoice\', expiresAt)');
    expect(invoiceRoute).not.toMatch(/body\.(amount|price|unitAmount)/);
    expect(invoiceRoute).toContain('linnevik_invoice_item_');
    expect(invoiceRoute).toContain('linnevik_invoice_send_');
  });

  it('only lets a signed-in, active company account raise an invoice', () => {
    expect(invoiceRoute).toContain('getCurrentCustomerFromCookies()');
    expect(invoiceRoute).toContain('if (!account) {');
    expect(invoiceRoute).toContain("'SIGN_IN_REQUIRED'");
    expect(invoiceRoute).toContain("account.status !== 'active'");
    // The organisation number and e-mail are taken from the account, never the
    // request. Both, plus the company name and address, are checked by
    // resolveCompanyProfile — the same call the account page validates with, so
    // this route cannot reject what that page just accepted.
    expect(invoiceRoute).toContain('organizationNumber: account.organizationNumber');
    expect(invoiceRoute).toContain('email: account.email');
    expect(invoiceRoute).not.toMatch(/supplied\?\.(email|organizationNumber)/);
    expect(invoiceRoute).toContain('resolveCompanyProfile({');
    expect(invoiceRoute).toContain('if (!resolved.ok) {');
    expect(invoiceRoute).toContain('throw new InvoiceError(PROFILE_GAP_CODES[resolved.missing]');
  });

  it('rate-limits invoice creation per IP and per account', () => {
    expect(invoiceRoute).toContain("scope: 'invoice',");
    expect(invoiceRoute).toContain("scope: 'invoice_account',");
    expect(invoiceRoute).toContain('clientIp(request.headers)');
    expect(invoiceRoute).toMatch(/'RATE_LIMITED', .*, 429/);
  });

  it('settles only from Stripe invoice events and handles invoice expiry before stock release', () => {
    expect(webhook).toContain("case 'invoice.paid':");
    expect(webhook).toContain("case 'invoice.voided':");
    expect(webhook).toContain("case 'invoice.marked_uncollectible':");
    expect(invoices).toContain('invoices.voidInvoice(invoice.id)');
    expect(inventory).toContain("o.payment_method <> 'invoice'");
    expect(invoices).toContain("invoice.status === 'draft'");
    expect(invoices).toContain('invoices.del(invoice.id)');
  });

  it('keeps an admin cancel and the Stripe invoice in sync', () => {
    // Cancelling an invoice order voids the receivable in Stripe first.
    expect(ordersDb).toMatch(/patch\.status === 'cancelled'[\s\S]*paymentMethod === 'invoice'[\s\S]*invoices\.voidInvoice/);
    // A late payment can no longer revive a cancelled order.
    expect(ordersDb).toMatch(/target\.status === 'cancelled'[\s\S]*newlyPaid: false/);
  });

  it('persists the payment-flow distinction for reconciliation', () => {
    expect(migration).toContain('"payment_method" text NOT NULL DEFAULT \'checkout\'');
    expect(migration).toContain('"orders_payment_method_idx"');
  });

  it('prints each line as a unit price times a quantity, not one lump sum', () => {
    // Stripe vägrar `amount` och `quantity` på samma rad. Med bara `amount`
    // blev 18 täcken "1 st à 4 320,00 kr" — rätt summa, oläsbar faktura. Ett
    // pris per rad bär styckpriset, och antalet står för sig.
    expect(invoiceRoute).toContain('prices.create(');
    expect(invoiceRoute).toContain('pricing: { price: await priceForLine(line, input.orderId) }');
    expect(invoiceRoute).toContain('quantity: line.quantity');
    expect(invoiceRoute).not.toContain('amount: line.unitAmountMinor * line.quantity');
    expect(invoiceRoute).toContain('linnevik_invoice_price_');
  });

  it('separates the organisation number from the VAT number on the invoice', () => {
    expect(invoiceRoute).toContain('swedishOrganizationNumber(profile.organizationNumber)');
    expect(invoiceRoute).toContain("{ name: 'Momsreg.nr', value: profile.organizationNumber }");
    expect(invoiceRoute).not.toContain("{ name: 'Organisationsnummer', value: profile.organizationNumber }");
  });

  it('mails the buyer the invoice when it is sent, not when it is paid', () => {
    // Stripes eget utskick styrs av en kontoinställning och är inte vårt brev.
    // Utan det här hörde köparen ingenting från oss förrän betalningen kom in.
    expect(invoiceRoute).toContain('sendInvoiceCreatedNotice(');
    expect(invoiceRoute).toContain('hostedUrl: sent.hosted_invoice_url ?? null');
    expect(orderEmails).toContain("deliver(\n      order.id,\n      'order.invoice'");
    // Fakturan går till företagets fakturabrevlåda när kundregistret har en.
    expect(orderEmails).toContain("const recipient = invoiceEmail?.trim() || order?.email;");
    expect(invoiceRoute).toContain('notifyEmail: account.invoiceEmail');
    // Ett omspelat försök får inte skicka mejlet en gång till.
    expect(orderEmails).toContain("detail->>'template' = 'order.invoice'");
  });

  it('retires a cart that has gone to checkout so the buyer gets an empty one', () => {
    // Klienten glömmer korgen bara på 404. Utan det här låg 18 täcken kvar i
    // korgen efter köpet — synliga och låsta — tills fakturan betalats.
    expect(cartRoute).toContain("cart.status !== 'active'");
    expect(cartRoute).toContain('status: 404');
  });

  it('does not let a voided invoice rewrite an order someone cancelled', () => {
    // Admin avbeställer -> vi voidar fakturan i Stripe -> `invoice.voided`
    // kommer tillbaka. Utan skyddet skrev den om "cancelled" till "failed",
    // alltså ett beslut till ett betalningsfel.
    expect(ordersDb).toContain("and status <> 'cancelled'");
    // Och avbeställningen stänger betalningen själv, så avstämningen slutar
    // plocka upp ordern som oavslutad varje natt.
    expect(ordersDb).toContain("update orders set payment_status = 'failed', updated_at = now()");
    expect(invoices).toContain("payment_status = 'pending'");
  });
});
