import { describe, expect, it } from 'vitest';
import { discountAmount, normalizeDiscountCode, shippingAmount } from '@/lib/commerceRules';

describe('owned commerce rules', () => {
  it('calculates and caps percentage and fixed discounts in minor units', () => {
    expect(discountAmount({ kind: 'percentage', value: 15, minimumSubtotalMinor: 0 }, 10_001)).toBe(1_500);
    expect(discountAmount({ kind: 'fixed_amount', value: 20_000, minimumSubtotalMinor: 0 }, 10_000)).toBe(10_000);
  });

  it('honours the minimum and keeps free shipping separate from product discounts', () => {
    expect(discountAmount({ kind: 'percentage', value: 20, minimumSubtotalMinor: 20_000 }, 10_000)).toBe(0);
    expect(discountAmount({ kind: 'free_shipping', value: 0, minimumSubtotalMinor: 0 }, 10_000)).toBe(0);
  });

  it('applies free-shipping thresholds and code normalization', () => {
    expect(shippingAmount({ priceMinor: 9900, freeAboveMinor: 50_000 }, 49_999)).toBe(9900);
    expect(shippingAmount({ priceMinor: 9900, freeAboveMinor: 50_000 }, 50_000)).toBe(0);
    expect(shippingAmount({ priceMinor: 9900, freeAboveMinor: null }, 1, true)).toBe(0);
    expect(normalizeDiscountCode(' hotel 15 ')).toBe('HOTEL15');
  });
});
