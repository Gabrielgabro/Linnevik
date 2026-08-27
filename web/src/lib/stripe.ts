/**
 * Stripe-klienten. Bara server-side — nyckeln får aldrig ut i klientpaketet.
 */

import Stripe from 'stripe';

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Sant när nyckeln är en testnyckel. Både `sk_` (hemlig) och `rk_` (begränsad)
 * finns i båda lägena, så det är `_test_`-delen som avgör — inte prefixet.
 *
 * Saknas nyckeln helt räknas det som testläge: ingen skarp betalning kan ändå
 * gå igenom, och en order som felaktigt märks som skarp är värre än tvärtom.
 */
export function stripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !key || key.includes('_test_');
}

/**
 * A connection loss or Stripe 5xx can happen after Stripe accepted a create
 * request but before this process received the response. Callers must keep
 * idempotency state/reservations in that case and retry the same request.
 */
export function stripeFailureIsAmbiguous(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { type?: unknown; statusCode?: unknown };
  if (candidate.type === 'StripeConnectionError') return true;
  return candidate.type === 'StripeAPIError'
    && typeof candidate.statusCode === 'number'
    && candidate.statusCode >= 500;
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set.');
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Låst version: en tyst uppgradering av Stripes API ska inte kunna ändra
      // hur kassan beter sig mellan två deployer.
      apiVersion: '2026-07-29.dahlia',
      appInfo: { name: 'Linnevik', url: 'https://linnevik.se' },
    });
  }
  return client;
}
