import { notFound } from 'next/navigation';
import ClientDetail from '@/components/admin/ClientDetail';
import { getClient } from '@/lib/clientsDb';
import { listComments } from '@/lib/adminComments';
import { accentFor } from '../../nav';

export const dynamic = 'force-dynamic';

/** Kortet för ett företag. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getClient(id) : null;
  if (!data) notFound();
  const comments = await listComments('client', data.client.id);
  return <ClientDetail data={data} comments={comments} accent={accentFor('/admin/clients')} />;
}
