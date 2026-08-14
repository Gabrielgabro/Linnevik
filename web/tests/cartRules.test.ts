import { describe, expect, it } from 'vitest';
import { assertOrderable, CartRuleError, type Orderability } from '@/lib/cartRules';

const variant: Orderability = {
  sku: 'TEST-1',
  active: true,
  availableForSale: true,
  inventoryTracked: true,
  inventoryQuantity: 100,
  minimumOrderQuantity: 10,
  orderIncrement: 5,
};

function codeFor(quantity: number, patch: Partial<Orderability> = {}) {
  try {
    assertOrderable({ ...variant, ...patch }, quantity);
  } catch (error) {
    return (error as CartRuleError).code;
  }
  return null;
}

describe('owned cart orderability', () => {
  it('accepts the MOQ and valid pack increments', () => {
    expect(codeFor(10)).toBeNull();
    expect(codeFor(25)).toBeNull();
  });

  it('rejects invalid, below-MOQ, and off-increment quantities', () => {
    expect(codeFor(0)).toBe('INVALID_QUANTITY');
    expect(codeFor(5)).toBe('BELOW_MINIMUM');
    expect(codeFor(12)).toBe('INVALID_INCREMENT');
  });

  it('rejects inactive and unavailable variants', () => {
    expect(codeFor(10, { active: false })).toBe('NOT_FOR_SALE');
    expect(codeFor(10, { availableForSale: false })).toBe('NOT_FOR_SALE');
  });

  it('enforces stock only when inventory is tracked', () => {
    expect(codeFor(105)).toBe('INSUFFICIENT_STOCK');
    expect(codeFor(105, { inventoryTracked: false })).toBeNull();
  });
});
