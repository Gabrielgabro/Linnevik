import Link from 'next/link';
import ClientTable from '@/components/admin/ClientTable';
import { clientsConfigured, listClients } from '@/lib/clientsDb';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const clients = await listClients();

  const contacts = clients.reduce((sum, c) => sum + c.contactCount, 0);
  const worked = clients.reduce((sum, c) => sum + c.workedCount, 0);
  const truncated = clients.filter(c => c.nameTruncated).length;

  return (
    <>
      <header
        className="flex flex-col gap-[18px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Kunder · {clients.length} företag · {contacts} kontaktpersoner · {worked} bearbetade
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Kundregister
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
          Företagen ur tvätteriets arkivlista, med kontaktpersonerna vi bearbetar dem genom.
          Ett företag kan ha flera personer — statusen sitter på personen.
        </p>
        <Link
          href="/admin/clients/new"
          className="self-start rounded-[3px] px-3.5 py-2 text-[13px] font-medium"
          style={{ background: 'var(--viz-ink)', color: 'var(--viz-surface)' }}
        >
          + Lägg till kund
        </Link>
      </header>

      {!clientsConfigured() && (
        <p
          className="border-l-2 pl-3 text-[13.5px]"
          style={{ color: 'var(--viz-ink-2)', borderColor: 'var(--viz-flag)' }}
        >
          DATABASE_URL saknas, så registret är tomt i den här miljön.
        </p>
      )}

      {truncated > 0 && (
        <p
          className="border-l-2 pl-3 text-[13.5px]"
          style={{ color: 'var(--viz-ink-2)', borderColor: 'var(--viz-s2)' }}
        >
          {truncated} kundnamn kapades av 24-teckensfältet i arkivlistan och behöver
          kompletteras. De är märkta <em>kapat namn</em> i listan; märkningen försvinner när
          namnet ändras.
        </p>
      )}

      <ClientTable clients={clients} />
    </>
  );
}
