import Link from 'next/link';
import { BellRing, FileWarning, PackageOpen, ShieldAlert, Truck } from 'lucide-react';
import { PageHeader, Panel, StatRow, StatTile, Tag } from '@/components/admin/ui';
import { accentFor } from './nav';
import { loadOverview, type OverviewOrder } from '@/lib/adminOverview';
import { orderStatusLabel } from '@/lib/adminLabels';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';

const day = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(date);

function OrderList({ orders, empty, extra }: {
  orders: OverviewOrder[];
  empty: string;
  extra?: (order: OverviewOrder) => React.ReactNode;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-ink-3">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-rule">
      {orders.map(order => (
        <li key={order.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <Link href={`/admin/orders/${order.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
            <span className="font-mono text-brand-text">#{order.id}</span>
            <span className="truncate text-ink">{order.customer ?? 'Okänd kund'}</span>
            {order.testMode && <Tag color="var(--adm-warn)">TEST</Tag>}
            {extra?.(order)}
          </Link>
          <span className="shrink-0 text-ink-3">
            {formatMinor(order.totalMinor, order.currency)} · {day(order.since)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Översikten (§15.3): det som väntar på någon. Ordrar att skicka,
 * lagerundantag och tvister, förfallna fakturor, nya provbeställningar och
 * öppna driftlarm. Prisanalysen som låg här förut finns under Priser.
 */
export default async function OverviewPage() {
  const accent = accentFor('/admin');
  const overview = await loadOverview();

  return (
    <>
      <PageHeader
        kicker="Översikt"
        title="Det som väntar"
        accent={accent}
        description="Allt här kräver att någon gör något. Varje rad leder till platsen där det görs."
      />

      <StatRow>
        <StatTile label="Att skicka" value={overview.toShip.total} icon={Truck} accent="var(--viz-s2)" />
        <StatTile
          label="Lager saknas eller tvist"
          value={overview.needsDecision.total}
          icon={ShieldAlert}
          accent={overview.needsDecision.total ? 'var(--adm-danger)' : 'var(--viz-ink-3)'}
        />
        <StatTile
          label="Förfallna fakturor"
          value={overview.overdueInvoices.total}
          icon={FileWarning}
          accent={overview.overdueInvoices.total ? 'var(--adm-warn)' : 'var(--viz-ink-3)'}
        />
        <StatTile label="Nya provbeställningar" value={overview.newSamples.total} icon={PackageOpen} accent="var(--viz-s3)" />
        <StatTile
          label="Öppna driftlarm"
          value={<Link href="/admin/alerts" className="hover:underline">{overview.openAlerts}</Link>}
          icon={BellRing}
          accent={overview.openAlerts ? 'var(--adm-danger)' : 'var(--viz-ink-3)'}
        />
      </StatRow>

      <Panel title="Ordrar att skicka" meta="Betalda och inte pausade, den som väntat längst först">
        <OrderList orders={overview.toShip.rows} empty="Inget att skicka." />
      </Panel>

      <Panel title="Lager saknas eller tvist" meta="Admin avgör och skriver en kommentar">
        <OrderList
          orders={overview.needsDecision.rows}
          empty="Inga lagerundantag eller tvister."
          extra={order => <Tag color="var(--adm-danger)">{orderStatusLabel(order.status)}</Tag>}
        />
      </Panel>

      <Panel title="Förfallna fakturor" meta="Registrera betalningen på ordern när pengarna har kommit in">
        {overview.overdueInvoices.total === 0 ? (
          <p className="text-sm text-ink-3">Inga förfallna fakturor.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {overview.overdueInvoices.rows.map(invoice => (
              <li key={invoice.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <Link href={`/admin/orders/${invoice.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <span className="font-mono text-brand-text">Faktura {invoice.invoiceNumber}</span>
                  <span className="truncate text-ink">{invoice.customer ?? 'Okänd kund'}</span>
                  {invoice.testMode && <Tag color="var(--adm-warn)">TEST</Tag>}
                </Link>
                <span className="shrink-0 text-ink-3">
                  {formatMinor(invoice.totalMinor, invoice.currency)} · förföll {invoice.dueOn}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Nya provbeställningar" meta="Äldst först">
        {overview.newSamples.total === 0 ? (
          <p className="text-sm text-ink-3">Inga nya provbeställningar.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {overview.newSamples.rows.map(sample => (
              <li key={sample.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <Link href={`/admin/prover/${sample.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <span className="font-mono text-brand-text">#{sample.id}</span>
                  <span className="truncate text-ink">{sample.company}</span>
                  <span className="truncate text-ink-3">{sample.contact}</span>
                </Link>
                <span className="shrink-0 text-ink-3">{day(sample.since)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
