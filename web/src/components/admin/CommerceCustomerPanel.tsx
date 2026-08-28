'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import { Panel, Tag } from '@/components/admin/ui';
import type { CustomerRow, OrderRow } from '@/lib/db/schema';
import { formatMinor } from '@/lib/money';

const ACCOUNT_STATUSES = ['active', 'inactive'] as const;

function AccountForm({ clientId, customer }: { clientId: number; customer?: CustomerRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const form = event.currentTarget;
    const values = formValues(form);
    const payload = {
      ...values,
      acceptsMarketing: (form.elements.namedItem('acceptsMarketing') as HTMLInputElement).checked,
    };
    const url = customer
      ? `/api/admin/clients/${clientId}/customers/${customer.id}`
      : `/api/admin/clients/${clientId}/customers`;
    const response = await fetch(url, {
      method: customer ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara webbkontot.');
      return;
    }
    setSaved(true);
    if (!customer) form.reset();
    router.refresh();
  };

  /**
   * Kontot försvinner, företaget står kvar. Ordrarna följer inte med — de bär
   * köparens uppgifter från köptillfället och hör till bokföringen, inte till
   * inloggningen.
   */
  const remove = async () => {
    if (!customer) return;
    if (
      !confirm(
        `Ta bort webbkontot ${customer.email}? Inloggningen upphör direkt. ` +
          'Kunden och orderhistoriken står kvar.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/clients/${clientId}/customers/${customer.id}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ta bort webbkontot.');
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-b border-grid py-5 last:border-b-0">
      <div className="grid grid-cols-3 gap-4 max-[760px]:grid-cols-1">
        <Field label="E-post" name="email" type="email" required defaultValue={customer?.email} />
        <Field label="Förnamn" name="firstName" defaultValue={customer?.firstName} />
        <Field label="Efternamn" name="lastName" defaultValue={customer?.lastName} />
        <Field label="Telefon" name="phone" type="tel" defaultValue={customer?.phone} />
        <Field label="Org.nr / VAT" name="taxId" defaultValue={customer?.taxId} />
        <Select
          label="Kontostatus"
          name="status"
          options={ACCOUNT_STATUSES}
          defaultValue={customer?.status ?? 'active'}
          required
        />
      </div>
      <TextArea label="Handelsanteckningar" name="notes" defaultValue={customer?.notes} rows={2} />
      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          name="acceptsMarketing"
          defaultChecked={customer?.acceptsMarketing ?? false}
          style={{ accentColor: 'var(--adm-brand)' }}
        />
        Godkänner marknadsföring
      </label>
      {customer && (
        <div className="flex flex-wrap gap-2">
          {customer.stripeCustomerId && <Tag color="var(--adm-ok)">Stripe kopplad</Tag>}
          {customer.shopifyCustomerId && <Tag>Shopify importerad</Tag>}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Sparar…' : customer ? 'Spara webbkonto' : 'Skapa webbkonto'}
        </Button>
        {saved && !busy && <span className="text-[13px] text-ink-3">Sparat.</span>}
        {customer && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Ta bort webbkonto
          </button>
        )}
      </div>
    </form>
  );
}

export default function CommerceCustomerPanel({
  clientId,
  customers,
  orders,
}: {
  clientId: number;
  customers: CustomerRow[];
  orders: OrderRow[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Panel
      title="Handel och webbkonton"
      meta={`${customers.length} ${customers.length === 1 ? 'konto' : 'konton'} · ${orders.length} ${orders.length === 1 ? 'order' : 'ordrar'}`}
    >
      {customers.map(customer => (
        <AccountForm key={customer.id} clientId={clientId} customer={customer} />
      ))}

      {adding ? (
        <div>
          <AccountForm clientId={clientId} />
          <Button type="button" variant="quiet" onClick={() => setAdding(false)}>
            Avbryt
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          <Plus size={16} strokeWidth={2} aria-hidden />
          Lägg till webbkonto
        </Button>
      )}

      {orders.length > 0 && (
        <div className="mt-6 border-t border-rule pt-4">
          <h3 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
            Orderhistorik
          </h3>
          <ul className="divide-y divide-grid">
            {orders.map(order => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between gap-4 py-2.5 text-[13.5px] hover:text-brand-text"
                >
                  <span>
                    Order #{order.id} · {order.status}
                    {order.testMode && ' · TEST'}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatMinor(order.totalMinor, order.currency)} ·{' '}
                    {order.createdAt.toLocaleDateString('sv-SE')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
