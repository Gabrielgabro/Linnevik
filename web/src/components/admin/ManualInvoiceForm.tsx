'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button, ErrorNote, Field, Label } from '@/components/admin/Fields';
import { Notice, Panel, Tag } from '@/components/admin/ui';
import { formatMinor, toMinor } from '@/lib/money';
import type { InvoiceClientOption, InvoiceVariantOption, ManualQuote } from '@/lib/manualInvoice';

/**
 * Formuläret för en faktura som skapas för hand.
 *
 * Priser, frakt, moms och lagerläge räknas på servern — samma prissättning som
 * korgen — och visas här medan man fyller i. Det man skriver i "Eget pris"
 * ersätter katalogpriset för just den raden; tomt fält betyder katalogens.
 */

type LineState = { variantId: number; quantity: string; ownPrice: string };
type ShippingMode = 'rule' | 'manual' | 'none';

const inputClass = clsx(
  'w-full rounded-ctl border border-rule bg-surface px-3 py-2 text-[14px] text-ink outline-none transition-colors',
  'placeholder:text-ink-3 focus:border-brand',
  'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]'
);

function matches(haystack: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return words.every(word => text.includes(word));
}

export default function ManualInvoiceForm({
  clients,
  variants,
  defaultDueDays,
  bankgiro,
}: {
  clients: InvoiceClientOption[];
  variants: InvoiceVariantOption[];
  defaultDueDays: number;
  /** Bankgirot som står på fakturan; null om det inte är inställt. */
  bankgiro: string | null;
}) {
  const router = useRouter();

  // ── Kund ──
  const [clientQuery, setClientQuery] = useState('');
  const [client, setClient] = useState<InvoiceClientOption | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [reference, setReference] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');

  const [promoting, setPromoting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  async function chooseClient(option: InvoiceClientOption) {
    let next = option;
    if (option.kind === 'lead') {
      // En tvätterikund som faktureras har blivit en kund: flytta den till
      // kundregistret först, annars vägrar servern fakturan.
      setPromoting(true);
      setClientError(null);
      const response = await fetch(`/api/admin/clients/${option.id}/kind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'customer' }),
      }).catch(() => null);
      setPromoting(false);
      if (!response?.ok) {
        const data = response ? await response.json().catch(() => ({})) : {};
        setClientError(data.error ?? `Kunde inte göra ${option.name} till kund.`);
        return;
      }
      next = { ...option, kind: 'customer' };
    }
    setClient(next);
    setClientQuery('');
    setCompanyName(next.name);
    setOrgNumber(next.orgNumber ?? '');
    setEmail(next.invoiceEmail?.trim() || next.emails[0] || '');
    setLine1(next.address.line1);
    setLine2(next.address.line2);
    setPostalCode(next.address.postalCode);
    setCity(next.address.city);
    setReference(next.contactName ?? '');
  }

  const clientMatches = useMemo(() => {
    if (!clientQuery.trim()) return [];
    return clients
      .filter(option => matches(`${option.name} ${option.customerNo} ${option.orgNumber ?? ''} ${option.emails.join(' ')}`, clientQuery))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'customer' ? -1 : 1))
      .slice(0, 8);
  }, [clients, clientQuery]);

  // ── Rader ──
  const [lines, setLines] = useState<LineState[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const variantById = useMemo(() => new Map(variants.map(variant => [variant.variantId, variant])), [variants]);
  const productMatches = useMemo(() => {
    if (!productQuery.trim()) return [];
    return variants
      .filter(variant => matches(`${variant.title} ${variant.sku} ${variant.options}`, productQuery))
      .slice(0, 10);
  }, [variants, productQuery]);

  function addVariant(variantId: number) {
    setProductQuery('');
    setLines(current =>
      current.some(line => line.variantId === variantId)
        ? current.map(line =>
            line.variantId === variantId ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line
          )
        : [...current, { variantId, quantity: '1', ownPrice: '' }]
    );
  }
  function updateLine(variantId: number, patch: Partial<LineState>) {
    setLines(current => current.map(line => (line.variantId === variantId ? { ...line, ...patch } : line)));
  }
  function removeLine(variantId: number) {
    setLines(current => current.filter(line => line.variantId !== variantId));
  }

  // ── Frakt och villkor ──
  const [shippingMode, setShippingMode] = useState<ShippingMode>('rule');
  const [shippingName, setShippingName] = useState('Frakt');
  const [shippingAmount, setShippingAmount] = useState('');
  const [dueDays, setDueDays] = useState(String(defaultDueDays));
  const [memo, setMemo] = useState('');
  const [note, setNote] = useState('');

  // ── Gemensam form för offert och skapande ──
  const lineError = lines.some(line => {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return true;
    return line.ownPrice.trim() !== '' && !(toMinor(line.ownPrice) >= 0);
  });
  const shippingError = shippingMode === 'manual' && !(toMinor(shippingAmount) >= 0);
  const payloadLines = lines.map(line => ({
    variantId: line.variantId,
    quantity: Number(line.quantity),
    unitAmountMinor: line.ownPrice.trim() === '' ? null : toMinor(line.ownPrice),
  }));
  const payloadShipping =
    shippingMode === 'manual'
      ? { mode: 'manual', name: shippingName, amountMinor: toMinor(shippingAmount) }
      : { mode: shippingMode };
  const quoteKey = JSON.stringify({ payloadLines, payloadShipping });

  // ── Offert från servern ──
  const [quote, setQuote] = useState<ManualQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const quoteRequest = useRef(0);

  useEffect(() => {
    if (!lines.length || lineError || shippingError) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const request = ++quoteRequest.current;
    setQuoting(true);
    const timer = setTimeout(async () => {
      const response = await fetch('/api/admin/invoices/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: quoteKey,
      }).catch(() => null);
      // Ett svar på en äldre offert får inte skriva över en nyare.
      if (request !== quoteRequest.current) return;
      setQuoting(false);
      const data = response ? await response.json().catch(() => ({})) : {};
      if (!response?.ok) {
        setQuote(null);
        setQuoteError(data.error ?? 'Kunde inte räkna fram fakturan.');
        return;
      }
      setQuote(data as ManualQuote);
      setQuoteError(null);
    }, 350);
    return () => clearTimeout(timer);
    // quoteKey bär allt offerten beror på.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const quoteLine = (variantId: number) => quote?.lines.find(line => line.variantId === variantId);

  // ── Skapa ──
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockers = [
    !bankgiro && 'Bankgirot är inte inställt (INVOICE_BANKGIRO).',
    !client && 'Välj en kund.',
    !lines.length && 'Lägg till minst en produkt.',
    lineError && 'Ett antal eller pris är ogiltigt.',
    shippingError && 'Fraktbeloppet är ogiltigt.',
    quote?.stockProblems.length && 'Lagret räcker inte för alla rader.',
    !quote && lines.length > 0 && !lineError && !shippingError && 'Väntar på beräkningen.',
  ].filter((value): value is string => Boolean(value));

  async function submit() {
    if (submitting || blockers.length || !quote || !client) return;
    const ok = window.confirm(
      `Skapa och skicka faktura på ${formatMinor(quote.totalMinor, quote.currency)} inkl. moms till ${companyName} (${email})?\n\n` +
        'Lagret reserveras, fakturan skapas i Stripe med bankgiro och OCR, och kunden får fakturamejlet direkt.'
    );
    if (!ok) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: client.id,
        recipient: {
          email,
          companyName,
          organizationNumber: orgNumber,
          address: { line1, line2, postalCode, city },
        },
        reference,
        purchaseOrder,
        lines: payloadLines,
        shipping: payloadShipping,
        daysUntilDue: Number(dueDays),
        memo,
        note,
      }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      setSubmitting(false);
      setError(data.error ?? 'Fakturan kunde inte skapas.');
      return;
    }
    router.push(`/admin/orders/${data.orderId}`);
    router.refresh();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-6">
        <Panel title="Kund" meta="Fakturan ställs ut på företaget">
          <div className="grid gap-4">
            {client ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-ctl border border-rule bg-plane px-3 py-2.5">
                <div className="text-[14px]">
                  <span className="font-medium text-ink">{client.name}</span>{' '}
                  <span className="text-ink-3">· kundnr {client.customerNo}</span>{' '}
                  <Link href={`/admin/customers/${client.id}`} className="text-[12.5px] text-brand-text hover:underline">
                    Öppna kundkortet
                  </Link>
                </div>
                <Button type="button" variant="quiet" size="sm" onClick={() => setClient(null)}>
                  Byt kund
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Label>Sök kund</Label>
                <div className="relative mt-1.5">
                  <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                  <input
                    value={clientQuery}
                    onChange={event => setClientQuery(event.target.value)}
                    placeholder="Namn, kundnummer, org.nr eller e-post"
                    aria-label="Sök kund"
                    className={clsx(inputClass, 'pl-9')}
                  />
                </div>
                {clientMatches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-ctl border border-rule bg-surface shadow-card">
                    {clientMatches.map(option => (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() => chooseClient(option)}
                          disabled={promoting}
                          className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-plane"
                        >
                          <span className="text-ink">
                            {option.name}
                            {option.kind === 'lead' && (
                              <span className="ml-2 text-[11.5px] text-ink-3">Tvätterikund · blir kund när du väljer den</span>
                            )}
                          </span>
                          <span className="font-mono text-[11.5px] text-ink-3">
                            {option.orgNumber ?? 'org.nr saknas'} · {option.customerNo}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {promoting && <p className="mt-2 text-[12.5px] text-ink-3">Gör om till kund…</p>}
                {clientError && <ErrorNote>{clientError}</ErrorNote>}
                {clientQuery.trim() && clientMatches.length === 0 && (
                  <p className="mt-2 text-[12.5px] text-ink-3">
                    Ingen kund matchar.{' '}
                    <Link href="/admin/customers/new" className="text-brand-text hover:underline">
                      Lägg till kunden
                    </Link>{' '}
                    under Kunder först.
                  </p>
                )}
              </div>
            )}

            {client && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Företagsnamn på fakturan" name="companyName" value={companyName} onChange={event => setCompanyName(event.target.value)} required />
                <Field
                  label="Organisationsnummer"
                  name="orgNumber"
                  value={orgNumber}
                  onChange={event => setOrgNumber(event.target.value)}
                  required
                  hint={client.orgNumber ? undefined : 'Saknas på kundkortet — fyll i här.'}
                />
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>Skicka fakturan till *</Label>
                  <input
                    type="email"
                    list="manual-invoice-emails"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="ekonomi@foretag.se"
                    className={inputClass}
                  />
                  <datalist id="manual-invoice-emails">
                    {client.emails.map(option => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <span className="text-[12px] text-ink-3">
                    Förval: kundkortets fakturamejl, annars första kontakten. Fakturan och påminnelserna går hit.
                  </span>
                </label>
                <Field label="Gatuadress" name="line1" value={line1} onChange={event => setLine1(event.target.value)} required />
                <Field label="c/o, våning (valfritt)" name="line2" value={line2} onChange={event => setLine2(event.target.value)} />
                <Field label="Postnummer" name="postalCode" value={postalCode} onChange={event => setPostalCode(event.target.value)} required />
                <Field label="Ort" name="city" value={city} onChange={event => setCity(event.target.value)} required />
                <Field label="Er referens" name="reference" value={reference} onChange={event => setReference(event.target.value)} hint="Personen hos kunden som attesterar." />
                <Field label="Ert ordernr (valfritt)" name="purchaseOrder" value={purchaseOrder} onChange={event => setPurchaseOrder(event.target.value)} hint="Kundens inköpsordernummer eller kostnadsställe." />
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Rader" meta="Priser exkl. moms · lagret reserveras när fakturan skapas" padded={false}>
          <div className="relative border-b border-rule p-4">
            <div className="relative">
              <Plus size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={productQuery}
                onChange={event => setProductQuery(event.target.value)}
                placeholder="Lägg till produkt: namn eller SKU"
                aria-label="Lägg till produkt"
                className={clsx(inputClass, 'pl-9')}
              />
            </div>
            {productMatches.length > 0 && (
              <ul className="absolute inset-x-4 z-10 mt-1 overflow-hidden rounded-ctl border border-rule bg-surface shadow-card">
                {productMatches.map(variant => (
                  <li key={variant.variantId}>
                    <button
                      type="button"
                      onClick={() => addVariant(variant.variantId)}
                      className="grid w-full grid-cols-[1fr_auto] items-baseline gap-3 px-3 py-2 text-left text-[13.5px] hover:bg-plane"
                    >
                      <span className="text-ink">
                        {variant.title}
                        {variant.options && <span className="text-ink-3"> · {variant.options}</span>}
                        <span className="ml-2 font-mono text-[11.5px] text-ink-3">{variant.sku}</span>
                      </span>
                      <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
                        {formatMinor(variant.listPriceMinor, variant.currency)} ·{' '}
                        {variant.available === null ? 'lager följs ej' : `${variant.available} i lager`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="p-4 text-[13.5px] text-ink-3">Inga rader ännu. Sök fram en produkt ovan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-rule text-left">
                    {['Produkt', 'Antal', 'Katalogpris', 'Eget pris', 'Summa', ''].map(heading => (
                      <th key={heading} className="px-4 py-2 font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] text-ink-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => {
                    const variant = variantById.get(line.variantId);
                    const priced = quoteLine(line.variantId);
                    const available = priced?.available ?? variant?.available ?? null;
                    const short = available !== null && Number(line.quantity) > available;
                    return (
                      <tr key={line.variantId} className="border-b border-rule last:border-0 align-top">
                        <td className="px-4 py-3">
                          <div className="text-ink">{variant?.title ?? `Variant ${line.variantId}`}</div>
                          <div className="font-mono text-[11.5px] text-ink-3">
                            {variant?.sku}
                            {variant?.options ? ` · ${variant.options}` : ''}
                          </div>
                          <div className={clsx('mt-1 text-[12px]', short ? 'text-danger' : 'text-ink-3')}>
                            {available === null ? 'Lagret följs inte' : `${Math.max(0, available)} st i lager`}
                            {short && ' — räcker inte'}
                          </div>
                          {variant?.tags.some(tag => tag === 'SAMPLE_ONLY' || tag === 'MTO') && (
                            <div className="mt-1 flex gap-1.5">
                              {variant.tags
                                .filter(tag => tag === 'SAMPLE_ONLY' || tag === 'MTO')
                                .map(tag => (
                                  <Tag key={tag} color="var(--adm-info)">{tag}</Tag>
                                ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={event => updateLine(line.variantId, { quantity: event.target.value })}
                            aria-label="Antal"
                            className={clsx(inputClass, 'w-24 tabular-nums')}
                          />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink-2">
                          {priced ? formatMinor(priced.catalogUnitMinor, priced.currency) : '—'}
                          {priced && priced.catalogUnitMinor < priced.listPriceMinor && (
                            <div className="text-[11.5px] text-ink-3">
                              lista {formatMinor(priced.listPriceMinor, priced.currency)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            inputMode="decimal"
                            value={line.ownPrice}
                            onChange={event => updateLine(line.variantId, { ownPrice: event.target.value })}
                            placeholder={priced ? String(priced.catalogUnitMinor / 100).replace('.', ',') : 'kr'}
                            aria-label="Eget styckpris i kronor exkl. moms"
                            className={clsx(inputClass, 'w-28 tabular-nums')}
                          />
                        </td>
                        <td className="px-4 py-3 tabular-nums text-ink">
                          {priced ? formatMinor(priced.unitAmountMinor * priced.quantity, priced.currency) : '—'}
                        </td>
                        <td className="px-2 py-3">
                          <Button type="button" variant="quiet" size="sm" onClick={() => removeLine(line.variantId)} aria-label="Ta bort raden">
                            <Trash2 size={14} aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Frakt och villkor">
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <Label>Frakt</Label>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-ink">
                {([
                  ['rule', 'Enligt fraktregel'],
                  ['manual', 'Ange själv'],
                  ['none', 'Ingen frakt'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2">
                    <input type="radio" name="shippingMode" checked={shippingMode === value} onChange={() => setShippingMode(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {shippingMode === 'manual' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fraktrad på fakturan" name="shippingName" value={shippingName} onChange={event => setShippingName(event.target.value)} />
                <Field label="Fraktbelopp, kr exkl. moms" name="shippingAmount" value={shippingAmount} onChange={event => setShippingAmount(event.target.value)} placeholder="0" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <Field label="Betalningsvillkor, dagar" name="dueDays" type="number" min="1" max="120" value={dueDays} onChange={event => setDueDays(event.target.value)} />
              <label className="flex flex-col gap-1.5">
                <Label>Meddelande på fakturan (valfritt)</Label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={memo}
                  onChange={event => setMemo(event.target.value)}
                  placeholder="Tomt ger standardtexten: tack för beställningen, varorna är reserverade."
                  className={clsx(inputClass, 'resize-y leading-[1.6]')}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <Label>Intern notering (syns inte för kunden)</Label>
              <textarea rows={2} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} className={clsx(inputClass, 'resize-y leading-[1.6]')} />
            </label>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-6">
        <Panel title="Summa" meta={quoting ? 'Räknar…' : bankgiro ? `Bankgiro ${bankgiro} · OCR sätts av ordernumret` : undefined}>
          {quote ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13.5px]">
              <dt className="text-ink-3">Varor</dt>
              <dd className="text-right tabular-nums">{formatMinor(quote.subtotalMinor, quote.currency)}</dd>
              <dt className="text-ink-3">{quote.shipping?.name ?? 'Frakt'}</dt>
              <dd className="text-right tabular-nums">{formatMinor(quote.shipping?.amountMinor ?? 0, quote.currency)}</dd>
              <dt className="text-ink-3">Moms {quote.vatPercent} %</dt>
              <dd className="text-right tabular-nums">{formatMinor(quote.vatMinor, quote.currency)}</dd>
              <dt className="border-t border-rule pt-2 font-medium text-ink">Att betala</dt>
              <dd className="border-t border-rule pt-2 text-right font-medium tabular-nums text-ink">
                {formatMinor(quote.totalMinor, quote.currency)}
              </dd>
              <dt className="text-ink-3">Förfaller</dt>
              <dd className="text-right text-ink-2">om {dueDays || '—'} dagar</dd>
            </dl>
          ) : (
            <p className="text-[13.5px] text-ink-3">{lines.length ? 'Fyll i antal och priser.' : 'Lägg till rader för att se summan.'}</p>
          )}
        </Panel>

        {quoteError && <ErrorNote>{quoteError}</ErrorNote>}
        {quote && quote.stockProblems.length > 0 && (
          <Notice tone="danger" title="Lagret räcker inte">
            {quote.stockProblems.join(' ')} Fyll på lagret eller minska antalet.
          </Notice>
        )}
        {quote?.lines.some(line => line.priceOverridden) && (
          <Notice tone="info" title="Eget pris">
            {quote.lines.filter(line => line.priceOverridden).length} rad(er) faktureras till eget pris i stället för katalogens.
          </Notice>
        )}
        <ErrorNote>{error}</ErrorNote>

        <Button type="button" onClick={submit} disabled={submitting || blockers.length > 0}>
          {submitting ? 'Skapar fakturan…' : 'Skapa och skicka faktura'}
        </Button>
        {blockers.length > 0 && <p className="text-[12.5px] text-ink-3">{blockers[0]}</p>}
        <p className="text-[12px] leading-[1.6] text-ink-3">
          Fakturan skapas i Stripe och mejlas till kunden direkt. Ordern hamnar under Ordrar → Obetalda fakturor och
          följs upp som alla fakturor. Ångra genom att avbeställa ordern — då makuleras fakturan och lagret släpps.
        </p>
      </div>
    </div>
  );
}
