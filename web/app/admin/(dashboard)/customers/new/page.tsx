import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ClientForm from '@/components/admin/ClientForm';
import { PageHeader } from '@/components/admin/ui';
import { accentFor } from '../../nav';
import { nextCustomerNo } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function NewCustomerPage() {
  const suggestedCustomerNo = await nextCustomerNo();

  return (
    <>
      <PageHeader
        kicker={
          <Link href="/admin/customers" className="inline-flex items-center gap-1.5 hover:text-ink-2 hover:underline">
            <ArrowLeft size={13} strokeWidth={2} aria-hidden />
            Kunder
          </Link>
        }
        title="Lägg till kund"
        accent={accentFor('/admin/customers')}
        description="Ett företag som köper av oss. Organisationsnummer, fakturamejl och adress behövs för att kunna fakturera. Kontaktpersoner läggs till på kunden när den är sparad."
      />

      <ClientForm mode="create" suggestedCustomerNo={suggestedCustomerNo} kind="customer" />
    </>
  );
}
