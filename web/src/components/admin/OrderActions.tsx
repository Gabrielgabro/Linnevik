'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import Notice from '@/components/admin/ui/Notice';
import { toMinor } from '@/lib/money';
import type { OrderDetail } from '@/lib/ordersDb';

export default function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<'confirmation' | 'shipment' | null>(null);
  const [resent, setResent] = useState(false);
  // Vad som faktiskt går att leverera nu. Samma räkning som spärren i
  // createFulfillment gör, men här för att slippa visa rutan alls.
  const canFulfill = ['paid', 'partially_refunded'].includes(order.paymentStatus)
    && !['cancelled', 'failed', 'expired', 'stock_exception'].includes(order.status);
  const openItems = canFulfill ? order.items.filter(item => item.remainingQuantity > 0) : [];
  const fullyFulfilled = order.items.length > 0 && openItems.length === 0;
  const partiallyFulfilled = !fullyFulfilled && order.items.some(item => item.fulfilledQuantity > 0);
  // Utskickens tillstånd: senaste loggade händelsen och vad som går att göra om.
  const lastEmail = order.events.find(
    event => event.kind === 'email.sent' || event.kind === 'email.failed'
  );
  const hasShipment = order.fulfillments.some(
    fulfillment => fulfillment.status === 'shipped' || fulfillment.status === 'delivered'
  );

  async function resend(template: 'confirmation' | 'shipment') {
    setSending(template);
    setError(null);
    setResent(false);
    const response = await fetch(`/api/admin/orders/${order.id}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    });
    const data = await response.json().catch(() => ({}));
    setSending(null);
    if (!response.ok) {
      setError(data.error ?? 'Utskicket misslyckades.');
      return;
    }
    setResent(true);
    router.refresh();
  }

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

      <div className="grid gap-4">
        <h2 className="font-heading text-xl">Leverans</h2>
        {!canFulfill ? (
          <Notice tone="warn" title="Ordern kan inte levereras">
            Bara betalda ordrar med reserverat lager kan levereras. Nuvarande betalstatus är {order.paymentStatus}.
          </Notice>
        ) : fullyFulfilled ? (
          // Allt är utlevererat: servern hade nekat en till försändelse ändå
          // ("Fulfillment quantity exceeds the unfulfilled order quantity"), och
          // ett formulär som bara går att få fel av är sämre än inget.
          <Notice tone="ok" title="Hela ordern är levererad">
            <ul className="grid gap-1">
              {order.items.map(item => (
                <li key={item.id}>
                  {item.fulfilledQuantity} × {item.title}
                </li>
              ))}
            </ul>
            {order.fulfillments.length > 0 && (
              <p style={{ color: 'var(--viz-ink-3)' }}>
                {order.fulfillments.length} försändelse{order.fulfillments.length === 1 ? '' : 'r'}
                {' · senast '}
                {order.fulfillments[0].createdAt.toLocaleString('sv-SE')}
              </p>
            )}
          </Notice>
        ) : (
          <form className="grid gap-4" onSubmit={event => {
            const values = formValues(event.currentTarget);
            // Bara rader med ett positivt antal skickas — en nolla betyder
            // "inte den här gången", och servern kräver positiva heltal.
            const items = openItems
              .map(item => ({
                orderItemId: item.id,
                quantity: Number(values[`qty_${item.id}`] ?? 0),
              }))
              .filter(item => Number.isInteger(item.quantity) && item.quantity > 0);
            if (!items.length) {
              event.preventDefault();
              return setError('Ange ett antal på minst en rad.');
            }
            return post(event, `/api/admin/orders/${order.id}/fulfillments`, {
              status: values.status, carrier: values.carrier, trackingNumber: values.trackingNumber,
              trackingUrl: values.trackingUrl, note: values.note, items,
            });
          }}>
            {partiallyFulfilled && (
              <Notice tone="info" title="Delvis levererad">
                Antalen nedan är vad som återstår. Sänk ett antal för att dela upp
                leveransen ytterligare.
              </Notice>
            )}
            <div className="grid gap-3">
              {openItems.map(item => (
                <Field
                  key={item.id}
                  label={
                    item.fulfilledQuantity > 0
                      ? `${item.title} — ${item.remainingQuantity} kvar av ${item.quantity}`
                      : `${item.title} (${item.quantity} st)`
                  }
                  name={`qty_${item.id}`}
                  type="number"
                  min="0"
                  max={String(item.remainingQuantity)}
                  step="1"
                  defaultValue={String(item.remainingQuantity)}
                />
              ))}
            </div>
            <Select label="Status" name="status" required options={['shipped', 'delivered']} />
            <Field label="Transportör" name="carrier" />
            <Field label="Spårningsnummer" name="trackingNumber" />
            <Field label="Spårningslänk" name="trackingUrl" type="url" />
            <TextArea label="Intern notering" name="note" />
            <Button type="submit">Skapa fulfillment</Button>
          </form>
        )}
      </div>

      <div className="col-span-full grid gap-3 border-t border-rule pt-6">
        <h2 className="font-heading text-xl">Kundutskick</h2>
        {/* Ett mejl som inte gick fram loggades förr bara som email.failed i
            historiken nedan, utan väg tillbaka. Det larmar numera — och går att
            skicka om härifrån, med exakt samma innehåll som kunden skulle fått. */}
        <p className="max-w-[62ch] text-[13px] text-ink-2">
          {lastEmail
            ? `Senaste utskicket: ${lastEmail.kind === 'email.sent' ? 'levererat' : 'misslyckades'} ${lastEmail.createdAt.toLocaleString('sv-SE')}.`
            : 'Inget utskick är loggat på den här ordern.'}
          {!order.email && ' Ordern saknar e-postadress.'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!order.email || sending !== null}
            onClick={() => resend('confirmation')}
          >
            {sending === 'confirmation' ? 'Skickar…' : 'Skicka om orderbekräftelsen'}
          </Button>
          {hasShipment && (
            <Button
              type="button"
              variant="quiet"
              disabled={!order.email || sending !== null}
              onClick={() => resend('shipment')}
            >
              {sending === 'shipment' ? 'Skickar…' : 'Skicka om leveransaviseringen'}
            </Button>
          )}
          {resent && <span className="text-[13px] text-ink-3">Skickat.</span>}
        </div>
      </div>

      <div className="col-span-full"><ErrorNote>{error}</ErrorNote></div>
    </div>
  );
}
