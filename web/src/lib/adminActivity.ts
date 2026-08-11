/**
 * Aktivitetsloggen för adminvyn.
 *
 * Skriver en rad per sak som händer: inloggningar (även misslyckade),
 * utloggningar, sparade prisförslag och botkörningar. Meningen är att den
 * som loggar in ska kunna se vad de andra har gjort sedan sist.
 *
 * `record` kastar aldrig. När den anropas har handlingen redan skett — kakan
 * är satt, förslaget är sparat — så ett misslyckat loggskrivande får inte
 * göra om ett lyckat anrop till ett fel och locka någon att försöka igen.
 * En förlorad rad loggas till konsolen i stället.
 */

import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { adminActivity, type AdminActivityRow } from '@/lib/db/schema';

export type AdminAction =
  | 'admin.login'
  | 'admin.login_failed'
  | 'admin.logout'
  | 'suggestion.saved'
  | 'pricewatch.run'
  | 'client.created'
  | 'client.updated'
  | 'client.deleted'
  | 'clients.batch'
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted';

/** Svenska etiketter för vyn. Nycklarna i databasen förblir stabila. */
export const ACTION_LABELS: Record<AdminAction, string> = {
  'admin.login': 'Loggade in',
  'admin.login_failed': 'Misslyckad inloggning',
  'admin.logout': 'Loggade ut',
  'suggestion.saved': 'Sparade prisförslag',
  'pricewatch.run': 'Prisbot körde',
  'client.created': 'La till kund',
  'client.updated': 'Ändrade kund',
  'client.deleted': 'Tog bort kund',
  'clients.batch': 'Massåtgärd på kunder',
  'contact.created': 'La till kontaktperson',
  'contact.updated': 'Ändrade kontaktperson',
  'contact.deleted': 'Tog bort kontaktperson',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action as AdminAction] ?? action;
}

/** Misslyckade inloggningar ska sticka ut i listan. */
export function isFlagged(action: string): boolean {
  return action === 'admin.login_failed';
}

export function activityConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function record(
  actor: string,
  action: AdminAction,
  target?: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  if (!activityConfigured()) return;
  try {
    await getDb()
      .insert(adminActivity)
      .values({ actor, action, target: target ?? null, detail });
  } catch (error) {
    console.error(`Kunde inte skriva aktivitetsrad (${action}):`, error);
  }
}

/** Senaste händelserna, nyast först. */
export async function list(limit = 200): Promise<AdminActivityRow[]> {
  if (!activityConfigured()) return [];
  return getDb()
    .select()
    .from(adminActivity)
    .orderBy(desc(adminActivity.createdAt), desc(adminActivity.id))
    .limit(limit);
}
