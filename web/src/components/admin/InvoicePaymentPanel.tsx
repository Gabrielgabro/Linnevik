'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, TextArea, formValues } from '@/components/admin/Fields';
import Notice from '@/components/admin/ui/Notice';
import { formatMinor, toMinor } from '@/lib/money';
import type { OrderDetail } from '@/lib/ordersDb';

/** Det sidan hämtat ur Stripe om fakturan. Null när Stripe inte svarade. */
export type InvoiceSummary = {
  number: string | null;
  status: string | null;
  dueDate: string | null;
  amountRemainingMinor: number;
  hostedUrl: string | null;
};

type Props = {
  order: OrderDetail;
  invoice: InvoiceSummary | null;
  ocr: string;
  bankgiro: string | null;
  bankAccount: string | null;
  /** Dagens datum i Stockholm, ÅÅÅÅ-MM-DD — förval för betalningsdagen. */
  today: string;
};

const PAID = ['paid', 'partially_refunded', 'refunded'];

function dateText(iso: string | null): string {
  return iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('sv-SE', { dateStyle: 'long' }) : '—';
}

/**
 * Fakturabetalning på orderkortet.
 *
 * Svenska företagskunder betalar till vårt bankgiro, utanför Stripe. Den här
 * rutan är där betalningen registreras när den syns på kontot — och där man
 * ser hur länge en faktura legat obetald och kan skicka om den eller påminna.
 */
export default function InvoicePaymentPanel({ order, invoice, ocr, bankgiro, bankAccount, today }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pay' | 'invoice' | 'invoice_reminder' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const bankEvent = order.events.find(event => event.kind === 'payment.bank_registered');
  const lastReminder = order.events.find(
    event => event.kind === 'email.sent' && event.detail?.template === 'order.invoice_reminder'
  );
  const isPaid = PAID.includes(order.paymentStatus);
  const open = !isPaid && order.paymentStatus === 'pending' && order.status !== 'cancelled' && invoice?.status === 'open';
  const overdueDays = invoice?.dueDate && invoice.dueDate < today
    ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${invoice.dueDate}T12:00:00Z`)) / 86_400_000)
    : 0;

  async function sendEmail(template: 'invoice' | 'invoice_reminder') {
    setBusy(template);
    setError(null);
    setDone(null);
    const response = await fetch(`/api/admin/orders/${order.id}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(data.error ?? 'Utskicket misslyckades.');
    setDone(template === 'invoice' ? 'Fakturan skickades igen.' : 'Påminnelsen skickades.');
    router.refresh();
  }

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = formValues(event.currentTarget);
    const amountMinor = toMinor(values.amount);
    if (!Number.isInteger(amountMinor) || amountMinor < 1) return setError('Ange det belopp som kom in på kontot.');
    // Det här gör ordern betald, plockar lagret och skickar orderbekräftelsen
    // till kunden. Det går inte att ångra härifrån, så det bekräftas först.
    const ok = window.confirm(
      `Registrera ${formatMinor(amountMinor, order.currency)} som inbetalt ${values.paidOn}?\n\n` +
        'Fakturan markeras som betald i Stripe, ordern blir betald och kunden får orderbekräftelsen.'
    );
    if (!ok) return;
    setBusy('pay');
    setError(null);
    setDone(null);
    const response = await fetch(`/api/admin/orders/${order.id}/bank-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountMinor, paidOn: values.paidOn, note: values.note }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setError(data.error ?? 'Betalningen kunde inte registreras.');
    setDone(
      data.assessment?.kind === 'over'
        ? 'Betalningen är registrerad. Kunden betalade för mycket — mellanskillnaden ska tillbaka (larm skapat).'
        : data.stockReady === false
          ? 'Betalningen är registrerad, men ordern saknar lagerreservation — se larmet.'
          : 'Betalningen är registrerad. Ordern är betald och orderbekräftelsen skickad.'
    );
    router.refresh();
  }

  return (
    <section className="grid gap-4 border-t border-rule pt-6">
      <h2 className="font-heading text-xl">Fakturabetalning</h2>

      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Faktura</dt>
        <dd>
          {invoice?.hostedUrl ? (
            <a href={invoice.hostedUrl} target="_blank" rel="noreferrer" className="text-brand-text hover:underline">
              {invoice.number ?? 'Öppna'}
            </a>
          ) : (
            invoice?.number ?? '—'
          )}
          {invoice?.status && <span className="ml-2 text-ink-3">({invoice.status})</span>}
        </dd>
        <dt className="text-ink-3">Förfallodag</dt>
        <dd>
          {dateText(invoice?.dueDate ?? null)}
          {open && overdueDays > 0 && (
            <span className="ml-2 font-medium" style={{ color: 'var(--adm-warn)' }}>
              förfallen {overdueDays} {overdueDays === 1 ? 'dag' : 'dagar'}
            </span>
          )}
        </dd>
        {open && invoice && (
          <>
            <dt className="text-ink-3">Att betala</dt>
            <dd className="font-medium">{formatMinor(invoice.amountRemainingMinor, order.currency)}</dd>
          </>
        )}
        <dt className="text-ink-3">OCR</dt>
        <dd className="font-mono">{ocr}</dd>
        {bankgiro && (
          <>
            <dt className="text-ink-3">Bankgiro</dt>
            <dd className="font-mono">{bankgiro}</dd>
          </>
        )}
        {bankAccount && (
          <>
            <dt className="text-ink-3">Bankkonto</dt>
            <dd className="font-mono">{bankAccount}</dd>
          </>
        )}
      </dl>

      {!invoice && (
        <Notice tone="warn" title="Kunde inte läsa fakturan i Stripe">
          Uppgifterna ovan kan vara ofullständiga. Ladda om sidan om en stund.
        </Notice>
      )}

      {bankEvent && (
        <Notice tone="ok" title="Betald via bank">
          {formatMinor(Number(bankEvent.detail?.amount_minor ?? 0), order.currency)} inbetalt{' '}
          {dateText(String(bankEvent.detail?.paid_on ?? '') || null)} · registrerat av {bankEvent.actor}{' '}
          {bankEvent.createdAt.toLocaleString('sv-SE')}
          {typeof bankEvent.detail?.note === 'string' && bankEvent.detail.note && (
            <span className="block">Notering: {bankEvent.detail.note}</span>
          )}
        </Notice>
      )}

      {isPaid && !bankEvent && (
        <Notice tone="ok" title="Betald i Stripe">
          Fakturan betalades på Stripes fakturasida (kort) eller markerades betald direkt i Stripe.
        </Notice>
      )}

      {!isPaid && !open && invoice && (
        <Notice tone="warn" title="Fakturan är inte öppen">
          {order.status === 'cancelled'
            ? 'Ordern är avbeställd och fakturan makulerad.'
            : `Fakturan har status ${invoice.status} i Stripe och kan inte betalas.`}{' '}
          Har kunden ändå betalat ska pengarna tillbaka från bankkontot — eller lägg en ny order.
        </Notice>
      )}

      {open && invoice && (
        <form className="grid max-w-xl grid-cols-2 gap-4 max-[700px]:grid-cols-1" onSubmit={registerPayment}>
          <p className="col-span-full text-[13px] text-ink-2">
            Registrera betalningen när den syns på bankkontot. Ordern blir betald, lagret plockas och
            kunden får orderbekräftelsen — precis som vid en kortbetalning.
          </p>
          <Field
            label="Inbetalt belopp (kr)"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={(invoice.amountRemainingMinor / 100).toFixed(2)}
            hint="Upp till 1 kr avvikelse räknas som öresavrundning."
          />
          <Field label="Betalningsdag" name="paidOn" type="date" required defaultValue={today} max={today} />
          <TextArea label="Notering (valfri)" name="note" className="col-span-full" />
          <div className="col-span-full">
            <Button type="submit" disabled={busy !== null}>
              {busy === 'pay' ? 'Registrerar…' : 'Registrera bankbetalning'}
            </Button>
          </div>
        </form>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => sendEmail('invoice')}>
            {busy === 'invoice' ? 'Skickar…' : 'Skicka om fakturan'}
          </Button>
          <Button
            type="button"
            variant="quiet"
            disabled={busy !== null || overdueDays < 1}
            onClick={() => sendEmail('invoice_reminder')}
          >
            {busy === 'invoice_reminder' ? 'Skickar…' : 'Skicka betalningspåminnelse'}
          </Button>
          <span className="text-[13px] text-ink-3">
            {lastReminder
              ? `Senaste påminnelse: ${lastReminder.createdAt.toLocaleString('sv-SE')}.`
              : overdueDays < 1
                ? 'Påminnelse kan skickas när fakturan förfallit.'
                : 'Ingen påminnelse skickad — en går ut automatiskt sju dagar efter förfallodagen.'}
          </span>
        </div>
      )}

      {done && <Notice tone="ok">{done}</Notice>}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
