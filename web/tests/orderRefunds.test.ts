/**
 * Ordningen i en återbetalning är det som stoppar dubbla utbetalningar:
 * beloppet bokas av på ordern innan Stripe anropas, och bokningen släpps om
 * Stripe säger nej (§8.11).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const ordersDb = {
  claimRefundAmount: vi.fn(async () => {
    calls.push('claim');
    return true;
  }),
  recordRefund: vi.fn(async () => ({ id: 1 })),
  syncRefundedTotal: vi.fn(async () => {
    calls.push('release');
  }),
};
const stripe = {
  refunds: {
    create: vi.fn(async () => {
      calls.push('stripe');
      return { id: 're_1', status: 'succeeded' };
    }),
  },
};
vi.mock('@/lib/ordersDb', () => ordersDb);
vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe, stripeConfigured: () => true }));
vi.mock('@/lib/invoicesDb', () => ({ issueCreditNote: vi.fn() }));
vi.mock('@/lib/orderEmails', () => ({ sendInvoiceEmail: vi.fn() }));

const order = {
  id: 7,
  paymentMethod: 'checkout',
  paymentStatus: 'paid',
  stripePaymentIntentId: 'pi_1',
  totalMinor: 10_000,
  refundedMinor: 0,
  taxMinor: 2_000,
  currency: 'sek',
} as never;

describe('refundOrder', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('bokar av beloppet före Stripe-anropet', async () => {
    const { refundOrder } = await import('@/lib/orderRefunds');
    await refundOrder({ order, amountMinor: 5_000, requestKey: 'k', actor: 'test' });
    expect(calls).toEqual(['claim', 'stripe']);
  });

  it('släpper bokningen när Stripe säger nej', async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error('Stripe nere'));
    const { refundOrder } = await import('@/lib/orderRefunds');
    await expect(refundOrder({ order, amountMinor: 5_000, requestKey: 'k', actor: 'test' })).rejects.toThrow('Stripe nere');
    expect(calls).toEqual(['claim', 'release']);
  });

  it('svarar 409 utan att anropa Stripe när beloppet inte längre ryms', async () => {
    ordersDb.claimRefundAmount.mockResolvedValueOnce(false);
    const { refundOrder, RefundError } = await import('@/lib/orderRefunds');
    const result = refundOrder({ order, amountMinor: 5_000, requestKey: 'k', actor: 'test' });
    await expect(result).rejects.toBeInstanceOf(RefundError);
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});
