'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, formValues } from '@/components/admin/Fields';
import type { CustomerRow } from '@/lib/db/schema';

export default function CustomerManager({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const response = await fetch('/api/admin/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, status: 'active' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? 'Kunde inte skapa kunden.');
    event.currentTarget.reset();
    router.refresh();
  }
  return (
    <div className="grid gap-8">
      <form onSubmit={create} className="grid grid-cols-3 gap-4 max-[700px]:grid-cols-1">
        <Field label="E-post" name="email" type="email" required />
        <Field label="Förnamn" name="firstName" />
        <Field label="Efternamn" name="lastName" />
        <Field label="Företag" name="company" />
        <Field label="Telefon" name="phone" type="tel" />
        <Field label="Kundnummer" name="customerNo" />
        <Button type="submit">Skapa kund</Button>
      </form>
      <ErrorNote>{error}</ErrorNote>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-xs uppercase" style={{ color: 'var(--viz-ink-3)' }}>
            <tr><th className="py-2">Kund</th><th>E-post</th><th>Företag</th><th>Kundnr</th><th>Status</th></tr>
          </thead>
          <tbody>
            {customers.map(customer => (
              <tr key={customer.id} className="border-t" style={{ borderColor: 'var(--viz-rule)' }}>
                <td className="py-3">{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td>{customer.email}</td><td>{customer.company ?? '—'}</td>
                <td>{customer.customerNo ?? '—'}</td><td>{customer.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
