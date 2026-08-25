export const OWNED_CART_TTL_DAYS = 30;
/**
 * Reserv när arkivet inte går att läsa. Var förr den enda "versionen" som
 * fanns: en literal som varje korg stämplades med oavsett hur reglerna sett
 * ut. Den riktiga versionen kommer numera från `pricing_config_versions` —
 * se pricingConfigDb.currentPricingVersion.
 */
export const FALLBACK_PRICING_VERSION = 'v1';

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

/**
 * Under hur många tillgängliga enheter en säljbar variant larmar i
 * dygnskörningen. Noll stänger av larmet helt.
 */
export function lowStockThreshold(): number {
  const parsed = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) return 5;
  return parsed;
}
