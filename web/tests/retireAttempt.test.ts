/**
 * Ett försök som läggs ner stänger betalsidan innan lagret släpps. Att släppa
 * reservationen medan betalsidan går att betala sålde lager som inte längre
 * var reserverat för den.
 */

import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const stripe = {
  checkout: {
    sessions: {
      retrieve: vi.fn(async () => ({ status: 'open' })),
      expire: vi.fn(async () => {
        calls.push('expire');
      }),
    },
  },
};
vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/ordersDb', () => ({
  abandonPendingOrder: vi.fn(async () => {
    calls.push('abandon');
  }),
  getOrderByCartVersion: vi.fn(),
}));

describe('retireAttempt', () => {
  it('stänger en öppen betalsida innan lagret släpps', async () => {
    const { retireAttempt } = await import('@/lib/checkoutAttempts');
    await retireAttempt({ id: 1, stripeSessionId: 'cs_test_1' } as never, 'test');
    expect(calls).toEqual(['expire', 'abandon']);
  });

  it('släpper inte lagret när betalsidan inte gick att stänga', async () => {
    calls.length = 0;
    stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error('Stripe nere'));
    const { retireAttempt } = await import('@/lib/checkoutAttempts');
    await expect(retireAttempt({ id: 2, stripeSessionId: 'cs_test_2' } as never, 'test')).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
