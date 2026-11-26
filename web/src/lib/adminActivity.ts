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

import { and, desc, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { adminActivity, orderEvents } from '@/lib/db/schema';
import { ADMIN_USERS } from '@/lib/adminAuth';
import { orderEventLabel, orderStatusLabel } from '@/lib/adminLabels';
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
  | 'variant.price_changed'
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
  | 'comment.added'
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
  'variant.price_changed': 'Ändrade listpris',
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
  'sample_request.updated': 'Hanterade provbeställning',
  'comment.added': 'Skrev en kommentar',
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
  'variant.price_changed',
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

/**
 * Ändringar admin gör på en order skrivs i orderns historik (order_events).
 * Aktivitet visar dem också (§15.2), läst därifrån, så att varje ändring
 * skrivs en gång. Bankbetalningar, manuella fakturor och omskickade mejl har
 * redan en egen rad i loggen och räknas inte två gånger.
 */
const ORDER_CHANGE_KINDS = [
  'order.updated',
  'order.paused',
  'order.resumed',
  'order.closed',
  'order.note',
  'inventory.reserved_again',
  'refund.created',
  'fulfillment.created',
  'inventory.returned',
] as const;

/** Orderns historik sparar statusnycklar. Aktivitet visar dem på svenska (§15.4). */
function swedishOrderDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const names: Record<string, string> = { from: 'från', to: 'till', status: 'status', note: 'varför' };
  return Object.fromEntries(
    Object.entries(detail).map(([key, value]) => [
      names[key] ?? key,
      ['from', 'to', 'status'].includes(key) && typeof value === 'string' ? orderStatusLabel(value).toLowerCase() : value,
    ])
  );
}

export type ActivityEntry = {
  key: string;
  actor: string;
  action: string;
  label: string;
  detail: Record<string, unknown>;
  createdAt: Date;
  /** Platsen i admin där ändringen gjordes, när det finns en. */
  href: string | null;
};

/** Senaste händelserna, nyast först: adminloggen och admins ändringar på ordrar. */
export async function list(limit = 200): Promise<ActivityEntry[]> {
  if (!activityConfigured()) return [];
  const [logged, orderChanges] = await Promise.all([
    getDb()
      .select()
      .from(adminActivity)
      .orderBy(desc(adminActivity.createdAt), desc(adminActivity.id))
      .limit(limit),
    getDb()
      .select()
      .from(orderEvents)
      .where(and(inArray(orderEvents.kind, [...ORDER_CHANGE_KINDS]), inArray(orderEvents.actor, [...ADMIN_USERS])))
      .orderBy(desc(orderEvents.createdAt), desc(orderEvents.id))
      .limit(limit),
  ]);

  const entries: ActivityEntry[] = [
    ...logged.map(row => ({
      key: `a${row.id}`,
      actor: row.actor,
      action: row.action,
      label: actionLabel(row.action),
      detail: row.detail,
      createdAt: row.createdAt,
      href: null,
    })),
    ...orderChanges.map(row => ({
      key: `o${row.id}`,
      actor: row.actor,
      action: row.kind,
      label: `Order #${row.orderId}: ${orderEventLabel(row.kind).toLowerCase()}`,
      detail: swedishOrderDetail((row.detail ?? {}) as Record<string, unknown>),
      createdAt: row.createdAt,
      href: `/admin/orders/${row.orderId}`,
    })),
  ];
  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

/**
 * Sidorna ett listpris kan ändras från (§4.15): produkten, eller prisanalysen
 * för egna produkter eller för Franzén. Alla skriver samma fält.
 */
export const PRICE_SOURCES = ['Produkt', 'Prisbild', 'Franzén'] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export function parsePriceSource(value: unknown): PriceSource {
  return (PRICE_SOURCES as readonly unknown[]).includes(value) ? (value as PriceSource) : 'Produkt';
}

const kr = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');

/** En ändring av listpriset: vem, när, gammalt och nytt pris och från vilken sida. */
export async function recordPriceChange(
  actor: string,
  change: { variantId: number; sku: string; beforeMinor: number; afterMinor: number; source: PriceSource }
): Promise<void> {
  await record(actor, 'variant.price_changed', String(change.variantId), {
    sku: change.sku,
    före: kr(change.beforeMinor),
    efter: kr(change.afterMinor),
    sida: change.source,
  });
}
