import { NextResponse } from 'next/server';
import { CartError } from '@/lib/cartDb';
import { CartRuleError } from '@/lib/cartRules';
import { ownedCommerceEnabled } from '@/lib/commerceConfig';

export function requireOwnedCommerce(): NextResponse | null {
  if (ownedCommerceEnabled()) return null;
  return NextResponse.json({ error: 'Owned commerce is not enabled.' }, { status: 503 });
}

export function cartApiError(error: unknown): NextResponse {
  if (error instanceof CartError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof CartRuleError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  console.error('[Owned cart]', error);
  return NextResponse.json({ error: 'Korgen kunde inte uppdateras.' }, { status: 500 });
}

export function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new CartError(`${field} är ogiltigt.`);
  return parsed;
}

export function cartId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new CartError('Korg-id är ogiltigt.');
  }
  return value;
}
