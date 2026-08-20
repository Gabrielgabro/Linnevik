import { redirect } from 'next/navigation';

/** Gamla bokmärken landar i det samlade kundregistret. */
export default function CustomersPage() {
  redirect('/admin/clients');
}
