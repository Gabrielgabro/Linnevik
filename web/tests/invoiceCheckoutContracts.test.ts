import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const invoiceRoute = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const invoices = readFileSync(resolve('src/lib/stripeInvoices.ts'), 'utf8');
const webhook = readFileSync(resolve('app/api/stripe/webhook/route.ts'), 'utf8');
const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const migration = readFileSync(resolve('drizzle/0034_stripe_invoice_payment_method.sql'), 'utf8');

describe('Stripe invoice checkout contracts', () => {
  it('creates a 30-day Stripe send-invoice flow from server-priced cart data', () => {
    expect(invoiceRoute).toContain("collection_method: 'send_invoice'");
    expect(invoiceRoute).toContain('days_until_due: INVOICE_DUE_DAYS');
    expect(invoiceRoute).toContain('reserveOrderStockStrict(orderId, \'invoice\', expiresAt)');
    expect(invoiceRoute).not.toMatch(/body\.(amount|price|unitAmount)/);
  });

  it('only lets a signed-in, active company account raise an invoice', () => {
    expect(invoiceRoute).toContain('getCurrentCustomerFromCookies()');
    expect(invoiceRoute).toContain('if (!account) {');
    expect(invoiceRoute).toContain("status: 401");
    expect(invoiceRoute).toContain("account.status !== 'active'");
    // The organisation number and e-mail are taken from the account, never the request.
    expect(invoiceRoute).toContain('normalizeOrganizationNumber(account.taxId)');
    expect(invoiceRoute).not.toMatch(/supplied\?\.(email|organizationNumber)/);
    expect(invoiceRoute).toContain('validOrganizationNumber(organizationNumber)');
  });

  it('rate-limits invoice creation per IP and per account', () => {
    expect(invoiceRoute).toContain("scope: 'invoice',");
    expect(invoiceRoute).toContain("scope: 'invoice_account',");
    expect(invoiceRoute).toContain('clientIp(request.headers)');
    expect(invoiceRoute).toMatch(/status: 429/);
  });

  it('settles only from Stripe invoice events and handles invoice expiry before stock release', () => {
    expect(webhook).toContain("case 'invoice.paid':");
    expect(webhook).toContain("case 'invoice.voided':");
    expect(webhook).toContain("case 'invoice.marked_uncollectible':");
    expect(invoices).toContain('invoices.voidInvoice(invoice.id)');
    expect(inventory).toContain("o.payment_method <> 'invoice'");
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
});
