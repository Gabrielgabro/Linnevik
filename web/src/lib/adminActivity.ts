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
import { revalidateStorefront } from '@/lib/storefrontCache';

export type AdminAction =
  | 'admin.login'
  | 'admin.login_failed'
  | 'admin.login_blocked'
  | 'admin.logout'
  | 'suggestion.saved'
  | 'suggestion.removed'
  | 'suggestion.applied'
  | 'pricewatch.run'
  | 'client.created'
  | 'client.updated'
  | 'client.deleted'
  | 'clients.batch'
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'product.image_added'
  | 'product.image_removed'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  | 'collection.created'
  | 'collection.updated'
  | 'collection.deleted'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'discount.created'
  | 'discount.updated'
  | 'shipping.created'
  | 'shipping.updated'
  | 'sample_request.updated'
  | 'order.email_resent'
  | 'order.bank_payment_registered'
  | 'order.invoice_created'
  | 'alert.acknowledged'
  | 'export.downloaded'
  | 'pricing_config.updated';

/** Svenska etiketter för vyn. Nycklarna i databasen förblir stabila. */
export const ACTION_LABELS: Record<AdminAction, string> = {
  'admin.login': 'Loggade in',
  'admin.login_failed': 'Misslyckad inloggning',
  'admin.login_blocked': 'Spärrad efter för många försök',
  'admin.logout': 'Loggade ut',
  'suggestion.saved': 'Sparade prisförslag',
  'suggestion.removed': 'Tog bort prisförslag',
  'suggestion.applied': 'Satte pris från prisförslag',
  'pricewatch.run': 'Prisbot körde',
  'client.created': 'La till kund',
  'client.updated': 'Ändrade kund',
  'client.deleted': 'Tog bort kund',
  'clients.batch': 'Massåtgärd på kunder',
  'contact.created': 'La till kontaktperson',
  'contact.updated': 'Ändrade kontaktperson',
  'contact.deleted': 'Tog bort kontaktperson',
  'product.created': 'La till produkt',
  'product.updated': 'Ändrade produkt',
  'product.deleted': 'Tog bort produkt',
  'product.image_added': 'La till produktbild',
  'product.image_removed': 'Tog bort produktbild',
  'variant.created': 'La till variant',
  'variant.updated': 'Ändrade variant',
  'variant.deleted': 'Tog bort variant',
  'collection.created': 'La till kategori',
  'collection.updated': 'Ändrade kategori',
  'collection.deleted': 'Tog bort kategori',
  'customer.created': 'La till webbkonto på kund',
  'customer.updated': 'Ändrade webbkonto på kund',
  'customer.deleted': 'Tog bort webbkonto',
  'discount.created': 'La till rabattkod',
  'discount.updated': 'Ändrade rabattkod',
  'shipping.created': 'La till fraktregel',
  'shipping.updated': 'Ändrade fraktregel',
  'sample_request.updated': 'Hanterade provförfrågan',
  'order.email_resent': 'Skickade om ett ordermejl',
  'order.bank_payment_registered': 'Registrerade bankbetalning',
  'order.invoice_created': 'Skapade en faktura för hand',
  'alert.acknowledged': 'Kvitterade ett driftlarm',
  'export.downloaded': 'Laddade ner en export',
  'pricing_config.updated': 'Ändrade mängdrabatten',
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

/**
 * Handlingar som ändrar något besökarna ser i butiken: priser, texter, bilder,
 * kategorier och mängdrabatt. Rabattkoder och frakt finns med för säkerhets
 * skull, eftersom det är billigt att tömma cachen en gång för mycket.
 */
const STOREFRONT_ACTIONS: ReadonlySet<AdminAction> = new Set<AdminAction>([
  'product.created',
  'product.updated',
  'product.deleted',
  'product.image_added',
  'product.image_removed',
  'variant.created',
  'variant.updated',
  'variant.deleted',
  'collection.created',
  'collection.updated',
  'collection.deleted',
  'suggestion.applied',
  'pricing_config.updated',
  'discount.created',
  'discount.updated',
  'shipping.created',
  'shipping.updated',
]);

export async function record(
  actor: string,
  action: AdminAction,
  target?: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  // Varje ändring i butiken passerar här, så här töms också butikens cache.
  // Det görs före loggskrivningen och oberoende av den.
  if (STOREFRONT_ACTIONS.has(action)) revalidateStorefront();

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
