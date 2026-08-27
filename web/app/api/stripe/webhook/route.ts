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
import { markOrderFailed } from '@/lib/ordersDb';
import { sendOrderConfirmation } from '@/lib/orderEmails';
import { raiseAlert } from '@/lib/opsAlerts';
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '@/lib/stripeWebhookDb';
import { applyCheckoutSession, reconcileCheckoutSessionReference } from '@/lib/stripeCheckout';
import { applyStripeInvoice, failStripeInvoice } from '@/lib/stripeInvoices';
import { syncRefundsForCharge, syncStripeDispute, syncStripeRefund } from '@/lib/stripeRefunds';

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

  // Sätts när ordern blivit betald, och används först efter att händelsen är
  // avklarad — mejlet får inte kunna fälla webhooken.
  let confirmationFor: string | null = null;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        // Kortbetalningar är klara direkt, men t.ex. banköverföring landar som
        // 'unpaid' här och bekräftas först i async_payment_succeeded.
        if (session.payment_status === 'unpaid') break;

        const result = await applyCheckoutSession(session);
        if (result.newlyPaid) confirmationFor = session.id;
        break;
      }

      // Återbetalningar kommer åt två håll. Startade i /admin finns raden
      // redan och det här är bara en statusändring. Startade i Stripes
      // kontrollpanel finns ingen rad alls — förr blev den händelsen tyst
      // ignorerad, och våra siffror gled ifrån Stripes.
      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed':
        await syncStripeRefund(event.data.object);
        break;

      // Äldre händelse som fortfarande skickas för en återbetalning gjord på
      // debiteringen. Bär en Charge, inte en Refund.
      case 'charge.refunded':
        await syncRefundsForCharge(event.data.object);
        break;

      // Tvist. Pengarna är redan innehållna av Stripe när det här kommer, och
      // tidsfristen för att svara med underlag är kort.
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
        await syncStripeDispute(event.data.object);
        break;

      case 'checkout.session.expired':
        await applyCheckoutSession(event.data.object);
        break;

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        if (await reconcileCheckoutSessionReference(session)) {
          await markOrderFailed(session.id, 'failed');
        }
        break;
      }

      // Stripe Invoicing is the pay-later checkout branch. A pending invoice
      // never unlocks fulfilment; only invoice.paid takes the same paid path
      // as a completed Checkout Session.
      case 'invoice.paid': {
        const result = await applyStripeInvoice(event.data.object);
        if (result.newlyPaid) confirmationFor = event.data.object.id;
        break;
      }

      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        await failStripeInvoice(event.data.object);
        break;

      default:
        break;
    }
  } catch (error) {
    // 500 gör att Stripe försöker igen. Skrivningarna är idempotenta, så ett
    // omtag är ofarligt och bättre än en tappad order.
    await releaseStripeEvent(event.id);
    // Stripe gör om försöket, och skrivningarna är idempotenta — men en
    // händelse som faller om och om igen är ingen som ser utan ett larm.
    await raiseAlert({
      kind: 'webhook.failed',
      key: `webhook:${event.id}`,
      subject: `Stripe-webhooken föll på ${event.type}`,
      detail: {
        event: event.type,
        eventId: event.id,
        fel: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  await completeStripeEvent(event.id);

  // Först här, när händelsen är kvitterad. Skulle mejlet skickas innanför
  // try-blocket ovan skulle ett SMTP-fel ge 500, Stripe skulle skicka om
  // händelsen, och kunden riskera en andra bekräftelse på samma order.
  // sendOrderConfirmation kastar inte, men await:as ändå: serverless-funktionen
  // kan frysas så fort svaret gått ut.
  if (confirmationFor) await sendOrderConfirmation(confirmationFor);

  return NextResponse.json({ received: true });
}
