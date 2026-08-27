import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(resolve('app/api/checkout/route.ts'), 'utf8');
const button = readFileSync(resolve('src/components/CheckoutButton.tsx'), 'utf8');
const invoiceButton = readFileSync(resolve('src/components/InvoiceCheckoutButton.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve('src/translations/en.json'), 'utf8'));
const sv = JSON.parse(readFileSync(resolve('src/translations/sv.json'), 'utf8'));

const DISCOUNT_REASONS = [
  'INVALID', 'NOT_STARTED', 'EXPIRED', 'CURRENCY', 'MINIMUM',
  'LIMIT_REACHED', 'CUSTOMER_LIMIT_REACHED', 'SIGN_IN_REQUIRED',
];

/**
 * `CART_INVALID` and the `CartRuleError` codes carry a sentence the rule
 * library builds around the offending SKU, so `messageForCode` deliberately
 * prefers the server's own text there. Those are Swedish-only for now.
 */
const SERVER_WORDED = new Set(['CART_INVALID']);

function emittedCodes(): string[] {
  const codes = [...checkout.matchAll(/fail\(\s*'([A-Z_]+)'/g)].map(match => match[1]);
  return [...new Set([...codes, ...DISCOUNT_REASONS.map(reason => `DISCOUNT_${reason}`)])].filter(
    code => !SERVER_WORDED.has(code)
  );
}

describe('checkout errors reach the buyer in their own language', () => {
  it('renders the translated code, not the server string', () => {
    // Showing `data.error` directly meant English sentences for Swedish
    // buyers and Swedish ones for English buyers, depending on which layer
    // raised the error.
    expect(button).toContain('messageForCode(data, errorMessages, errorLabel)');
    expect(invoiceButton).toContain('messageForCode(data, props.errorMessages, props.errorLabel)');
    expect(button).not.toContain('setError(error instanceof Error ? error.message : errorLabel)');
  });

  it('has wording in both languages for every code the API emits', () => {
    for (const code of emittedCodes()) {
      expect(en.cart.summary.checkoutErrors, `en is missing ${code}`).toHaveProperty(code);
      expect(sv.cart.summary.checkoutErrors, `sv is missing ${code}`).toHaveProperty(code);
    }
  });

  it('keeps the two translation files in step', () => {
    expect(Object.keys(sv.cart.summary.checkoutErrors).sort()).toEqual(
      Object.keys(en.cart.summary.checkoutErrors).sort()
    );
  });

  it('drops the message registration no longer sends', () => {
    // Registration answers the same way for a new and an existing address, so
    // "this email is taken" would be an account-enumeration leak.
    expect(en.register.errors).not.toHaveProperty('emailTaken');
    expect(sv.register.errors).not.toHaveProperty('emailTaken');
  });
});

describe('a buyer cannot lock themselves out of their own cart', () => {
  it('rate-limits the cart version rather than the cart', () => {
    // A cart id never rotates, so keying on it alone meant eight attempts per
    // hour for a buyer trying different discount codes — with no way to reset.
    expect(checkout).toContain('identity: `${ownedCartId}:${currentCart.version}`');
  });
});
