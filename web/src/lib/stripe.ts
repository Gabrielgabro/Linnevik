/**
 * Stripe-klienten. Bara server-side — nyckeln får aldrig ut i klientpaketet.
 */

import Stripe from 'stripe';

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
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
