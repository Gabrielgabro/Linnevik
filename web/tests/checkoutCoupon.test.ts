/**
 * §4.9: rabatten räknas på varorna, aldrig på frakten, och Stripe drar
 * exakt det belopp ordern visade (A10). Stripe är utbytt här. Att Stripe
 * verkligen drar beloppet en gång över de valda raderna kontrolleras av
 * kassan själv: avviker rabatten stängs betalsidan (checkout/route.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = { coupons: { create: vi.fn(async (...args: unknown[]) => ({ id: 'co_order', args })) } };
vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));

describe('kortkassans rabattkupong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('är ett fast belopp, en gång, bara på orderns produkter', async () => {
    const { createCheckoutCoupon } = await import('@/lib/commerceOperations');
    await expect(
      createCheckoutCoupon({
        orderId: 12,
        discountId: 3,
        amountMinor: 4_500,
        currency: 'sek',
        productIds: ['prod_a', 'prod_b', 'prod_a'],
      })
    ).resolves.toBe('co_order');

    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 4_500,
        currency: 'sek',
        duration: 'once',
        max_redemptions: 1,
        applies_to: { products: ['prod_a', 'prod_b'] },
      }),
      { idempotencyKey: 'linnevik_checkout_coupon_12_4500' }
    );
    const params = stripe.coupons.create.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('percent_off');
  });

  it('vägrar hellre än att ge rabatt på allt', async () => {
    const { createCheckoutCoupon } = await import('@/lib/commerceOperations');
    await expect(
      createCheckoutCoupon({ orderId: 1, discountId: 1, amountMinor: 100, currency: 'sek', productIds: [] })
    ).rejects.toThrow();
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });
});
