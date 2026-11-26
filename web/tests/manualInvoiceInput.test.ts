import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ManualInvoiceInputError,
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

describe('manual invoices', () => {
  const route = readFileSync(resolve('app/api/admin/invoices/route.ts'), 'utf8');

  it('is admin-only', () => {
    expect(route).toContain('requireAdmin(request)');
    expect(readFileSync(resolve('app/api/admin/invoices/quote/route.ts'), 'utf8')).toContain('requireAdmin(request)');
  });
});
