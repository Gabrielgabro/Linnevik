import CustomerManager from '@/components/admin/CustomerManager';
import { listCustomers } from '@/lib/commerceOperations';

export const dynamic = 'force-dynamic';
export default async function CustomersPage() {
  const customers = await listCustomers();
  return (
    <>
      <header className="border-t-2 pt-5" style={{ borderColor: 'var(--viz-ink)' }}>
        <h1 className="font-heading text-4xl">Handelskunder</h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--viz-ink-2)' }}>
          Kundposter skapas automatiskt från betalda Stripe-ordrar och kan också läggas upp manuellt.
        </p>
      </header>
      <CustomerManager customers={customers} />
    </>
  );
}
