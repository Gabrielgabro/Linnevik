/**
 * Det som väntar på någon (source_of_truth §15.3): startsidan i admin.
 *
 * Varje rad här är något en människa ska göra. Det som bara är bra att veta
 * hör hemma på sin egen sida.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export type OverviewOrder = {
  id: number;
  customer: string | null;
  totalMinor: number;
  currency: string;
  since: Date;
  status: string;
  testMode: boolean;
};

export type OverviewInvoice = OverviewOrder & { invoiceNumber: number; dueOn: string };

export type OverviewSample = { id: number; company: string; contact: string; since: Date };

/** De äldsta raderna, och hur många det är totalt. */
export type Waiting<T> = { rows: T[]; total: number };

export type Overview = {
  toShip: Waiting<OverviewOrder>;
  /** Lagerundantag och tvister: admin avgör (§8.6, §8.12). */
  needsDecision: Waiting<OverviewOrder>;
  overdueInvoices: Waiting<OverviewInvoice>;
  newSamples: Waiting<OverviewSample>;
  openAlerts: number;
};

const LIMIT = 25;

/** `total` kommer från `count(*) over ()` i varje fråga. */
function waiting<R, T>(rows: R[], map: (row: R) => T): Waiting<T> {
  const total = Number((rows[0] as { total?: number } | undefined)?.total ?? 0);
  return { rows: rows.map(map), total };
}

type OrderRow = {
  id: number;
  customer_name: string | null;
  email: string | null;
  total_minor: number;
  currency: string;
  since: string | Date;
  status: string;
  test_mode: boolean;
};

const toOrder = (row: OrderRow): OverviewOrder => ({
  id: Number(row.id),
  customer: row.customer_name ?? row.email,
  totalMinor: Number(row.total_minor),
  currency: row.currency,
  since: new Date(row.since),
  status: row.status,
  testMode: Boolean(row.test_mode),
});

export async function loadOverview(): Promise<Overview> {
  const db = getDb();
  const [toShip, needsDecision, overdue, samples, alerts] = await Promise.all([
    // Betalda, inte pausade, inte helt skickade. Samma villkor som spärren för
    // att skicka (§8.9). Äldst först: den som väntat längst skickas först.
    db.execute(sql`
      select id, customer_name, email, total_minor, currency, coalesce(paid_on::timestamptz, created_at) as since, status, test_mode, count(*) over () as total
      from orders
      where status = 'paid'
        and payment_status in ('paid', 'partially_refunded')
        and fulfillment_status in ('unfulfilled', 'partial')
      order by since asc, id asc
      limit ${LIMIT}
    `),
    db.execute(sql`
      select id, customer_name, email, total_minor, currency, updated_at as since, status, test_mode, count(*) over () as total
      from orders
      where status in ('stock_exception', 'disputed')
      order by updated_at asc, id asc
      limit ${LIMIT}
    `),
    // Förfallodagen räknas i svensk tid, som på fakturan (§9.7).
    db.execute(sql`
      select o.id, o.customer_name, o.email, o.total_minor, o.currency, o.created_at as since, o.status, o.test_mode,
             i.number as invoice_number, i.due_on, count(*) over () as total
      from orders o
      join invoices i on i.order_id = o.id and i.kind = 'invoice' and i.voided_at is null
      where o.payment_method = 'invoice'
        and o.payment_status = 'pending'
        and o.status not in ('cancelled', 'expired', 'failed')
        and i.due_on < (now() at time zone 'Europe/Stockholm')::date
      order by i.due_on asc, o.id asc
      limit ${LIMIT}
    `),
    db.execute(sql`
      select id, organization_name, contact_name, created_at, count(*) over () as total
      from sample_requests
      where status = 'new'
      order by created_at asc, id asc
      limit ${LIMIT}
    `),
    db.execute(sql`select count(*)::int as n from ops_alerts where acknowledged_at is null`),
  ]);

  return {
    toShip: waiting(toShip.rows as OrderRow[], toOrder),
    needsDecision: waiting(needsDecision.rows as OrderRow[], toOrder),
    overdueInvoices: waiting(overdue.rows as Array<OrderRow & { invoice_number: number; due_on: string | Date }>, row => ({
      ...toOrder(row),
      invoiceNumber: Number(row.invoice_number),
      dueOn:
        typeof row.due_on === 'string'
          ? row.due_on.slice(0, 10)
          : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(row.due_on),
    })),
    newSamples: waiting(samples.rows as Array<{ id: number; organization_name: string; contact_name: string; created_at: string | Date }>, row => ({
      id: Number(row.id),
      company: row.organization_name,
      contact: row.contact_name,
      since: new Date(row.created_at),
    })),
    openAlerts: Number((alerts.rows[0] as { n: number } | undefined)?.n ?? 0),
  };
}
