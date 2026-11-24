import { notFound, redirect } from 'next/navigation';
import ClientDetail from '@/components/admin/ClientDetail';
import { getClient } from '@/lib/clientsDb';
import { CLIENT_KIND_HREF } from '@/lib/clients';
import { accentFor } from '../../nav';

export const dynamic = 'force-dynamic';

/** Kortet för ett företag i kundregistret. Ligger det i det andra registret skickas man dit. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getClient(id) : null;
  if (!data) notFound();
  if (data.client.kind !== 'customer') redirect(`${CLIENT_KIND_HREF[data.client.kind]}/${id}`);
  return <ClientDetail data={data} accent={accentFor(CLIENT_KIND_HREF.customer)} />;
}
