/**
 * Skyddsnätet under webhooken: läser om sena Stripe-sessioner och lagar
 * ordrar som blivit kvar i `pending` fast betalningen gick igenom.
 *
 * Går en gång per dygn (03:00) därför att Hobby-planen inte tillåter tätare
 * cron. Webhooken är fortfarande den vanliga vägen och landar på sekunder —
 * det här fångar bara det den missade, och gör det inom ett dygn i stället
 * för inom tio minuter. Blir det Pro-plan är schemat i vercel.json den enda
 * ändring som behövs; ingenting här inne antar ett intervall.
 *
 * Kan köras för hand om en betalning ser fast ut:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://linnevik.se/api/cron/commerce-reconcile
 */

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
