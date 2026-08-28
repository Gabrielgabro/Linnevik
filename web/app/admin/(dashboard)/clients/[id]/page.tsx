import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ClientForm from '@/components/admin/ClientForm';
import ContactList from '@/components/admin/ContactList';
import CommerceCustomerPanel from '@/components/admin/CommerceCustomerPanel';
import { Notice, PageHeader, StatusPill } from '@/components/admin/ui';
import { accentFor } from '../../nav';
import { getClient } from '@/lib/clientsDb';
import { clientAddressLines, clientInvoiceGap } from '@/lib/clients';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getClient(id) : null;
  if (!data) notFound();

  const { client, contacts, commerceCustomers, orders } = data;
  const addressLines = clientAddressLines(client);
  const invoiceGap = clientInvoiceGap(client);

  return (
    <>
      <PageHeader
        kicker={
          <Link
            href="/admin/clients"
            className="inline-flex items-center gap-1.5 hover:text-ink-2 hover:underline"
          >
            <ArrowLeft size={13} strokeWidth={2} aria-hidden />
            Tvätterikunder
          </Link>
        }
        title={client.name}
        accent={accentFor('/admin/clients')}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Kundnr. {client.customerNo}
              {client.segment ? ` · ${client.segment}` : ''}
            </span>
            <StatusPill status={client.status} />
            {addressLines.length > 0 && (
              <span className="text-[12px] text-ink-3">{addressLines.join(', ')}</span>
            )}
          </span>
        }
      />

      {invoiceGap && (
        <Notice tone="warn" title="Kunden kan inte faktureras än">
          {invoiceGap === 'orgNumber'
            ? 'Organisationsnumret saknas eller ser fel ut. Fakturor ställs ut på det numret, så kassan avvisar en fakturabeställning tills det är ifyllt.'
            : invoiceGap === 'address'
              ? 'Fakturaadressen är ofullständig. Gatuadress, postnummer och ort behövs alla tre.'
              : 'Adressen ligger utanför Sverige. Vi kan för närvarande bara fakturera svenska adresser.'}
        </Notice>
      )}

      {client.nameTruncated && (
        <Notice tone="warn" title="Namnet är kapat">
          Namnet kapades av 24-teckensfältet i arkivlistan. Skriv det fullständiga namnet och spara,
          så försvinner märkningen.
        </Notice>
      )}

      <ClientForm mode="edit" client={client} />

      <ContactList clientId={client.id} contacts={contacts} />

      <CommerceCustomerPanel
        clientId={client.id}
        customers={commerceCustomers}
        orders={orders}
      />
    </>
  );
}
