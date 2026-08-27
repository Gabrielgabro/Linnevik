import { describe, expect, it } from 'vitest';
import { stripeFailureIsAmbiguous } from '@/lib/stripe';

describe('stripeFailureIsAmbiguous', () => {
  it('preserves idempotency state after a lost connection', () => {
    expect(stripeFailureIsAmbiguous({ type: 'StripeConnectionError' })).toBe(true);
  });

  it('treats Stripe server failures as ambiguous', () => {
    expect(stripeFailureIsAmbiguous({ type: 'StripeAPIError', statusCode: 500 })).toBe(true);
    expect(stripeFailureIsAmbiguous({ type: 'StripeAPIError', statusCode: 503 })).toBe(true);
  });

  it('allows cleanup after definite request errors', () => {
    expect(stripeFailureIsAmbiguous({ type: 'StripeInvalidRequestError', statusCode: 400 })).toBe(false);
    expect(stripeFailureIsAmbiguous(new Error('local failure'))).toBe(false);
  });
});
