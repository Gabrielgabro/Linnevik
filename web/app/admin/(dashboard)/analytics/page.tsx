import { Notice, PageHeader } from '@/components/admin/ui';
import VisitorAnalytics from '@/components/admin/VisitorAnalytics';
import { analyticsConfigured, RETENTION_DAYS } from '@/lib/analyticsDb';
import { accentFor } from '../nav';

export const dynamic = 'force-dynamic';

export default function AdminAnalyticsPage() {
  const accent = accentFor('/admin/analytics');

  return (
    <>
      <PageHeader
        kicker="Publik"
        title="Besökare"
        accent={accent}
        description={`Förstapartsstatistik från butiken: bara besök där personen tackat ja till analyskakor, och bara sådant webbläsaren och Vercels edge redan vet. Ingen IP-adress sparas, platsen är grov till stadsnivå och tiderna är svensk tid. Händelser äldre än ${RETENTION_DAYS} dagar gallras av dygnskörningen.`}
      />

      {!analyticsConfigured() ? (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Inga besök registreras i den här miljön.
        </Notice>
      ) : (
        <VisitorAnalytics accent={accent} />
      )}
    </>
  );
}
