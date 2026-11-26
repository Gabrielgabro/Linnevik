import { describe, expect, it } from 'vitest';
import {
  assessBankPayment,
  formatBankgiro,
  InvoicePaymentConfigError,
  invoicePaymentDetails,
  luhnCheckDigit,
  luhnValid,
  ocrForOrder,
  orderIdFromOcr,
  paymentInstructions,
  validatePaidOn,
} from '@/lib/invoicePayment';
import { daysOverdue } from '@/lib/invoiceOrders';

describe('Luhn (modulus 10)', () => {
  it('matches the standard test vector', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
    expect(luhnValid('79927398713')).toBe(true);
    expect(luhnValid('79927398710')).toBe(false);
  });
});

describe('OCR numbers', () => {
  it('appends a length digit and a check digit to the order number', () => {
    expect(ocrForOrder(12)).toBe('1248');
    for (const id of [1, 9, 12, 99, 100, 12345, 99999999, 123456789]) {
      const ocr = ocrForOrder(id);
      expect(luhnValid(ocr)).toBe(true);
      expect(Number(ocr.at(-2))).toBe(ocr.length % 10);
      expect(orderIdFromOcr(ocr)).toBe(id);
    }
  });

  it('reads an OCR back, tolerating spaces, and rejects a mistyped one', () => {
    expect(orderIdFromOcr(' 12 48 ')).toBe(12);
    expect(orderIdFromOcr('1249')).toBeNull(); // fel kontrollsiffra
    expect(orderIdFromOcr('1428')).toBeNull(); // omkastade siffror
    expect(orderIdFromOcr('12')).toBeNull();
    expect(orderIdFromOcr('abc')).toBeNull();
  });

  it('refuses a non-positive order id', () => {
    expect(() => ocrForOrder(0)).toThrow();
    expect(() => ocrForOrder(1.5)).toThrow();
  });
});

describe('bankgiro', () => {
  // Ett giltigt sjusiffrigt och åttasiffrigt nummer, byggda med kontrollsiffran.
  const seven = `123456${luhnCheckDigit('123456')}`;
  const eight = `5050105${luhnCheckDigit('5050105')}`;

  it('formats valid numbers and rejects a wrong check digit', () => {
    expect(formatBankgiro(seven)).toBe(`${seven.slice(0, 3)}-${seven.slice(3)}`);
    expect(formatBankgiro(`${eight.slice(0, 4)}-${eight.slice(4)}`)).toBe(`${eight.slice(0, 4)}-${eight.slice(4)}`);
    const wrong = `${seven.slice(0, -1)}${(Number(seven.at(-1)) + 1) % 10}`;
    expect(formatBankgiro(wrong)).toBeNull();
    expect(formatBankgiro('12345')).toBeNull();
  });

  it('requires bankgiro or a full bank account, and never guesses', () => {
    expect(() => invoicePaymentDetails({})).toThrow(InvoicePaymentConfigError);
    expect(() => invoicePaymentDetails({ INVOICE_BANKGIRO: '123-4567' })).toThrow(/inte ett giltigt/);
    expect(() => invoicePaymentDetails({ INVOICE_BANK_CLEARING: '8327' })).toThrow(/tillsammans/);
    expect(invoicePaymentDetails({ INVOICE_BANKGIRO: seven }).bankgiro).toBe(formatBankgiro(seven));
    const account = invoicePaymentDetails({ INVOICE_BANK_CLEARING: '8327-9', INVOICE_BANK_ACCOUNT: '123 456 789-0', INVOICE_BANK_NAME: 'Swedbank' });
    expect(account).toEqual({ bankgiro: null, bankAccount: { bank: 'Swedbank', clearing: '8327-9', account: '123 456 789-0' } });
  });

  it('writes the instructions with bankgiro first and the OCR as reference', () => {
    const details = invoicePaymentDetails({ INVOICE_BANKGIRO: seven, INVOICE_BANK_CLEARING: '8327', INVOICE_BANK_ACCOUNT: '1234567' });
    const sv = paymentInstructions(details, '1248', 'sv');
    expect(sv.memo).toContain(`bankgiro ${formatBankgiro(seven)}`);
    expect(sv.memo).toContain('OCR-nummer 1248');
    expect(sv.memo).toContain('clearing 8327, konto 1234567');
    expect(sv.footer).toContain('OCR 1248');
    expect(paymentInstructions(details, '1248', 'en').memo).toContain('OCR number 1248');
  });
});

describe('bank payment amount', () => {
  it('treats up to one krona as rounding, and anything more as under/over', () => {
    expect(assessBankPayment({ amountDueMinor: 540000, receivedMinor: 540000 }).kind).toBe('exact');
    expect(assessBankPayment({ amountDueMinor: 540000, receivedMinor: 539950 }).kind).toBe('rounding');
    expect(assessBankPayment({ amountDueMinor: 540000, receivedMinor: 540100 }).kind).toBe('rounding');
    expect(assessBankPayment({ amountDueMinor: 540000, receivedMinor: 500000 })).toEqual({ kind: 'under', differenceMinor: -40000 });
    expect(assessBankPayment({ amountDueMinor: 540000, receivedMinor: 1080000 })).toEqual({ kind: 'over', differenceMinor: 540000 });
  });
});

describe('payment date', () => {
  const orderCreatedAt = new Date('2026-08-29T07:19:30Z');
  const now = new Date('2026-11-20T23:30:00Z'); // 00:30 den 21:a i Stockholm

  it('accepts a real date between the order and today (Stockholm time)', () => {
    expect(validatePaidOn('2026-09-28', { orderCreatedAt, now })).toEqual({ ok: true, date: '2026-09-28' });
    expect(validatePaidOn('2026-11-21', { orderCreatedAt, now }).ok).toBe(true);
  });

  it('rejects malformed, impossible, future and pre-order dates', () => {
    expect(validatePaidOn('28/9', { orderCreatedAt, now }).ok).toBe(false);
    expect(validatePaidOn('2026-02-30', { orderCreatedAt, now }).ok).toBe(false);
    expect(validatePaidOn('2026-11-22', { orderCreatedAt, now }).ok).toBe(false);
    expect(validatePaidOn('2026-08-28', { orderCreatedAt, now }).ok).toBe(false);
    expect(validatePaidOn(undefined, { orderCreatedAt, now }).ok).toBe(false);
  });
});

describe('days overdue', () => {
  it('counts whole days after the due date, in Swedish time', () => {
    const at = (iso: string) => new Date(iso);
    expect(daysOverdue('2026-09-28', at('2026-09-28T21:00:00Z'))).toBe(0);
    expect(daysOverdue('2026-09-28', at('2026-09-28T22:30:00Z'))).toBe(1);
    expect(daysOverdue('2026-09-28', at('2026-10-05T10:00:00Z'))).toBe(7);
    expect(daysOverdue(null, at('2026-10-05T10:00:00Z'))).toBe(0);
  });
});
