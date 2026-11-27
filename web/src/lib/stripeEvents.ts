/**
 * Hanteringen av en Stripe-händelse, delad av webhooken och nattens
 * avstämning (source_of_truth §17.1, §17.2).
 *
 * Webhooken är den vanliga vägen. Avstämningen tar upp de händelser vars
 * hantering fastnade halvvägs, så att ingen blir liggande.
 */

import type Stripe from 'stripe';
import { markOrderFailed } from '@/lib/ordersDb';
import { sendOrderConfirmation } from '@/lib/orderEmails';
import { raiseAlert } from '@/lib/opsAlerts';
import { claimStripeEvent, completeStripeEvent, releaseStripeEvent } from '@/lib/stripeWebhookDb';
import { applyCheckoutSession, reconcileCheckoutSessionReference } from '@/lib/stripeCheckout';
import { syncRefundsForCharge, syncStripeDispute, syncStripeRefund } from '@/lib/stripeRefunds';

/**
 * Gör det händelsen säger. Varje skrivning är idempotent, så samma händelse
 * kan hanteras igen utan att något blir dubbelt. Returnerar sessionen som
 * ska få en orderbekräftelse, om ordern just blev betald.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<{ confirmationFor: string | null }> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      // Kortbetalningar är klara direkt, men t.ex. banköverföring landar som
      // 'unpaid' här och bekräftas först i async_payment_succeeded.
      if (session.payment_status === 'unpaid') break;
      const result = await applyCheckoutSession(session);
      return { confirmationFor: result.newlyPaid ? session.id : null };
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

    // Fakturorna är våra egna sedan 0047 och syns aldrig i Stripe. En
    // faktura är betald när admin har registrerat bankbetalningen (§17.1).

    default:
      break;
  }
  return { confirmationFor: null };
}

export type ProcessOutcome = 'processed' | 'duplicate' | 'in_progress' | 'failed';

/**
 * Tar anspråk på händelsen, hanterar den och kvitterar den. Faller
 * hanteringen släpps anspråket, så att nästa försök från Stripe tar den, och
 * admin får ett driftlarm.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<ProcessOutcome> {
  const claim = await claimStripeEvent(event.id, event.type);
  if (claim === 'processed') return 'duplicate';
  if (claim === 'in_progress') return 'in_progress';

  let confirmationFor: string | null = null;
  try {
    ({ confirmationFor } = await handleStripeEvent(event));
  } catch (error) {
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
    return 'failed';
  }

  await completeStripeEvent(event.id);

  // Först här, när händelsen är kvitterad. Skulle mejlet skickas innan
  // skulle ett SMTP-fel göra om händelsen, och kunden riskera en andra
  // bekräftelse på samma order. sendOrderConfirmation kastar inte, men
  // await:as ändå: serverless-funktionen kan frysas så fort svaret gått ut.
  if (confirmationFor) await sendOrderConfirmation(confirmationFor);
  return 'processed';
}
