import Link from 'next/link';
import ClientForm from '@/components/admin/ClientForm';
import { nextCustomerNo } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const suggestedCustomerNo = await nextCustomerNo();

  return (
    <>
      <header
        className="flex flex-col gap-[18px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <Link
          href="/admin/clients"
          className="font-mono text-[11px] uppercase tracking-[0.14em] hover:underline"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          ← Kundregister
        </Link>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(24px,3.5vw,34px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Lägg till kund
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
          Kontaktpersoner läggs till på kunden när den är sparad.
        </p>
      </header>

      <ClientForm mode="create" suggestedCustomerNo={suggestedCustomerNo} />
    </>
  );
}
