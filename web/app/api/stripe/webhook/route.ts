/**
 * Stripes webhook. Det är här en order blir betald — aldrig på success-sidan,
 * som kunden kan stänga innan den laddats.
 *
 * Signaturen måste verifieras mot den råa kroppen, så den läses som text och
 * parsas aldrig av Next. Själva hanteringen ligger i stripeEvents.ts, som
 * nattens avstämning också använder (§17.2).
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { processStripeEvent } from '@/lib/stripeEvents';

export const runtime = 'nodejs';
// Kroppen får inte cachas eller förvandlas — signaturen räknas på byte-nivå.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    // Ogiltig signatur betyder att avsändaren inte är Stripe. 400 så att
    // Stripe inte försöker igen — det blir inte giltigt av att upprepas.
    console.error('[Stripe webhook] Signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  switch (await processStripeEvent(event)) {
    case 'processed':
      return NextResponse.json({ received: true });
    case 'duplicate':
      return NextResponse.json({ received: true, duplicate: true });
    case 'in_progress':
      // Ett annat anrop hanterar händelsen just nu. Ett 2xx här skulle få
      // Stripe att räkna händelsen som levererad även om det andra anropet
      // sedan faller, så Stripe får försöka igen senare.
      return NextResponse.json({ error: 'Event is being processed.' }, { status: 409 });
    case 'failed':
      // 500 gör att Stripe försöker igen. Skrivningarna är idempotenta, så ett
      // omtag är ofarligt och bättre än en tappad order.
      return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }
}
