import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema';

export async function claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  const [row] = await getDb()
    .insert(stripeWebhookEvents)
    .values({ eventId, eventType })
    .onConflictDoNothing()
    .returning({ eventId: stripeWebhookEvents.eventId });
  return Boolean(row);
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
