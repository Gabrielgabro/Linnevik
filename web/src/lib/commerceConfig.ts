export const OWNED_CART_TTL_DAYS = 30;
export const CURRENT_PRICING_VERSION = 'v1';

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
