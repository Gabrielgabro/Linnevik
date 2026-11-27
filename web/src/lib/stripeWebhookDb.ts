/**
 * Anspråk på Stripe-händelser (source_of_truth §17.2).
 *
 * Samma besked från Stripe hanteras en gång. Ett besked som fastnade
 * halvvägs, till exempel när funktionen fick timeout, tas upp igen: ett
 * anspråk äldre än `STALE_CLAIM_MINUTES` räknas som övergivet. Förr stod
 * sådana rader kvar som "processing" för alltid, och varje nytt försök
 * besvarades med "duplicate".
 */

import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema';

/** Längre än en funktion får köra (300 s), med marginal. */
export const STALE_CLAIM_MINUTES = 10;

export type EventClaim =
  /** Vår tur att hantera händelsen. */
  | 'claimed'
  /** Redan hanterad. */
  | 'processed'
  /** Någon annan hanterar den just nu. */
  | 'in_progress';

export async function claimStripeEvent(eventId: string, eventType: string): Promise<EventClaim> {
  // En sats, så att två samtidiga försök inte båda kan ta över samma
  // övergivna anspråk.
  const claimed = await getDb().execute(sql`
    insert into stripe_webhook_events (event_id, event_type)
    values (${eventId}, ${eventType})
    on conflict (event_id) do update set
      claimed_at = now(),
      attempts = stripe_webhook_events.attempts + 1
    where stripe_webhook_events.status = 'processing'
      and stripe_webhook_events.claimed_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})
    returning event_id
  `);
  if (claimed.rows.length > 0) return 'claimed';

  const [row] = await getDb()
    .select({ status: stripeWebhookEvents.status })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, eventId))
    .limit(1);
  return row?.status === 'processed' ? 'processed' : 'in_progress';
}

export async function completeStripeEvent(eventId: string): Promise<void> {
  await getDb()
    .update(stripeWebhookEvents)
    .set({ status: 'processed', processedAt: new Date() })
    .where(eq(stripeWebhookEvents.eventId, eventId));
}

export async function releaseStripeEvent(eventId: string): Promise<void> {
  await getDb().delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, eventId));
}

/** Händelser vars anspråk har övergivits, äldst först. */
export async function stuckStripeEvents(limit = 100): Promise<Array<{ eventId: string; eventType: string; attempts: number }>> {
  const result = await getDb().execute(sql`
    select event_id, event_type, attempts from stripe_webhook_events
    where status = 'processing'
      and claimed_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})
    order by claimed_at asc
    limit ${limit}
  `);
  return (result.rows as Array<{ event_id: string; event_type: string; attempts: number }>).map(row => ({
    eventId: row.event_id,
    eventType: row.event_type,
    attempts: Number(row.attempts),
  }));
}
