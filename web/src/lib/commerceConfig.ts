export const OWNED_CART_TTL_DAYS = 30;
export const CURRENT_PRICING_VERSION = 'v1';

/**
 * A Checkout Session may stay open for at least 30 minutes. We reserve tracked
 * stock for the same period so a customer cannot pay for inventory that a
 * second open Checkout has already consumed. Keep a little distance from
 * Stripe's 30-minute lower bound to account for the API call itself.
 */
export function checkoutReservationMinutes(): number {
  const parsed = Number(process.env.CHECKOUT_RESERVATION_MINUTES ?? 45);
  if (!Number.isInteger(parsed) || parsed < 31 || parsed > 24 * 60) return 45;
  return parsed;
}

export function ownedCommerceEnabled(): boolean {
  return process.env.OWNED_COMMERCE_ENABLED === 'true';
}

/**
 * Stripe Tax must be an explicit, separately reviewed production decision.
 * Merely configuring Stripe is deliberately not enough to switch it on.
 */
export function stripeTaxEnabled(): boolean {
  return process.env.STRIPE_TAX_REGISTRATION_CONFIRMED === 'true';
}

export function stripeIntegrationIdentifier(): string {
  return process.env.STRIPE_INTEGRATION_IDENTIFIER || 'linnevik_owned_qhjmztka';
}
