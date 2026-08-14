'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import { toMinor } from '@/lib/money';
import type { OrderDetail } from '@/lib/ordersDb';

export default function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function post(event: React.FormEvent<HTMLFormElement>, path: string, payload: object) {
    event.preventDefault();
    setError(null);
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error ?? 'Åtgärden misslyckades.');
    event.currentTarget.reset();
    router.refresh();
  }
  return (
    <div className="grid grid-cols-2 gap-8 max-[760px]:grid-cols-1">
      <form className="col-span-full grid grid-cols-[1fr_2fr_auto] items-end gap-4 max-[700px]:grid-cols-1" onSubmit={async event => {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        const response = await fetch(`/api/admin/orders/${order.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: values.status, notes: values.notes }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) setError(data.error ?? 'Kunde inte uppdatera ordern.');
        else router.refresh();
      }}>
        <Select label="Orderstatus" name="status" required options={['pending', 'paid', 'on_hold', 'cancelled', 'closed']} defaultValue={order.status} />
        <Field label="Intern ordernotering" name="notes" defaultValue={order.notes} />
        <Button type="submit">Uppdatera order</Button>
      </form>
      <form className="grid gap-4" onSubmit={event => {
        const values = formValues(event.currentTarget);
        return post(event, `/api/admin/orders/${order.id}/refunds`, {
          amountMinor: toMinor(values.amount), reason: values.reason, note: values.note,
          requestKey: crypto.randomUUID(),
        });
      }}>
        <h2 className="font-heading text-xl">Återbetalning</h2>
        <Field label="Belopp (kr)" name="amount" type="number" step="0.01" required />
        <Select label="Orsak" name="reason" required options={['requested_by_customer', 'duplicate', 'fraudulent']} />
        <TextArea label="Intern notering" name="note" />
        <Button type="submit">Återbetala via Stripe</Button>
      </form>

      <form className="grid gap-4" onSubmit={event => {
        const values = formValues(event.currentTarget);
        return post(event, `/api/admin/orders/${order.id}/fulfillments`, {
          status: values.status, carrier: values.carrier, trackingNumber: values.trackingNumber,
          trackingUrl: values.trackingUrl, note: values.note,
          items: order.items.map(item => ({ orderItemId: item.id, quantity: item.quantity })),
        });
      }}>
        <h2 className="font-heading text-xl">Leverans</h2>
        <Select label="Status" name="status" required options={['shipped', 'delivered', 'pending']} />
        <Field label="Transportör" name="carrier" />
        <Field label="Spårningsnummer" name="trackingNumber" />
        <Field label="Spårningslänk" name="trackingUrl" type="url" />
        <TextArea label="Intern notering" name="note" />
        <Button type="submit">Skapa fulfillment</Button>
      </form>
      <div className="col-span-full"><ErrorNote>{error}</ErrorNote></div>
    </div>
  );
}
