/**
 * Underlaget bokföringen behöver, som en fil.
 *
 * `bokföring/` är SIE-filer som förs för hand. Fram tills nu fanns ingen väg
 * ut ur systemet alls: varje order lästes av i /admin och knappades in, och
 * momsen räknades om av den som satt med den. Det är också där en
 * återbetalning gjord i Stripe — som förr aldrig nådde vår databas — blev dyr.
 *
 * Två filer, med flit skilda åt:
 *
 * - **Ordrar**: en rad per betald order, med det ordern faktiskt bär: netto,
 *   moms, frakt, rabatt, och hur momsen räknades (`vat_mode`, `vat_bps`).
 *   Satsen sparas per order sedan 0021 just för att en gammal order ska gå att
 *   stämma av även efter att VAT_PERCENT eller Stripe Tax-flaggan ändrats.
 * - **Återbetalningar**: en rad per återbetalning, med sin egen momsdel.
 *   Bokförs i den period de skedde, inte i orderns.
 *
 * Test-läge utesluts alltid. En order skapad med en testnyckel är inte en
 * affärshändelse, och den ska inte kunna hamna i en momsdeklaration.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/** RFC 4180: citat fördubblas, och fält med avgränsare eller radbryt citeras. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Semikolon, inte komma. Svensk Excel läser komma som decimaltecken och lägger
 * annars hela raden i en kolumn. Beloppen skrivs som kronor med decimalkomma
 * av samma skäl — filen ska gå att öppna, inte bara att parsa.
 */
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(';');
}

function kronor(minor: number | null | undefined): string {
  return ((Number(minor ?? 0)) / 100).toFixed(2).replace('.', ',');
}

function day(value: unknown): string {
  return value ? new Date(value as string).toISOString().slice(0, 10) : '';
}

export type ExportPeriod = { from: string; to: string };

/**
 * En rad per betald order i perioden.
 *
 * Perioden mäts på när ordern skapades. `updated_at` hade gjort att en gammal
 * order hoppade mellan perioder så fort någon rörde den.
 */
export async function ordersCsv(period: ExportPeriod): Promise<string> {
  const result = await getDb().execute(sql`
    select o.id, o.created_at, o.payment_status, o.status,
           o.customer_name, o.email, o.tax_id_value,
           o.subtotal_minor, o.discount_minor, o.shipping_minor,
           o.tax_minor, o.total_minor, o.refunded_minor, o.currency,
           o.vat_mode, o.vat_bps, o.stripe_payment_intent_id,
           o.billing_address ->> 'country' as billing_country
      from orders o
     where not o.test_mode
       and o.payment_status in ('paid', 'partially_refunded', 'refunded')
       and o.created_at >= ${period.from}::date
       and o.created_at < (${period.to}::date + interval '1 day')
     order by o.created_at asc, o.id asc
  `);

  const header = csvRow([
    'ordernr',
    'datum',
    'betalstatus',
    'kund',
    'epost',
    'momsnummer',
    'land',
    'netto_varor',
    'rabatt',
    'frakt',
    'moms',
    'totalt',
    'aterbetalat',
    'valuta',
    'momslage',
    'momssats_procent',
    'stripe_betalning',
  ]);

  const rows = (result.rows as Array<Record<string, unknown>>).map(row =>
    csvRow([
      row.id,
      day(row.created_at),
      row.payment_status,
      row.customer_name,
      row.email,
      row.tax_id_value,
      row.billing_country,
      kronor(row.subtotal_minor as number),
      kronor(row.discount_minor as number),
      kronor(row.shipping_minor as number),
      kronor(row.tax_minor as number),
      kronor(row.total_minor as number),
      kronor(row.refunded_minor as number),
      String(row.currency ?? '').toUpperCase(),
      row.vat_mode,
      // Sparad i hundradels procent: 2500 = 25 %.
      row.vat_bps === null || row.vat_bps === undefined
        ? ''
        : (Number(row.vat_bps) / 100).toFixed(2).replace('.', ','),
      row.stripe_payment_intent_id,
    ])
  );

  return [header, ...rows].join('\r\n');
}

/** En rad per återbetalning i perioden, med sin egen momsdel. */
export async function refundsCsv(period: ExportPeriod): Promise<string> {
  const result = await getDb().execute(sql`
    select r.id, r.created_at, r.order_id, r.amount_minor, r.tax_minor,
           r.currency, r.reason, r.status, r.actor, r.stripe_refund_id
      from refunds r
      join orders o on o.id = r.order_id
     where not o.test_mode
       and r.status in ('pending', 'succeeded')
       and r.created_at >= ${period.from}::date
       and r.created_at < (${period.to}::date + interval '1 day')
     order by r.created_at asc, r.id asc
  `);

  const header = csvRow([
    'aterbetalningsnr',
    'datum',
    'ordernr',
    'belopp',
    'varav_moms',
    'valuta',
    'orsak',
    'status',
    'gjord_av',
    'stripe_refund',
  ]);

  const rows = (result.rows as Array<Record<string, unknown>>).map(row =>
    csvRow([
      row.id,
      day(row.created_at),
      row.order_id,
      kronor(row.amount_minor as number),
      kronor(row.tax_minor as number),
      String(row.currency ?? '').toUpperCase(),
      row.reason,
      row.status,
      row.actor,
      row.stripe_refund_id,
    ])
  );

  return [header, ...rows].join('\r\n');
}

export type VatSummary = {
  orders: number;
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
  refundedMinor: number;
  refundedVatMinor: number;
};

/**
 * Summorna för perioden, som de ser ut i en momsdeklaration: utgående moms på
 * försäljningen minus den moms som vänts tillbaka genom återbetalningar.
 *
 * Visas i adminvyn ovanför nedladdningen, så att den som exporterar ser om
 * siffran är rimlig innan filen skickas vidare.
 */
export async function vatSummary(period: ExportPeriod): Promise<VatSummary> {
  const result = await getDb().execute(sql`
    with sales as (
      select count(*)::int as orders,
             coalesce(sum(o.total_minor - o.tax_minor), 0)::int as net_minor,
             coalesce(sum(o.tax_minor), 0)::int as vat_minor,
             coalesce(sum(o.total_minor), 0)::int as gross_minor
        from orders o
       where not o.test_mode
         and o.payment_status in ('paid', 'partially_refunded', 'refunded')
         and o.created_at >= ${period.from}::date
         and o.created_at < (${period.to}::date + interval '1 day')
    ), returns as (
      select coalesce(sum(r.amount_minor), 0)::int as refunded_minor,
             coalesce(sum(r.tax_minor), 0)::int as refunded_vat_minor
        from refunds r
        join orders o on o.id = r.order_id
       where not o.test_mode
         and r.status in ('pending', 'succeeded')
         and r.created_at >= ${period.from}::date
         and r.created_at < (${period.to}::date + interval '1 day')
    )
    select * from sales cross join returns
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    orders: Number(row.orders ?? 0),
    netMinor: Number(row.net_minor ?? 0),
    vatMinor: Number(row.vat_minor ?? 0),
    grossMinor: Number(row.gross_minor ?? 0),
    refundedMinor: Number(row.refunded_minor ?? 0),
    refundedVatMinor: Number(row.refunded_vat_minor ?? 0),
  };
}
