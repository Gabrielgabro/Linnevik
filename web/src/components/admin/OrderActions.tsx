'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, Select, TextArea, formValues } from '@/components/admin/Fields';
import Notice from '@/components/admin/ui/Notice';
import { toMinor } from '@/lib/money';
import type { OrderDetail } from '@/lib/ordersDb';

// Select bär bara en lista med strängar, så alternativets text *är* dess
// värde. Namnet står här för att jämförelsen nedan inte ska hänga på att två
// lösa strängar stavas lika.
const RESTOCK = 'Lägg tillbaka i lager';
const DISCARD = 'Kassera (ingen återföring)';

export default function OrderActions({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<'confirmation' | 'shipment' | null>(null);
  const [resent, setResent] = useState(false);
  const [saving, setSaving] = useState(false);
  // Återbetalningen är det enda i vyn som flyttar riktiga pengar, så knappen
  // låses medan anropet pågår. Nyckeln nedan hör till formulärets nuvarande
  // innehåll och byts först när en återbetalning gått igenom: dubbelklickar
  // man ändå får Stripe samma idempotensnyckel och skickar inte om pengarna.
  const [refunding, setRefunding] = useState(false);
  const [refundKey, setRefundKey] = useState(() => crypto.randomUUID());
  // Ordern sparades förr helt tyst: knappen såg likadan ut före och efter, och
  // en oförändrad status gav inget synligt kvitto alls.
  const [saved, setSaved] = useState<string | null>(null);
  // Vad som faktiskt går att leverera nu. Samma räkning som spärren i
  // createFulfillment gör, men här för att slippa visa rutan alls.
  const canFulfill = ['paid', 'partially_refunded'].includes(order.paymentStatus)
    && !['cancelled', 'failed', 'expired', 'stock_exception'].includes(order.status);
  const openItems = canFulfill ? order.items.filter(item => item.remainingQuantity > 0) : [];
  const fullyFulfilled = order.items.length > 0 && openItems.length === 0;
  const partiallyFulfilled = !fullyFulfilled && order.items.some(item => item.fulfilledQuantity > 0);
  // Returer: backenden har kunnat ta emot dem hela tiden, men det fanns ingen
  // väg dit från ordersidan — en retur fick bokas om för hand i lagret.
  const returnableItems = order.items.filter(item => item.returnableQuantity > 0);
  const anythingReturned = order.items.some(item => item.returnedQuantity > 0);
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
    // React nollar currentTarget när händelsen är avklarad, och den är det
    // långt innan svaret kommit. Formuläret hämtas därför ut redan här.
    const form = event.currentTarget;
    setError(null);
    const response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? 'Åtgärden misslyckades.');
      return false;
    }
    form.reset();
    router.refresh();
    return true;
  }
  return (
    <div className="grid grid-cols-2 gap-8 max-[760px]:grid-cols-1">
      <form className="col-span-full grid grid-cols-[1fr_2fr_auto] items-end gap-4 max-[700px]:grid-cols-1" onSubmit={async event => {
        event.preventDefault();
        const values = formValues(event.currentTarget);
        setSaving(true);
        setError(null);
        setSaved(null);
        const response = await fetch(`/api/admin/orders/${order.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: values.status, notes: values.notes }),
        });
        const data = await response.json().catch(() => ({}));
        setSaving(false);
        if (!response.ok) return setError(data.error ?? 'Kunde inte uppdatera ordern.');
        setSaved(new Date().toLocaleTimeString('sv-SE'));
        router.refresh();
      }}>
        <Select label="Orderstatus" name="status" required options={['pending', 'paid', 'on_hold', 'cancelled', 'closed']} defaultValue={order.status} />
        <Field label="Intern ordernotering" name="notes" defaultValue={order.notes} />
        <Button type="submit" disabled={saving}>
          {saving ? 'Sparar…' : 'Uppdatera order'}
        </Button>
        {saved && (
          <div className="col-span-full">
            <Notice tone="ok" title="Ordern uppdaterad">
              Status och notering sparades {saved}.
            </Notice>
          </div>
        )}
      </form>
      <form className="grid gap-4" onSubmit={async event => {
        const values = formValues(event.currentTarget);
        if (refunding) return event.preventDefault();
        setRefunding(true);
        const ok = await post(event, `/api/admin/orders/${order.id}/refunds`, {
          amountMinor: toMinor(values.amount), reason: values.reason, note: values.note,
          requestKey: refundKey,
        });
        setRefunding(false);
        if (ok) setRefundKey(crypto.randomUUID());
      }}>
        <h2 className="font-heading text-xl">Återbetalning</h2>
        <Field label="Belopp (kr)" name="amount" type="number" step="0.01" required />
        <Select label="Orsak" name="reason" required options={['requested_by_customer', 'duplicate', 'fraudulent']} />
        <TextArea label="Intern notering" name="note" />
        <Button type="submit" disabled={refunding}>
          {refunding ? 'Återbetalar…' : 'Återbetala via Stripe'}
        </Button>
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

      <div className="col-span-full grid gap-4 border-t border-rule pt-6">
        <h2 className="font-heading text-xl">Retur</h2>
        {anythingReturned && (
          <Notice tone="info" title="Redan returnerat">
            <ul className="grid gap-1">
              {order.items
                .filter(item => item.returnedQuantity > 0)
                .map(item => (
                  <li key={item.id}>
                    {item.returnedQuantity} × {item.title}
                  </li>
                ))}
            </ul>
          </Notice>
        )}
        {returnableItems.length === 0 ? (
          <Notice tone="warn" title="Inget att returnera">
            Bara det som har levererats kan returneras, och varje antal bara en
            gång.
          </Notice>
        ) : (
          <form className="grid gap-4" onSubmit={event => {
            const values = formValues(event.currentTarget);
            // Samma regel som leveransformuläret: en nolla betyder "inte den
            // här raden", och servern kräver positiva heltal.
            const items = returnableItems
              .map(item => ({
                orderItemId: item.id,
                quantity: Number(values[`ret_${item.id}`] ?? 0),
              }))
              .filter(item => Number.isInteger(item.quantity) && item.quantity > 0);
            if (!items.length) {
              event.preventDefault();
              return setError('Ange ett antal på minst en rad.');
            }
            return post(event, `/api/admin/orders/${order.id}/returns`, {
              items, restock: values.restock === RESTOCK, note: values.note,
            });
          }}>
            <div className="grid gap-3">
              {returnableItems.map(item => (
                <Field
                  key={item.id}
                  label={
                    item.returnedQuantity > 0
                      ? `${item.title} — ${item.returnableQuantity} kvar att returnera av ${item.fulfilledQuantity}`
                      : `${item.title} (${item.fulfilledQuantity} levererade)`
                  }
                  name={`ret_${item.id}`}
                  type="number"
                  min="0"
                  max={String(item.returnableQuantity)}
                  step="1"
                  defaultValue="0"
                />
              ))}
            </div>
            {/* Skadat gods ska inte tillbaka i saldot, så valet måste finnas
                här — annars säljs en trasig vara vidare. */}
            <Select
              label="Lagerhantering"
              name="restock"
              required
              options={[RESTOCK, DISCARD]}
            />
            <TextArea label="Intern notering" name="note" />
            <Button type="submit">Registrera retur</Button>
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
