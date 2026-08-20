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
  const commerceCustomers = clients.reduce((sum, c) => sum + c.commerceCustomerCount, 0);

  return (
    <>
      <PageHeader
        kicker={`${clients.length} företag · ${contacts} kontaktpersoner`}
        title="Kundregister"
        accent={accentFor('/admin/clients')}
        description="Alla företag samlade på ett ställe: kontaktpersoner, säljarbete, webbkonton
          och orderhistorik. Ett företag kan ha flera personer och webbkonton."
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
        <StatTile label="Webbkonton" value={commerceCustomers} accent="var(--adm-ok)" />
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
