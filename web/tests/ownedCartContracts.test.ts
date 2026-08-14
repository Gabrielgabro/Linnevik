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
    expect(ordersDb).toContain("and status <> 'paid'");
  });

  it('uses Stripe idempotency and never trusts a browser-supplied amount', () => {
    expect(checkout).toContain('idempotencyKey:');
    expect(checkout).not.toMatch(/body\.(amount|price|unitAmount)/);
  });
});
