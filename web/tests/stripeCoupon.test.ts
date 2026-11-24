import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripe = { coupons: { retrieve: vi.fn(), create: vi.fn() } };
const row = {
  id: 7,
  title: 'Mässa',
  code: 'MASSA',
  kind: 'percentage',
  value: 10,
  currency: 'sek',
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};
const where = vi.fn();
const db = {
  query: { discountCodes: { findFirst: vi.fn(async () => row) } },
  update: () => ({ set: () => ({ where }) }),
};

vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe }));
vi.mock('@/lib/db', () => ({ getDb: () => db }));

const discount = { id: 7, kind: 'percentage', stripeCouponId: 'TESTMODE_COUPON' } as never;

describe('ensureStripeCoupon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses a coupon that exists in the current Stripe mode', async () => {
    stripe.coupons.retrieve.mockResolvedValue({ id: 'TESTMODE_COUPON', valid: true });
    const { ensureStripeCoupon } = await import('@/lib/commerceOperations');

    await expect(ensureStripeCoupon(discount)).resolves.toBe('TESTMODE_COUPON');
    expect(stripe.coupons.create).not.toHaveBeenCalled();
  });

  it('replaces a coupon that only exists in the other Stripe mode', async () => {
    stripe.coupons.retrieve.mockRejectedValue(
      Object.assign(new Error('No such coupon'), { code: 'resource_missing' })
    );
    stripe.coupons.create.mockResolvedValue({ id: 'LIVE_COUPON' });
    const { ensureStripeCoupon } = await import('@/lib/commerceOperations');

    await expect(ensureStripeCoupon(discount)).resolves.toBe('LIVE_COUPON');
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ percent_off: 10 }),
      { idempotencyKey: expect.stringContaining('TESTMODE_COUPON') }
    );
  });
});
