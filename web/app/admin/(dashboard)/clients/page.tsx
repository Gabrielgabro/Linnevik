import Link from 'next/link';
import { FilePlus2, Plus } from 'lucide-react';
import ClientTable from '@/components/admin/ClientTable';
import PortalAccountTable from '@/components/admin/PortalAccountTable';
import { buttonClass, Notice, PageHeader, Panel, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { clientsConfigured, listClients, listPortalAccounts } from '@/lib/clientsDb';
import { isLaundryClient } from '@/lib/clients';
import { formatMinor } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * Företagsregistret, ett enda (source_of_truth §11.4, §15.3). Taggen
 * Tvätterikund är ett filter här, inte en egen lista. Fakturor ställs ut till
 * vilket företag som helst, och webbkontona hör till företagen.
 */
export default async function AdminClientsPage() {
  const [clients, accounts] = await Promise.all([listClients(), listPortalAccounts()]);

  const contacts = clients.reduce((sum, c) => sum + c.contactCount, 0);
  const laundry = clients.filter(isLaundryClient).length;
  const unpaidCount = clients.reduce((sum, c) => sum + c.unpaidInvoiceCount, 0);
  const unpaidMinor = clients.reduce((sum, c) => sum + c.unpaidInvoiceMinor, 0);

  return (
    <>
      <PageHeader
        kicker={`${clients.length} företag · ${contacts} kontaktpersoner · ${accounts.length} webbkonton`}
        title="Företag"
        accent={accentFor('/admin/clients')}
        description="Alla företag: tvätteriets kunder att ringa och företagen som köper av oss. Kontaktpersoner, webbkonton och ordrar finns på varje företag."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/orders/ny-faktura" className={buttonClass('secondary')}>
              <FilePlus2 size={15} strokeWidth={2} aria-hidden />
              Ny faktura
            </Link>
            <Link href="/admin/clients/new" className={buttonClass('primary')}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Lägg till företag
            </Link>
          </div>
        }
      />

      <StatRow>
        <StatTile label="Företag" value={clients.length} accent="var(--viz-s1)" />
        <StatTile label="Tvätterikunder" value={laundry} accent="var(--viz-s4)" />
        <StatTile label="Kontaktpersoner" value={contacts} accent="var(--adm-info)" />
        <StatTile
          label="Obetalda fakturor"
          value={unpaidCount > 0 ? `${unpaidCount} · ${formatMinor(unpaidMinor)}` : 0}
          accent="var(--adm-warn)"
        />
      </StatRow>

      {!clientsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Registret är tomt i den här miljön.
        </Notice>
      )}

      <ClientTable clients={clients} />

      <Panel
        title="Webbkonton"
        meta="Personer som loggar in i portalen, kopplade till ett företag ovan"
        padded={false}
      >
        <PortalAccountTable accounts={accounts} />
      </Panel>
    </>
  );
}
