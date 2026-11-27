import { redirect } from 'next/navigation';

/** Kunder och Tvätterikunder är ett register sedan 0046: Företag. */
export default function Page() {
  redirect('/admin/clients/new');
}
