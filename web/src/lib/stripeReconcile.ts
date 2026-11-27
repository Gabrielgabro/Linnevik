/**
 * Nattens avstämning mot Stripe utöver kortbetalningarna (source_of_truth
 * §17.1, §17.2, A7):
 *
 * - Händelser vars hantering fastnade halvvägs hämtas från Stripe och
 *   hanteras igen. Ett besked blir aldrig liggande.
 * - Återbetalningar och tvister läses om från Stripe. Missade webhooken en
 *   återbetalning gjord i Stripes kontrollpanel, eller en tvist, kommer den
 *   in här inom ett dygn.
 *
 * Allt här är idempotent: det som redan är känt ändras inte och larmar inte
 * igen.
 */

import { getStripe } from '@/lib/stripe';
import { processStripeEvent } from '@/lib/stripeEvents';
import { stuckStripeEvents } from '@/lib/stripeWebhookDb';
import { syncStripeDispute, syncStripeRefund } from '@/lib/stripeRefunds';

/** En återbetalning kan byta status några dagar efter att den skapades. */
const REFUND_WINDOW_DAYS = 7;
/** En tvist kan öppnas och avgöras månader efter betalningen. */
const DISPUTE_WINDOW_DAYS = 120;

const since = (days: number) => Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function retryStuckStripeEvents(): Promise<{ retried: number; failures: string[] }> {
  const failures: string[] = [];
  let retried = 0;
  for (const stuck of await stuckStripeEvents()) {
    try {
      // Händelsen hämtas från Stripe. Vi sparar inte kroppen, och Stripes
      // version är den som är signerad.
      const event = await getStripe().events.retrieve(stuck.eventId);
      const outcome = await processStripeEvent(event);
      if (outcome === 'processed') retried += 1;
      else if (outcome === 'failed') failures.push(`${stuck.eventId}: hanteringen föll igen`);
    } catch (error) {
      failures.push(`${stuck.eventId} (${stuck.eventType}): ${message(error)}`);
    }
  }
  return { retried, failures };
}

export async function reconcileRefundsAndDisputes(): Promise<{
  refunds: number;
  disputes: number;
  failures: string[];
}> {
  const failures: string[] = [];
  let refunds = 0;
  let disputes = 0;

  try {
    for await (const refund of getStripe().refunds.list({ created: { gte: since(REFUND_WINDOW_DAYS) }, limit: 100 })) {
      try {
        await syncStripeRefund(refund, { source: 'reconcile' });
        refunds += 1;
      } catch (error) {
        failures.push(`${refund.id}: ${message(error)}`);
      }
    }
  } catch (error) {
    failures.push(`refunds.list: ${message(error)}`);
  }

  try {
    for await (const dispute of getStripe().disputes.list({ created: { gte: since(DISPUTE_WINDOW_DAYS) }, limit: 100 })) {
      try {
        await syncStripeDispute(dispute, { source: 'reconcile' });
        disputes += 1;
      } catch (error) {
        failures.push(`${dispute.id}: ${message(error)}`);
      }
    }
  } catch (error) {
    failures.push(`disputes.list: ${message(error)}`);
  }

  return { refunds, disputes, failures };
}
