import Link from 'next/link';
import { Plus } from 'lucide-react';
import ClientTable from '@/components/admin/ClientTable';
import { buttonClass, Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { clientsConfigured, listClients } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  // Bara ringlistan. Företag som köper av oss ligger under Kunder.
  const clients = await listClients('lead');

  const contacts = clients.reduce((sum, c) => sum + c.contactCount, 0);

  return (
    <>
      <PageHeader
        kicker={`${clients.length} företag · ${contacts} kontaktpersoner`}
        title="Tvätterikunder"
        accent={accentFor('/admin/clients')}
        description="Tvätteriets kunder att ringa: kontaktpersoner, säljarbete och nästa steg.
          När ett företag blir kund — eller registrerar sig och handlar — flyttar det till Kunder."
        actions={
          <Link href="/admin/clients/new" className={buttonClass('primary')}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            Lägg till tvätterikund
          </Link>
        }
      />

      <StatRow>
        <StatTile label="Företag" value={clients.length} accent="var(--viz-s1)" />
        <StatTile label="Kontaktpersoner" value={contacts} accent="var(--adm-info)" />
      </StatRow>

      {!clientsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Registret är tomt i den här miljön.
        </Notice>
      )}

      <ClientTable clients={clients} />
    </>
  );
}
