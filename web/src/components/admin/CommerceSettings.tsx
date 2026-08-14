'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, formValues } from '@/components/admin/Fields';
import type { DiscountCodeRow, ShippingRuleRow } from '@/lib/db/schema';
import { formatMinor, toMinor } from '@/lib/money';

export default function CommerceSettings({ discounts, shippingRules }: {
  discounts: DiscountCodeRow[];
  shippingRules: ShippingRuleRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>, endpoint: string, transform: (values: Record<string, string>) => object) {
    event.preventDefault();
    setError(null);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transform(formValues(event.currentTarget))),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? 'Kunde inte spara.');
    event.currentTarget.reset();
    router.refresh();
  }

  async function toggle(endpoint: string, active: boolean) {
    setError(null);
    const response = await fetch(endpoint, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
    });
    if (!response.ok) setError('Kunde inte ändra status.');
    else router.refresh();
  }

  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <h2 className="font-heading text-2xl">Rabattkoder</h2>
        <ul className="divide-y" style={{ borderColor: 'var(--viz-rule)' }}>
          {discounts.map(row => (
            <li key={row.id} className="flex items-center gap-4 py-3 text-sm">
              <strong className="font-mono">{row.code}</strong>
              <span>{row.title}</span>
              <span className="text-xs" style={{ color: 'var(--viz-ink-3)' }}>
                {row.kind === 'percentage' ? `${row.value} %` : row.kind === 'fixed_amount' ? formatMinor(row.value, row.currency) : 'fri frakt'}
              </span>
              <Button className="ml-auto" variant="quiet" onClick={() => toggle(`/api/admin/discounts/${row.id}`, !row.active)}>
                {row.active ? 'Inaktivera' : 'Aktivera'}
              </Button>
            </li>
          ))}
        </ul>
        <form className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1" onSubmit={event => submit(event, '/api/admin/discounts', values => ({
          code: values.code, title: values.title, kind: values.kind,
          value: values.kind === 'fixed_amount' ? toMinor(values.value) : Number(values.value || 0),
          minimumSubtotalMinor: toMinor(values.minimumSubtotal || '0'), currency: 'sek', active: true,
        }))}>
          <Field label="Kod" name="code" required />
          <Field label="Namn" name="title" required />
          <Select label="Typ" name="kind" required options={['percentage', 'fixed_amount', 'free_shipping']} />
          <Field label="Värde (% eller kr)" name="value" type="number" step="0.01" defaultValue="0" />
          <Field label="Minsta order (kr)" name="minimumSubtotal" type="number" step="0.01" defaultValue="0" />
          <Button type="submit">Skapa rabattkod</Button>
        </form>
      </section>

      <section className="grid gap-4">
        <h2 className="font-heading text-2xl">Fraktregler</h2>
        <ul className="divide-y" style={{ borderColor: 'var(--viz-rule)' }}>
          {shippingRules.map(row => (
            <li key={row.id} className="flex items-center gap-4 py-3 text-sm">
              <strong>{row.name}</strong>
              <span>{row.countryCodes.join(', ')}</span>
              <span>{formatMinor(row.priceMinor, row.currency)}</span>
              <span className="text-xs" style={{ color: 'var(--viz-ink-3)' }}>prioritet {row.priority} (lägre väljs först)</span>
              <Button className="ml-auto" variant="quiet" onClick={() => toggle(`/api/admin/shipping/${row.id}`, !row.active)}>
                {row.active ? 'Inaktivera' : 'Aktivera'}
              </Button>
            </li>
          ))}
        </ul>
        <form className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1" onSubmit={event => submit(event, '/api/admin/shipping', values => ({
          name: values.name, countryCodes: values.countryCodes, priceMinor: toMinor(values.price),
          freeAboveMinor: values.freeAbove ? toMinor(values.freeAbove) : null,
          minimumSubtotalMinor: 0, currency: 'sek', priority: Number(values.priority || 0), active: true,
        }))}>
          <Field label="Namn" name="name" required />
          <Field label="Länder" name="countryCodes" defaultValue="SE" />
          <Field label="Pris (kr)" name="price" type="number" step="0.01" defaultValue="0" />
          <Field label="Fri över (kr)" name="freeAbove" type="number" step="0.01" />
          <Field label="Prioritet (lägre först)" name="priority" type="number" defaultValue="0" />
          <Button type="submit">Skapa fraktregel</Button>
        </form>
      </section>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
