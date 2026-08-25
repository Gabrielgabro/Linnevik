import { Download } from 'lucide-react';
import ExportPanel from '@/components/admin/ExportPanel';
import { Notice, PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { productsConfigured } from '@/lib/productsDb';

export const dynamic = 'force-dynamic';

/**
 * Filerna som tar sig ut ur systemet.
 *
 * Bokföringen förs för hand i SIE-filer, och fram tills nu knappades varje
 * order in därifrån genom att läsa av /admin. Det här är underlaget: ordrar
 * och återbetalningar per period, med momsen uppdelad, plus katalogen som en
 * läsbar kopia.
 */
export default async function AdminExportPage() {
  return (
    <>
      <PageHeader
        kicker="Underlag"
        title="Export"
        accent={accentFor('/admin/export')}
        description="Ordrar och återbetalningar per period för bokföringen, och katalogen som fil.
          Ordrar i testläge är alltid uteslutna — de är inga affärshändelser."
      />

      {!productsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Det finns inget att exportera i den här miljön.
        </Notice>
      )}

      <ExportPanel icon={<Download size={16} strokeWidth={1.75} aria-hidden />} />
    </>
  );
}
