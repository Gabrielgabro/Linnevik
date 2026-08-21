import { afterEach, describe, expect, it } from 'vitest';
import {
  ownedCommerceEnabled,
  checkoutReservationMinutes,
  stripeIntegrationIdentifier,
  stripeTaxEnabled,
} from '@/lib/commerceConfig';

afterEach(() => {
  delete process.env.OWNED_COMMERCE_ENABLED;
  delete process.env.STRIPE_TAX_REGISTRATION_CONFIRMED;
  delete process.env.STRIPE_INTEGRATION_IDENTIFIER;
  delete process.env.CHECKOUT_RESERVATION_MINUTES;
});

describe('commerce safety switches', () => {
  it('keeps owned commerce and Stripe Tax off by default', () => {
    expect(ownedCommerceEnabled()).toBe(false);
    expect(stripeTaxEnabled()).toBe(false);
  });

  it('requires an exact explicit opt-in', () => {
    process.env.OWNED_COMMERCE_ENABLED = 'true';
    process.env.STRIPE_TAX_REGISTRATION_CONFIRMED = 'true';
    expect(ownedCommerceEnabled()).toBe(true);
    expect(stripeTaxEnabled()).toBe(true);
  });

  it('provides a stable integration identifier with an eight-letter suffix', () => {
    expect(stripeIntegrationIdentifier()).toMatch(/_[a-z]{8}$/);
  });

  it('keeps checkout reservations within Stripe Session limits', () => {
    expect(checkoutReservationMinutes()).toBe(45);
    process.env.CHECKOUT_RESERVATION_MINUTES = '60';
    expect(checkoutReservationMinutes()).toBe(60);
    process.env.CHECKOUT_RESERVATION_MINUTES = '30';
    expect(checkoutReservationMinutes()).toBe(45);
  });
});
