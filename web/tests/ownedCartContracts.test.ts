import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve('drizzle/0005_owned_carts.sql'), 'utf8');
const ordersDb = readFileSync(resolve('src/lib/ordersDb.ts'), 'utf8');
const checkout = readFileSync(resolve('app/api/checkout/route.ts'), 'utf8');

describe('owned checkout persistence contracts', () => {
  it('enforces one order per cart version in Postgres', () => {
    expect(migration).toContain('"orders_cart_version_key"');
    expect(migration).toContain('ON "orders" ("cart_id", "cart_version")');
  });

  it('freezes the order and its lines in one data-changing statement', () => {
    expect(ordersDb).toContain('with eligible_cart as');
    expect(ordersDb).toContain('), new_order as');
    expect(ordersDb).toContain('inserted_items as');
  });

  it('does not let late failure events overwrite a paid order', () => {
    expect(ordersDb).toContain("and payment_status = 'pending'");
  });

  it('uses Stripe idempotency and never trusts a browser-supplied amount', () => {
    expect(checkout).toContain('idempotencyKey:');
    expect(checkout).not.toMatch(/body\.(amount|price|unitAmount)/);
    expect(checkout).not.toContain('body.lines');
    expect(checkout).not.toContain('body.customerNo');
  });

  it('derives existing customer identity from the authenticated account', () => {
    expect(checkout).toContain('getCurrentCustomerFromCookies()');
    expect(checkout).toContain('customer: stripeCustomerId');
    expect(checkout).toContain('const customerNo = account?.customerNo ?? null');
    // A stored Stripe customer id is verified, never trusted: a dead one is a
    // hard error that would lock the account out of card checkout for good.
    expect(checkout).toContain('usableStripeCustomerId({');
    expect(checkout).toContain("account.status !== 'active'");
  });

  it('resumes or retires an interrupted attempt instead of duplicating it', () => {
    // `orders_cart_version_key` allows one order per cart version, so a retry
    // after an ambiguous Stripe failure has to find the order it left behind.
    expect(checkout).toContain('getOrderByCartVersion(');
    expect(checkout).toContain('orderStillMatchesQuote(resumed, quote)');
    expect(checkout).toContain('retireAttempt(');
    expect(checkout).toContain('checkout.sessions.expire(');
    // A replayed idempotency key needs byte-identical parameters, so the
    // session expiry comes off the order row and not the wall clock.
    expect(checkout).toContain('Math.floor(order.createdAt.getTime() / 1000)');
    expect(checkout).toContain('idempotencyKey: `linnevik_order_${orderId}`');
  });

  it('does not hand back a session priced without a newly entered code', () => {
    expect(checkout).toContain('const sameInputs = resumed.discountCode === requestedDiscountCode');
  });
});
