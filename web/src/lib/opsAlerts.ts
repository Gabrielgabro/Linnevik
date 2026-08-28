/**
 * Driftlarm.
 *
 * Före den här filen slutade varje allvarligt fel i ett `console.error`. På
 * Vercel betyder det en rad ingen läser: en fälld webhook, en betald order som
 * inte kunde reservera lager, en tvist hos Stripe, en orderbekräftelse som
 * aldrig gick fram. Felen var upptäckta av koden och osynliga för oss.
 *
 * Två regler styr utformningen:
 *
 * 1. **Larmet får aldrig fälla det som larmar.** Allt här inne sväljer sina
 *    egna fel. Ett trasigt SMTP eller en otillgänglig databas ska inte kunna
 *    förvandla en hanterad avvikelse till ett 500 som Stripe försöker om.
 * 2. **En storm är inget larm.** Samma `dedupeKey` mejlas högst en gång per
 *    fönster. Varje förekomst skrivs ändå till `ops_alerts`, så räknaren i
 *    adminvyn är sann även när mejlen hölls tillbaka.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { escapeHtml, mailConfigured, mailFrom, mailTo, sendEmail } from '@/lib/mailer';

export type AlertKind =
  | 'webhook.failed'
  | 'webhook.unmatched_session'
  | 'reconcile.failed'
  | 'order.stock_exception'
  | 'order.dispute'
  | 'order.amount_mismatch'
  | 'order.refund_outside_admin'
  | 'order.credit_note_failed'
  | 'email.failed'
  | 'inventory.low_stock';

/** Hur länge samma nyckel tystas efter ett utskickat mejl. */
const DEDUPE_MINUTES = 60;

export type AlertInput = {
  kind: AlertKind;
  /**
   * Vad larmet handlar om — typiskt `order:412` eller `session:cs_test_x`.
   * Två larm med samma nyckel är samma sak som hänt igen, inte två saker.
   */
  key: string;
  subject: string;
  detail?: Record<string, unknown>;
  /** Länk in i adminvyn, när det finns något att titta på. */
  href?: string;
};

function recipient(): string | null {
  return process.env.OPS_ALERT_TO ?? mailTo();
}

function alertsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function body(input: AlertInput): string {
  const rows = Object.entries(input.detail ?? {})
    .map(
      ([key, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap">${escapeHtml(key)}</td>` +
        `<td style="padding:4px 0"><code>${escapeHtml(
          typeof value === 'string' ? value : JSON.stringify(value)
        )}</code></td></tr>`
    )
    .join('');

  return `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:640px">
      <p style="color:#6b7280;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px">
        Driftlarm · ${escapeHtml(input.kind)}
      </p>
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">${escapeHtml(input.subject)}</h2>
      ${rows ? `<table style="font-size:13px;border-collapse:collapse">${rows}</table>` : ''}
      ${
        input.href
          ? `<p style="margin:20px 0 0"><a href="${escapeHtml(input.href)}">Öppna i /admin</a></p>`
          : ''
      }
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        Skickas en gång per ${DEDUPE_MINUTES} minuter per händelse. Fler förekomster
        loggas utan mejl och syns under Driftlarm i /admin.
      </p>
    </div>
  `;
}

/**
 * Skriver larmet och mejlar det om spärren tillåter.
 *
 * Insert och spärrbeslut sker i samma sats: två samtidiga larm med samma
 * nyckel — två webhook-omtag i parallell, till exempel — får annars båda se
 * ett tomt fönster och båda mejla.
 */
export async function raiseAlert(input: AlertInput): Promise<void> {
  if (!alertsConfigured()) {
    console.error(`[ops] ${input.kind} ${input.key}: ${input.subject}`, input.detail ?? {});
    return;
  }

  let shouldNotify = false;
  try {
    const result = await getDb().execute(sql`
      with window_check as (
        select not exists (
          select 1 from ops_alerts
          where dedupe_key = ${input.key}
            and notified_at is not null
            and created_at > now() - make_interval(mins => ${DEDUPE_MINUTES})
        ) as fresh
      ), inserted as (
        insert into ops_alerts (kind, dedupe_key, subject, detail, notified_at)
        select ${input.kind}, ${input.key}, ${input.subject},
               ${JSON.stringify(input.detail ?? {})}::jsonb,
               case when window_check.fresh then now() else null end
        from window_check
        returning id, notified_at
      )
      select id, notified_at is not null as notify from inserted
    `);
    shouldNotify = (result.rows[0] as { notify?: boolean } | undefined)?.notify === true;
  } catch (error) {
    // Databasen är nere eller tabellen saknas. Larmet är fortfarande värt att
    // skicka, så vi mejlar utan spärr hellre än att tappa det helt.
    console.error('[ops] Kunde inte skriva larmet:', error);
    shouldNotify = true;
  }

  // Konsolen behåller sin rad oavsett. Den är kvar när mejlet inte gick fram.
  console.error(`[ops] ${input.kind} ${input.key}: ${input.subject}`, input.detail ?? {});

  if (!shouldNotify) return;
  const to = recipient();
  if (!to || !mailConfigured()) return;

  try {
    const sent = await sendEmail({
      to,
      subject: `[Linnevik drift] ${input.subject}`,
      html: body(input),
      replyTo: mailFrom(),
    });
    if (!sent.success) {
      console.error('[ops] Larmmejlet gick inte fram:', sent.error);
    }
  } catch (error) {
    console.error('[ops] Larmmejlet kastade:', error);
  }
}

export type OpsAlertListRow = {
  id: number;
  kind: string;
  subject: string;
  detail: Record<string, unknown>;
  notifiedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  createdAt: Date;
  /** Hur många gånger samma sak larmats, inklusive de som spärren tystade. */
  occurrences: number;
};

/**
 * De senaste larmen, ett per nyckel. Spärren gör att en återkommande händelse
 * har många rader men bara ett mejl; listan visar den senaste och räknar de
 * övriga, så att en storm syns som en storm utan att fylla vyn.
 */
export async function listOpsAlerts(limit = 50): Promise<OpsAlertListRow[]> {
  if (!alertsConfigured()) return [];
  const result = await getDb().execute(sql`
    select distinct on (dedupe_key)
           id, kind, subject, detail, notified_at, acknowledged_at, acknowledged_by, created_at,
           count(*) over (partition by dedupe_key)::int as occurrences
      from ops_alerts
     order by dedupe_key, created_at desc
  `);
  return (result.rows as Array<Record<string, unknown>>)
    .map(row => ({
      id: Number(row.id),
      kind: String(row.kind),
      subject: String(row.subject),
      detail: (row.detail ?? {}) as Record<string, unknown>,
      notifiedAt: row.notified_at ? new Date(row.notified_at as string) : null,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at as string) : null,
      acknowledgedBy: (row.acknowledged_by as string | null) ?? null,
      createdAt: new Date(row.created_at as string),
      occurrences: Number(row.occurrences),
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Siffrorna överst på larmsidan. Räknas i databasen och inte i vyn: "det
 * senaste dygnet" mätt med `Date.now()` under render är inte en ren funktion,
 * och `now()` i satsen är dessutom rätt tidszon per definition.
 */
export async function alertSummary(): Promise<{ open: number; last24h: number; total: number }> {
  if (!alertsConfigured()) return { open: 0, last24h: 0, total: 0 };
  const result = await getDb().execute(sql`
    select count(*) filter (where acknowledged_at is null)::int as open,
           count(*) filter (where created_at > now() - interval '24 hours')::int as last24h,
           count(*)::int as total
      from ops_alerts
  `);
  const row = result.rows[0] as { open?: number; last24h?: number; total?: number } | undefined;
  return {
    open: Number(row?.open ?? 0),
    last24h: Number(row?.last24h ?? 0),
    total: Number(row?.total ?? 0),
  };
}

export async function countOpenAlerts(): Promise<number> {
  if (!alertsConfigured()) return 0;
  const result = await getDb().execute(sql`
    select count(*)::int as n from ops_alerts where acknowledged_at is null
  `);
  return Number((result.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

/**
 * Kvitterar alla larm med samma nyckel som det angivna. Kvitteringen gäller
 * händelsen, inte raden — annars hade en storm behövt kvitteras rad för rad.
 */
export async function acknowledgeAlert(id: number, actor: string): Promise<boolean> {
  const result = await getDb().execute(sql`
    update ops_alerts set acknowledged_at = now(), acknowledged_by = ${actor}
    where acknowledged_at is null
      and dedupe_key = (select dedupe_key from ops_alerts where id = ${id})
    returning id
  `);
  return result.rows.length > 0;
}
