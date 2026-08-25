import { BellRing } from 'lucide-react';
import AlertList from '@/components/admin/AlertList';
import { EmptyState, Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { alertSummary, listOpsAlerts } from '@/lib/opsAlerts';
import { productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

/**
 * Driftlarmen. Allt som förr bara blev ett `console.error` på Vercel: en fälld
 * webhook, en betald order utan lagerreservation, en tvist, en bekräftelse som
 * inte gick fram.
 *
 * Sidan är medvetet trist. Den ska vara tom nästan jämt, och när den inte är
 * det ska det översta larmet räcka för att veta vad man ska göra.
 */
export default async function AdminAlertsPage() {
  const [alerts, summary] = await Promise.all([listOpsAlerts(), alertSummary()]);

  return (
    <>
      <PageHeader
        kicker={summary.open ? `${summary.open} okvitterade` : 'Inget okvitterat'}
        title="Driftlarm"
        accent={accentFor('/admin/alerts')}
        description="Fel som systemet upptäckt men inte kan lösa själv. Kvittera när du tagit
          hand om saken — kvitteringen gäller händelsen, inte den enskilda raden."
      />

      {!productsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Inga larm kan skrivas eller läsas i den här miljön.
        </Notice>
      )}

      <StatRow>
        <StatTile
          label="Okvitterade"
          value={summary.open}
          accent={summary.open ? 'var(--adm-danger)' : 'var(--adm-ok)'}
        />
        <StatTile label="Senaste dygnet" value={summary.last24h} accent="var(--adm-warn)" />
        <StatTile label="Händelser totalt" value={summary.total} accent="var(--viz-ink-3)" />
      </StatRow>

      {alerts.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Inga larm"
          description="Så här ska den här sidan se ut."
        />
      ) : (
        <AlertList alerts={alerts.map(alert => ({ ...alert,
          createdAt: alert.createdAt.toISOString(),
          acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
          notifiedAt: alert.notifiedAt?.toISOString() ?? null,
        }))} />
      )}
    </>
  );
}
