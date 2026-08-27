import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const invoiceRoute = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const invoices = readFileSync(resolve('src/lib/stripeInvoices.ts'), 'utf8');
const webhook = readFileSync(resolve('app/api/stripe/webhook/route.ts'), 'utf8');
const inventory = readFileSync(resolve('src/lib/inventoryDb.ts'), 'utf8');
const migration = readFileSync(resolve('drizzle/0034_stripe_invoice_payment_method.sql'), 'utf8');

describe('Stripe invoice checkout contracts', () => {
  it('creates a 30-day Stripe send-invoice flow from server-priced cart data', () => {
    expect(invoiceRoute).toContain("collection_method: 'send_invoice'");
    expect(invoiceRoute).toContain('days_until_due: INVOICE_DUE_DAYS');
    expect(invoiceRoute).toContain('reserveOrderStockStrict(orderId, \'invoice\', expiresAt)');
    expect(invoiceRoute).not.toMatch(/body\.(amount|price|unitAmount)/);
  });

  it('uses the signed-in account organisation number and validates a guest number', () => {
    expect(invoiceRoute).toContain('getCurrentCustomerFromCookies()');
    expect(invoiceRoute).toContain('logged?.taxId ?? supplied?.organizationNumber');
    expect(invoiceRoute).toContain('validOrganizationNumber(organizationNumber)');
  });

  it('settles only from Stripe invoice events and handles invoice expiry before stock release', () => {
    expect(webhook).toContain("case 'invoice.paid':");
    expect(webhook).toContain("case 'invoice.voided':");
    expect(webhook).toContain("case 'invoice.marked_uncollectible':");
    expect(invoices).toContain('invoices.voidInvoice(invoice.id)');
    expect(inventory).toContain("o.payment_method <> 'invoice'");
  });

  it('persists the payment-flow distinction for reconciliation', () => {
    expect(migration).toContain('"payment_method" text NOT NULL DEFAULT \'checkout\'');
    expect(migration).toContain('"orders_payment_method_idx"');
  });
});
