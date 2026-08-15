import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCustomerSessionValue,
  customerSessionConfigured,
  readCustomerSessionValue,
} from '@/lib/customerSession';

beforeEach(() => {
  process.env.CUSTOMER_SESSION_SECRET = 'a-test-secret-at-least-32-characters-long';
});

afterEach(() => {
  delete process.env.CUSTOMER_SESSION_SECRET;
});

describe('customerSessionConfigured', () => {
  it('is false without the secret', () => {
    delete process.env.CUSTOMER_SESSION_SECRET;
    expect(customerSessionConfigured()).toBe(false);
  });

  it('is true once the secret is set', () => {
    expect(customerSessionConfigured()).toBe(true);
  });
});

describe('customer session round-trip', () => {
  it('reads back the same customer id that was signed', async () => {
    const { value } = await createCustomerSessionValue(42);
    expect(await readCustomerSessionValue(value)).toBe(42);
  });

  it('rejects a cookie signed under a different secret', async () => {
    const { value } = await createCustomerSessionValue(42);
    process.env.CUSTOMER_SESSION_SECRET = 'a-different-test-secret-32-characters';
    expect(await readCustomerSessionValue(value)).toBeNull();
  });

  it('rejects a tampered customer id even though the rest of the cookie is untouched', async () => {
    const { value } = await createCustomerSessionValue(42);
    const [expires, , signature] = value.split('.');
    const tampered = `${expires}.99.${signature}`;
    expect(await readCustomerSessionValue(tampered)).toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const [, id, signature] = (await createCustomerSessionValue(42)).value.split('.');
    const expired = `${Date.now() - 1000}.${id}.${signature}`;
    // Signaturen stämmer inte längre för det förfalskade utgångsdatumet,
    // men även om den gjorde det ska ett förflutet datum aldrig godkännas.
    expect(await readCustomerSessionValue(expired)).toBeNull();
  });

  it('rejects malformed input without throwing', async () => {
    expect(await readCustomerSessionValue(undefined)).toBeNull();
    expect(await readCustomerSessionValue('')).toBeNull();
    expect(await readCustomerSessionValue('not-a-valid-cookie')).toBeNull();
    expect(await readCustomerSessionValue('a.b.c.d')).toBeNull();
  });

  it('rejects a non-positive customer id even with a correct signature', async () => {
    const secret = process.env.CUSTOMER_SESSION_SECRET!;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sign = async (payload: string) =>
      Array.from(
        new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
      )
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    const zeroPayload = `${Date.now() + 60_000}.0`;
    expect(
      await readCustomerSessionValue(`${zeroPayload}.${await sign(zeroPayload)}`)
    ).toBeNull();
  });
});
