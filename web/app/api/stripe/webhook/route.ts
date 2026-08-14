/**
 * Stripes webhook. Det är här en order blir betald — aldrig på success-sidan,
 * som kunden kan stänga innan den laddats.
 *
 * Signaturen måste verifieras mot den råa kroppen, så den läses som text och
 * parsas aldrig av Next.
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { markOrderFailed, markOrderPaid, updateRefundStatus } from '@/lib/ordersDb';
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '@/lib/stripeWebhookDb';

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

  const claimed = await claimStripeEvent(event.id, event.type);
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        // Kortbetalningar är klara direkt, men t.ex. banköverföring landar som
        // 'unpaid' här och bekräftas först i async_payment_succeeded.
        if (session.payment_status === 'unpaid') break;

        const details = session.customer_details;
        // Leveransadressen har bytt plats i nyare API-versioner. Endpointen är
        // inte låst till en version, så båda formerna läses — annars sparas
        // adressen tyst som null om Stripe levererar i en äldre form.
        const legacy = session as unknown as {
          shipping_details?: { name?: string | null; address?: Stripe.Address | null } | null;
        };
        const shipping =
          session.collected_information?.shipping_details ?? legacy.shipping_details ?? null;

        await markOrderPaid({
          sessionId: session.id,
          paymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
          email: details?.email ?? null,
          stripeCustomerId:
            typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
          phone: details?.phone ?? null,
          customerNo: session.metadata?.linnevik_customer_no ?? null,
          customerName: shipping?.name ?? details?.name ?? null,
          shippingAddress: shipping?.address
            ? {
                line1: shipping.address.line1 ?? null,
                line2: shipping.address.line2 ?? null,
                city: shipping.address.city ?? null,
                postal_code: shipping.address.postal_code ?? null,
                state: shipping.address.state ?? null,
                country: shipping.address.country ?? null,
              }
            : null,
          subtotalMinor: session.amount_subtotal ?? 0,
          discountMinor: session.total_details?.amount_discount ?? 0,
          shippingMinor: session.total_details?.amount_shipping ?? 0,
          taxMinor: session.total_details?.amount_tax ?? 0,
          totalMinor: session.amount_total ?? 0,
          currency: session.currency ?? 'sek',
        });
        break;
      }

      case 'refund.updated':
      case 'refund.failed':
        await updateRefundStatus(event.data.object.id, event.data.object.status ?? 'pending');
        break;

      case 'checkout.session.expired':
        await markOrderFailed(event.data.object.id, 'expired');
        break;

      case 'checkout.session.async_payment_failed':
        await markOrderFailed(event.data.object.id, 'failed');
        break;

      default:
        break;
    }
  } catch (error) {
    // 500 gör att Stripe försöker igen. Skrivningarna är idempotenta, så ett
    // omtag är ofarligt och bättre än en tappad order.
    console.error(`[Stripe webhook] Failed to handle ${event.type}:`, error);
    await releaseStripeEvent(event.id);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  await completeStripeEvent(event.id);
  return NextResponse.json({ received: true });
}
