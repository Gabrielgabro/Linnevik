import { describe, expect, it } from 'vitest';
import { ocrForOrder } from '@/lib/invoicePayment';
import { parseOrderSearch } from '@/lib/orderSearch';

describe('parseOrderSearch', () => {
  it('ignores empty input', () => {
    expect(parseOrderSearch(undefined)).toBeNull();
    expect(parseOrderSearch('   ')).toBeNull();
    expect(parseOrderSearch([])).toBeNull();
  });

  it('reads an OCR number from the bank statement as its order, and keeps the literal order number too', () => {
    const search = parseOrderSearch('1248');
    expect(search?.ocrOrderId).toBe(12);
    expect(search?.ids.sort((a, b) => a - b)).toEqual([12, 1248]);
  });

  it('accepts OCR numbers written with spaces or dashes', () => {
    expect(parseOrderSearch('12 48')?.ocrOrderId).toBe(12);
    expect(parseOrderSearch('12-48')?.ocrOrderId).toBe(12);
    expect(parseOrderSearch(` ${ocrForOrder(4711)} `)?.ocrOrderId).toBe(4711);
  });

  it('treats a mistyped OCR number as a plain order number, not as some other order', () => {
    const search = parseOrderSearch('1249');
    expect(search?.ocrOrderId).toBeNull();
    expect(search?.ids).toEqual([1249]);
  });

  it('reads "#12" as order 12', () => {
    expect(parseOrderSearch('#12')?.ids).toEqual([12]);
  });

  it('never yields an id outside a Postgres integer', () => {
    expect(parseOrderSearch('99999999999999999999')?.ids).toEqual([]);
  });

  it('searches text as a substring with LIKE wildcards escaped', () => {
    const search = parseOrderSearch('100%_rabatt\\');
    expect(search?.ids).toEqual([]);
    expect(search?.pattern).toBe('%100\\%\\_rabatt\\\\%');
  });

  it('caps very long input', () => {
    expect(parseOrderSearch('a'.repeat(500))?.text).toHaveLength(100);
  });
});
