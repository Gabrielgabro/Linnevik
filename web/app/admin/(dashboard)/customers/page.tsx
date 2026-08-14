import CustomerManager from '@/components/admin/CustomerManager';
import { PageHeader } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { listCustomers } from '@/lib/commerceOperations';

export const dynamic = 'force-dynamic';
export default async function CustomersPage() {
  const customers = await listCustomers();
  return (
    <>
      <PageHeader
        kicker={`${customers.length} kundposter`}
        title="Handelskunder"
        accent={accentFor('/admin/customers')}
        description="Kundposter skapas automatiskt från betalda Stripe-ordrar och kan också läggas
          upp manuellt."
      />
      <CustomerManager customers={customers} />
    </>
  );
}
