import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const checkout = readFileSync(resolve('app/api/checkout/route.ts'), 'utf8');
const invoice = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
const operations = readFileSync(resolve('src/lib/commerceOperations.ts'), 'utf8');
const accountActions = readFileSync(resolve('app/[locale]/account/actions.ts'), 'utf8');

describe('an interrupted checkout can be finished', () => {
  it('keeps the ambiguous-failure promise reachable', () => {
    // `stripeFailureIsAmbiguous` deliberately keeps the pending order so the
    // retry can reuse it. `orders_cart_version_key` allows only one order per
    // cart version, so the retry has to find that order rather than insert a
    // second one and die on the constraint.
    expect(checkout).toContain('let resumed: OrderWithItems | null = await getOrderByCartVersion(');
    expect(checkout).toContain('if (resumed) {');
    expect(checkout).toContain('} else {\n      const orderId = await createPendingOrder(');
  });

  it('does not reserve stock twice for a resumed order', () => {
    expect(checkout).toContain('if (!resumed) {\n      const reserved = await reserveOrderStockStrict(');
  });

  it('replays Stripe with parameters it can actually match', () => {
    // Stripe refuses an idempotency key reused with different parameters, so
    // both the expiry and the quote have to be reconstructible.
    expect(checkout).toContain('Math.floor(order.createdAt.getTime() / 1000)');
    expect(checkout).toContain('expires_at: checkoutExpiresAtSeconds');
    expect(checkout).toContain('orderStillMatchesQuote(resumed, quote)');
    expect(checkout).toContain("fail('CART_REPRICED'");
  });

  it('finishes an interrupted invoice instead of answering 409 for a day', () => {
    expect(invoice).toContain("invoice.status === 'draft'");
    expect(invoice).toContain('await finishInvoice({');
    expect(invoice).toContain('linnevik_invoice_send_${input.orderId}');
  });
});

describe('a superseded attempt is retired, not left live', () => {
  it('expires the Stripe session before releasing its stock', () => {
    // Releasing the reservation while the session is still payable would sell
    // stock that is no longer reserved for it.
    const retire = checkout.slice(checkout.indexOf('async function retireAttempt'));
    expect(retire.indexOf('sessions.expire(')).toBeLessThan(retire.indexOf('abandonPendingOrder('));
  });

  it('never hands back a session priced without a newly entered code', () => {
    expect(checkout).toContain('const sameInputs = resumed.discountCode === requestedDiscountCode');
    expect(checkout).toContain("retireAttempt(resumed, 'Superseded by new checkout inputs')");
  });
});

describe('discount limits are settled against rivals, not just read', () => {
  it('counts pending orders as claims, not only recorded redemptions', () => {
    expect(operations).toContain("o.payment_status = 'pending'");
    expect(operations).toContain('claims.id < ${orderId}');
  });

  it('claims capacity once the claiming order exists', () => {
    expect(checkout).toContain('await claimDiscountCapacity({');
    expect(invoice).toContain('await claimDiscountCapacity({');
  });

  it('refuses a per-customer limit it cannot attribute to a customer', () => {
    // Card checkout only learns the buyer's e-mail from Stripe after payment,
    // so an anonymous buyer used to skip this limit entirely.
    expect(operations).toContain("throw new DiscountError('Sign in to use this discount code.', 'SIGN_IN_REQUIRED')");
  });
});

describe('identity is verified rather than trusted', () => {
  it('drops a Stripe customer id that no longer resolves', () => {
    expect(operations).toContain('export async function usableStripeCustomerId');
    expect(operations).toContain("(error as { code?: unknown }).code !== 'resource_missing'");
    expect(checkout).toContain('usableStripeCustomerId({');
    expect(invoice).toContain('usableStripeCustomerId({');
  });

  it('refuses card checkout for a deactivated account, as invoicing does', () => {
    expect(checkout).toContain("account.status !== 'active'");
  });
});

describe('one company-number rule across every entry point', () => {
  it('validates the account page with the same helpers as registration', () => {
    // While this page kept its own looser regex it saved numbers that invoice
    // checkout rejected, and it is the only form that can correct them. Both
    // now go through resolveCompanyProfile, which owns the one rule — for the
    // company name and the address as well as for the number.
    expect(accountActions).toContain('resolveCompanyProfile');
    expect(accountActions).not.toContain('EU_COMPANY_REGEX');
    expect(accountActions).not.toMatch(/\/\^\[A-Z\]\{2\}/);
  });
});
