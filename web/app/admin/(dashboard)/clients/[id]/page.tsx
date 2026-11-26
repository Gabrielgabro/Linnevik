import { notFound } from 'next/navigation';
import ClientDetail from '@/components/admin/ClientDetail';
import { getClient } from '@/lib/clientsDb';
import { accentFor } from '../../nav';

export const dynamic = 'force-dynamic';

/** Kortet för ett företag. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await getClient(id) : null;
  if (!data) notFound();
  return <ClientDetail data={data} accent={accentFor('/admin/clients')} />;
}
