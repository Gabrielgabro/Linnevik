import Link from 'next/link';
import { Plus } from 'lucide-react';
import ClientTable from '@/components/admin/ClientTable';
import { buttonClass, Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { clientsConfigured, listClients } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const clients = await listClients();

  const contacts = clients.reduce((sum, c) => sum + c.contactCount, 0);
  const worked = clients.reduce((sum, c) => sum + c.workedCount, 0);

  return (
    <>
      <PageHeader
        kicker={`${clients.length} företag · ${contacts} kontaktpersoner`}
        title="Kundregister"
        accent={accentFor('/admin/clients')}
        description="Företagen ur tvätteriets arkivlista, med kontaktpersonerna vi bearbetar dem
          genom. Ett företag kan ha flera personer — statusen sitter på personen."
        actions={
          <Link href="/admin/clients/new" className={buttonClass('primary')}>
            <Plus size={16} strokeWidth={2} aria-hidden />
            Lägg till kund
          </Link>
        }
      />

      <StatRow>
        <StatTile label="Företag" value={clients.length} accent="var(--viz-s1)" />
        <StatTile label="Kontaktpersoner" value={contacts} accent="var(--adm-info)" />
        <StatTile
          label="Bearbetade"
          value={worked}
          accent="var(--adm-ok)"
          hint={contacts > 0 ? `${Math.round((worked / contacts) * 100)} % av kontakterna` : undefined}
        />
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
