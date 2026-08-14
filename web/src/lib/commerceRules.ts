export type DiscountKind = 'percentage' | 'fixed_amount' | 'free_shipping';

export type DiscountRule = {
  kind: DiscountKind;
  value: number;
  minimumSubtotalMinor: number;
};

export function discountAmount(rule: DiscountRule, subtotalMinor: number): number {
  if (!Number.isInteger(subtotalMinor) || subtotalMinor < 0) {
    throw new Error('Subtotal must be a non-negative integer.');
  }
  if (subtotalMinor < rule.minimumSubtotalMinor || rule.kind === 'free_shipping') return 0;
  if (rule.kind === 'percentage') {
    const percentage = Math.min(100, Math.max(0, rule.value));
    return Math.min(subtotalMinor, Math.round((subtotalMinor * percentage) / 100));
  }
  return Math.min(subtotalMinor, Math.max(0, rule.value));
}

export function shippingAmount(
  rule: { priceMinor: number; freeAboveMinor: number | null },
  subtotalAfterDiscountMinor: number,
  freeShipping = false
): number {
  if (freeShipping) return 0;
  if (rule.freeAboveMinor !== null && subtotalAfterDiscountMinor >= rule.freeAboveMinor) return 0;
  return Math.max(0, rule.priceMinor);
}

export function normalizeDiscountCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}
