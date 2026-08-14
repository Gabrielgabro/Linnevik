import { describe, expect, it } from 'vitest';
import { resolveUnitAmount } from '@/lib/pricing';

describe('server-side pricing', () => {
  it('uses the server list price and quantity breaks', () => {
    expect(resolveUnitAmount(10_000, 1)).toBe(10_000);
    expect(resolveUnitAmount(10_000, 20)).toBe(9_500);
    expect(resolveUnitAmount(10_000, 50)).toBe(9_000);
    expect(resolveUnitAmount(10_000, 100)).toBe(8_500);
  });

  it('rounds to whole minor units and never returns a negative amount', () => {
    expect(resolveUnitAmount(999, 20)).toBe(949);
    expect(resolveUnitAmount(-100, 1)).toBe(0);
  });
});
