'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { ErrorNote, Field, formValues } from '@/components/admin/Fields';
import {
  Button,
  EmptyState,
  Panel,
  Tag,
  TableShell,
  Td,
  Th,
  Tr,
} from '@/components/admin/ui';
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
    <div className="grid gap-6">
      <Panel title="Ny kund" accent="var(--adm-warn)">
        <form onSubmit={create} className="grid grid-cols-3 gap-4 max-[700px]:grid-cols-1">
          <Field label="E-post" name="email" type="email" required />
          <Field label="Förnamn" name="firstName" />
          <Field label="Efternamn" name="lastName" />
          <Field label="Företag" name="company" />
          <Field label="Telefon" name="phone" type="tel" />
          <Field label="Kundnummer" name="customerNo" />
          <Button type="submit" className="self-end">
            <Plus size={16} strokeWidth={2} aria-hidden />
            Skapa kund
          </Button>
        </form>
        <ErrorNote>{error}</ErrorNote>
      </Panel>

      {customers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Inga kundposter ännu"
          description="Poster skapas automatiskt vid betald order, eller manuellt i formuläret ovan."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Kund</Th>
              <Th>E-post</Th>
              <Th>Företag</Th>
              <Th>Kundnr</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map(customer => (
              <Tr key={customer.id}>
                <Td className="text-ink">
                  {[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '—'}
                </Td>
                <Td>{customer.email}</Td>
                <Td>{customer.company ?? '—'}</Td>
                <Td numeric>{customer.customerNo ?? '—'}</Td>
                <Td>
                  <Tag color={customer.status === 'active' ? 'var(--adm-ok)' : 'var(--viz-ink-3)'}>
                    {customer.status}
                  </Tag>
                </Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
