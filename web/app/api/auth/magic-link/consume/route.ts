import { NextRequest, NextResponse } from 'next/server';
import { claimMagicLinkToken } from '@/lib/magicLink';
import {
  createCustomerSessionValue,
  customerSessionCookieOptions,
  CUSTOMER_SESSION_COOKIE,
} from '@/lib/customerSession';

export const runtime = 'nodejs';

/**
 * Löser in en inloggningstoken. Anropas bara av ett explicit klick på
 * VerifyClient.tsx — aldrig av sidladdningen (GET) som visar knappen. Se
 * lib/magicLink.ts för varför den uppdelningen finns.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!token) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const result = await claimMagicLinkToken(token);
  if (result.status !== 'ok') {
    return NextResponse.json({ error: result.status }, { status: 400 });
  }

  const session = await createCustomerSessionValue(result.customerId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, session.value, {
    ...customerSessionCookieOptions,
    maxAge: session.maxAge,
  });
  return response;
}
