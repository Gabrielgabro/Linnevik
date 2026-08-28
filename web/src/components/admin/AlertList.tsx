'use client';

/**
 * Larmlistan. Varje rad är en händelse, inte en förekomst: spärren i
 * opsAlerts.ts skickar ett mejl per timme och nyckel, och listan visar den
 * senaste med en räknare för de övriga. En storm ska synas som en storm utan
 * att fylla sidan.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/admin/Fields';
import { Button, Tag } from '@/components/admin/ui';

export type AlertRow = {
  id: number;
  kind: string;
  subject: string;
  detail: Record<string, unknown>;
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
  occurrences: number;
};

const stamp = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Stockholm',
});

/** Vad varje larmtyp betyder, på svenska, för den som inte skrivit koden. */
const KIND_LABEL: Record<string, string> = {
  'webhook.failed': 'Stripe-webhook',
  'webhook.unmatched_session': 'Betalning utan order',
  'reconcile.failed': 'Avstämning',
  'order.stock_exception': 'Lager saknas',
  'order.dispute': 'Tvist',
  'order.amount_mismatch': 'Beloppsavvikelse',
  'order.refund_outside_admin': 'Återbetalning i Stripe',
  'order.credit_note_failed': 'Kreditnota saknas',
  'email.failed': 'E-post',
  'inventory.low_stock': 'Lågt lager',
};

/** Larm som betyder att pengar eller lager står fel just nu. */
const CRITICAL = new Set([
  'order.dispute',
  // En återbetald faktura utan kreditnota är en utställd handling som säger
  // fel belopp. Den rättas för hand i Stripe, och först då är den borta.
  'order.credit_note_failed',
  'order.stock_exception',
  'webhook.unmatched_session',
  'order.amount_mismatch',
]);

function detailText(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

function href(detail: Record<string, unknown>): string | null {
  const order = detail.order;
  return typeof order === 'number' || typeof order === 'string'
    ? `/admin/orders/${order}`
    : null;
}

export default function AlertList({ alerts }: { alerts: AlertRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acknowledge = async (id: number) => {
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/admin/alerts/${id}`, { method: 'PATCH' });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte kvittera larmet.');
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote>{error}</ErrorNote>
      <ul className="flex flex-col overflow-hidden rounded-card border border-rule bg-surface shadow-card">
        {alerts.map(alert => {
          const link = href(alert.detail);
          const done = Boolean(alert.acknowledgedAt);
          return (
            <li
              key={alert.id}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-grid px-4 py-3.5 last:border-b-0"
            >
              <span className="flex min-w-[240px] flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tag color={CRITICAL.has(alert.kind) ? 'var(--adm-danger)' : 'var(--adm-warn)'}>
                    {KIND_LABEL[alert.kind] ?? alert.kind}
                  </Tag>
                  <span className={done ? 'text-[14px] text-ink-3' : 'text-[14px] text-ink'}>
                    {alert.subject}
                  </span>
                  {alert.occurrences > 1 && (
                    <span className="font-mono text-[11px] text-ink-3">
                      ×{alert.occurrences}
                    </span>
                  )}
                </span>
                {detailText(alert.detail) && (
                  <span className="break-words font-mono text-[11.5px] text-ink-3">
                    {detailText(alert.detail)}
                  </span>
                )}
                <span className="font-mono text-[11px] text-ink-3">
                  {stamp.format(new Date(alert.createdAt))}
                  {/* Utan mejl är larmet bara en rad här — värt att se vilket. */}
                  {!alert.notifiedAt && ' · inget mejl skickat'}
                  {done &&
                    ` · kvitterad av ${alert.acknowledgedBy ?? 'okänd'} ${stamp.format(
                      new Date(alert.acknowledgedAt!)
                    )}`}
                </span>
              </span>

              <span className="ml-auto flex items-center gap-2">
                {link && (
                  <Link
                    href={link}
                    className="rounded-ctl px-2.5 py-1.5 text-[13px] text-ink-2 hover:bg-plane hover:text-ink"
                  >
                    Öppna ordern
                  </Link>
                )}
                {!done && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy === alert.id}
                    onClick={() => acknowledge(alert.id)}
                  >
                    {busy === alert.id ? 'Kvitterar…' : 'Kvittera'}
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
