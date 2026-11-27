import { beforeEach, describe, expect, it, vi } from 'vitest';

const retrieve = vi.fn();
const raiseAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ balance: { retrieve } }),
  stripeConfigured: () => true,
  stripeTestMode: () => false,
}));
vi.mock('@/lib/opsAlerts', () => ({ raiseAlert }));

const { checkStripeKey, isStripeKeyError } = await import('@/lib/stripeHealth');

const expired = Object.assign(new Error('Expired API Key provided'), {
  type: 'StripeAuthenticationError', statusCode: 401, code: 'api_key_expired',
});

describe('Stripe-nyckelns kontroll', () => {
  beforeEach(() => {
    retrieve.mockReset();
    raiseAlert.mockClear();
  });

  it('känner igen en utgången eller ogiltig nyckel, men inte andra fel', () => {
    expect(isStripeKeyError(expired)).toBe(true);
    expect(isStripeKeyError({ type: 'StripeAuthenticationError' })).toBe(true);
    expect(isStripeKeyError({ type: 'StripeConnectionError' })).toBe(false);
    expect(isStripeKeyError({ type: 'StripeCardError', statusCode: 402 })).toBe(false);
    expect(isStripeKeyError(null)).toBe(false);
  });

  it('säger ok och läget när nyckeln fungerar', async () => {
    retrieve.mockResolvedValue({});
    expect(await checkStripeKey({ fresh: true })).toEqual({ ok: true, mode: 'live' });
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('larmar på en utgången nyckel', async () => {
    retrieve.mockRejectedValue(expired);
    const status = await checkStripeKey({ fresh: true });
    expect(status).toMatchObject({ ok: false, reason: 'invalid', message: 'Stripe-nyckeln har gått ut.' });
    expect(raiseAlert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stripe.key', key: 'stripe:key' }));
  });

  it('larmar inte när Stripe bara inte svarar', async () => {
    retrieve.mockRejectedValue({ type: 'StripeConnectionError' });
    expect(await checkStripeKey({ fresh: true })).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it('räknar en begränsad nyckel utan läsrätt på saldot som giltig', async () => {
    retrieve.mockRejectedValue({ type: 'StripePermissionError', statusCode: 403 });
    expect(await checkStripeKey({ fresh: true })).toEqual({ ok: true, mode: 'live' });
  });
});
