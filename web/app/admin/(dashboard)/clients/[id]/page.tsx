import Link from 'next/link';
import { notFound } from 'next/navigation';
import ClientForm from '@/components/admin/ClientForm';
import ContactList from '@/components/admin/ContactList';
import { getClient } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getClient(id) : null;
  if (!data) notFound();

  const { client, contacts } = data;

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
          className="max-w-[24ch] text-balance font-heading text-[clamp(24px,3.5vw,34px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          {client.name}
        </h1>
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Kundnr. {client.customerNo} · {client.status}
          {client.segment ? ` · ${client.segment}` : ''}
        </span>
        {client.nameTruncated && (
          <p
            className="border-l-2 pl-3 text-[13.5px]"
            style={{ color: 'var(--viz-ink-2)', borderColor: 'var(--viz-s2)' }}
          >
            Namnet kapades av 24-teckensfältet i arkivlistan. Skriv det fullständiga namnet
            och spara, så försvinner märkningen.
          </p>
        )}
      </header>

      <ClientForm mode="edit" client={client} />

      <ContactList clientId={client.id} contacts={contacts} />
    </>
  );
}
