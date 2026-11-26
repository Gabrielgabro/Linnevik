import { redirect } from 'next/navigation';

/** Kunder och Tvätterikunder är ett register sedan 0046: Företag. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/admin/clients/${encodeURIComponent((await params).id)}`);
}
