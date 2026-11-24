import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ManualInvoiceInputError,
  manualInvoiceReference,
  parseManualInvoiceInput,
  parseManualInvoiceLines,
  parseManualInvoiceShipping,
} from '@/lib/manualInvoiceInput';

const valid = {
  clientId: 7,
  recipient: {
    email: ' ekonomi@tvatteri.se ',
    companyName: 'Tvätteri AB',
    organizationNumber: '556016-0680',
    address: { line1: 'Storgatan 1', line2: '', postalCode: '111 22', city: 'Stockholm' },
  },
  reference: 'Anna Ek',
  purchaseOrder: 'PO-991',
  lines: [{ variantId: 3, quantity: 18, unitAmountMinor: null }],
  shipping: { mode: 'rule' },
  daysUntilDue: 30,
  memo: '',
  note: 'Avtalat per telefon',
};

describe('parseManualInvoiceInput', () => {
  it('accepts a complete invoice and trims the text fields', () => {
    const input = parseManualInvoiceInput(valid);
    expect(input.recipient.email).toBe('ekonomi@tvatteri.se');
    expect(input.lines).toEqual([{ variantId: 3, quantity: 18, unitAmountMinor: null }]);
    expect(input.shipping).toEqual({ mode: 'rule' });
  });

  it('requires a client and a sane payment term', () => {
    expect(() => parseManualInvoiceInput({ ...valid, clientId: undefined })).toThrow(ManualInvoiceInputError);
    expect(() => parseManualInvoiceInput({ ...valid, daysUntilDue: 0 })).toThrow(/1–120/);
    expect(() => parseManualInvoiceInput({ ...valid, daysUntilDue: 365 })).toThrow(/1–120/);
  });
});

describe('parseManualInvoiceLines', () => {
  it('refuses an empty invoice, fractions and negative prices', () => {
    expect(() => parseManualInvoiceLines([])).toThrow(/minst en rad/);
    expect(() => parseManualInvoiceLines([{ variantId: 1, quantity: 0.5 }])).toThrow(/heltal/);
    expect(() => parseManualInvoiceLines([{ variantId: 1, quantity: 0 }])).toThrow(/heltal/);
    expect(() => parseManualInvoiceLines([{ variantId: 1, quantity: 1, unitAmountMinor: -100 }])).toThrow(/styckpris/);
  });

  it('keeps an own price, and an empty price means the catalogue price', () => {
    expect(parseManualInvoiceLines([{ variantId: 1, quantity: 2, unitAmountMinor: 24000 }])[0].unitAmountMinor).toBe(24000);
    expect(parseManualInvoiceLines([{ variantId: 1, quantity: 2, unitAmountMinor: '' }])[0].unitAmountMinor).toBeNull();
    expect(parseManualInvoiceLines([{ variantId: 1, quantity: 2, unitAmountMinor: 0 }])[0].unitAmountMinor).toBe(0);
  });

  it('merges the same product on two lines, since Stripe keys each line on the variant', () => {
    expect(parseManualInvoiceLines([
      { variantId: 1, quantity: 2 },
      { variantId: 1, quantity: 3 },
    ])).toEqual([{ variantId: 1, quantity: 5, unitAmountMinor: null }]);
  });

  it('refuses to guess between two different prices for the same product', () => {
    expect(() => parseManualInvoiceLines([
      { variantId: 1, quantity: 2, unitAmountMinor: 100 },
      { variantId: 1, quantity: 3, unitAmountMinor: 200 },
    ])).toThrow(/olika pris/);
  });
});

describe('parseManualInvoiceShipping', () => {
  it('defaults to the shipping rules and validates a manual amount', () => {
    expect(parseManualInvoiceShipping(undefined)).toEqual({ mode: 'rule' });
    expect(parseManualInvoiceShipping({ mode: 'none' })).toEqual({ mode: 'none' });
    expect(parseManualInvoiceShipping({ mode: 'manual', name: '', amountMinor: 49500 })).toEqual({
      mode: 'manual', name: 'Frakt', amountMinor: 49500,
    });
    expect(() => parseManualInvoiceShipping({ mode: 'manual', amountMinor: -1 })).toThrow(/Fraktbeloppet/);
  });
});

describe('manualInvoiceReference', () => {
  it('prints reference and purchase order the way checkout invoices do', () => {
    expect(manualInvoiceReference('Anna Ek', 'PO-991')).toBe('Anna Ek · Ert ordernr PO-991');
    expect(manualInvoiceReference('', '')).toBeNull();
  });
});

describe('manual invoices go the same way as checkout invoices', () => {
  const manual = readFileSync(resolve('src/lib/manualInvoice.ts'), 'utf8');
  const route = readFileSync(resolve('app/api/admin/invoices/route.ts'), 'utf8');

  it('uses the shared Stripe invoice builder, so the invoice looks the same', () => {
    expect(manual).toContain('createInvoiceDraft({');
    expect(manual).toContain('finishInvoice({');
    expect(manual).toContain('syncStripeInvoiceCustomer({');
  });

  it('is an invoice order with a strict stock reservation', () => {
    expect(manual).toContain("paymentMethod: 'invoice'");
    expect(manual).toContain("reserveOrderStockStrict(orderId, 'admin_invoice', dueAt)");
    expect(manual.indexOf('invoicePaymentDetails()')).toBeLessThan(manual.indexOf('createPendingOrder('));
  });

  it('cleans up only when Stripe definitely did not create the invoice', () => {
    expect(manual).toContain('if (stripeInvoiceId && !sent && !ambiguous)');
    expect(manual).toContain('if (orderId && !sent && !ambiguous)');
    expect(route).toContain('stripeFailureIsAmbiguous(error)');
  });

  it('is admin-only', () => {
    expect(route).toContain('requireAdmin(request)');
    expect(readFileSync(resolve('app/api/admin/invoices/quote/route.ts'), 'utf8')).toContain('requireAdmin(request)');
  });
});
