import { describe, expect, it } from 'vitest';
import { CheckoutInputError, parseCheckoutInput } from '@/lib/checkoutInput';

const cartId = '550e8400-e29b-41d4-a716-446655440000';

describe('parseCheckoutInput', () => {
  it('normalizes the optional checkout fields', () => {
    expect(parseCheckoutInput({
      cartId: ` ${cartId} `,
      discountCode: '  SUMMER  ',
      email: ' Buyer@Example.COM ',
    })).toEqual({ cartId, discountCode: 'SUMMER', email: 'buyer@example.com' });
  });

  it('rejects malformed UUID-shaped cart capabilities', () => {
    expect(() => parseCheckoutInput({ cartId: '-'.repeat(36) })).toThrow(CheckoutInputError);
    expect(() => parseCheckoutInput({ cartId: '550e8400e29b41d4a716446655440000' })).toThrow(
      CheckoutInputError
    );
  });

  it('rejects oversized values before they reach Postgres or Stripe', () => {
    expect(() => parseCheckoutInput({ cartId, discountCode: 'X'.repeat(81) })).toThrow(
      'discountCode is too long.'
    );
    expect(() => parseCheckoutInput({ cartId, email: `${'x'.repeat(250)}@x.se` })).toThrow(
      'A valid email is required.'
    );
  });

  it('does not accept non-text optional fields', () => {
    expect(() => parseCheckoutInput({ cartId, email: { value: 'buyer@example.com' } })).toThrow(
      'email must be text.'
    );
    expect(() => parseCheckoutInput({ cartId, discountCode: ['SUMMER'] })).toThrow(
      'discountCode must be text.'
    );
  });
});
