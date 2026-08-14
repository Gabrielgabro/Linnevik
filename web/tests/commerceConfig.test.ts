import { afterEach, describe, expect, it } from 'vitest';
import {
  ownedCommerceEnabled,
  stripeIntegrationIdentifier,
  stripeTaxEnabled,
} from '@/lib/commerceConfig';

afterEach(() => {
  delete process.env.OWNED_COMMERCE_ENABLED;
  delete process.env.STRIPE_TAX_REGISTRATION_CONFIRMED;
  delete process.env.STRIPE_INTEGRATION_IDENTIFIER;
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
});
