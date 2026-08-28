import PortalAccountTable from '@/components/admin/PortalAccountTable';
import { Notice, PageHeader, StatRow, StatTile } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { clientsConfigured, listPortalAccounts } from '@/lib/clientsDb';
import { accountOrigin } from '@/lib/portalAccounts';

export const dynamic = 'force-dynamic';

/**
 * Kunderna i inloggningsportalen — de personer som själva har skrivit in sig.
 * Företagen bakom dem ligger i tvätterikundregistret på /admin/clients; varje
 * rad här länkar dit, eftersom det är där kontot redigeras.
 */
export default async function AdminCustomersPage() {
  const accounts = await listPortalAccounts();

  const registered = accounts.filter(a => accountOrigin(a) === 'portal').length;
  const loggedIn = accounts.filter(a => a.lastLoginAt).length;

  return (
    <>
      <PageHeader
        kicker={`${accounts.length} konton · ${loggedIn} har loggat in`}
        title="Kunder"
        accent={accentFor('/admin/customers')}
        description="Konton i Linneviks inloggningsportal. Här ligger de som har skrivit in sig
          själva, tillsammans med de konton som uppstod i kassan eller följde med från Shopify."
      />

      <StatRow>
        <StatTile label="Konton totalt" value={accounts.length} accent="var(--adm-ok)" />
        <StatTile label="Registrerade i portalen" value={registered} accent="var(--viz-s1)" />
        <StatTile label="Har loggat in" value={loggedIn} accent="var(--adm-info)" />
      </StatRow>

      {!clientsConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Registret är tomt i den här miljön.
        </Notice>
      )}

      <PortalAccountTable accounts={accounts} />
    </>
  );
}
