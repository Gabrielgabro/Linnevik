import { NextRequest, NextResponse } from 'next/server';
import { stripeConfigured } from '@/lib/stripe';
import { reconcileRecentCheckoutSessions } from '@/lib/stripeCheckout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });
  }

  const result = await reconcileRecentCheckoutSessions();
  return NextResponse.json({ runAt: new Date().toISOString(), ...result }, {
    status: result.failures.length ? 207 : 200,
  });
}
