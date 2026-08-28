'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BASIS_LABEL } from '@/data/competitorPrices';
import {
  franzenVariantCompetitors,
  type FranzenCompetitor,
} from '@/data/franzenCompetitorPrices';
import { articleForSku } from '@/data/franzenArticles';
import type { AdminUser } from '@/lib/adminAuth';
import { costOf, listCostOf, negotiatedCostOf } from '@/lib/franzenCost';
import type { VariantPricingProduct, VariantPricingVariant } from '@/lib/productsDb';
import { Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

/**
 * Prisbilden för Franzén-sortimentet.
 *
 * Skillnaden mot CompetitorCharts (egna produkter) är inte kosmetisk. Där är
 * kostnadsunderlaget en *landad* kostnad — vara, frakt och tull fördelade över
 * en sändning — och konkurrenten säljer en *likvärdig* produkt. Här är
 * kostnaden Franzéns inköpspris rakt av, och konkurrenten säljer i flera fall
 * exakt samma artikelnummer. Därför:
 *
 *   - Inköpspriset ritas som en egen stapel under varje variant, med
 *     marginalen utskriven bredvid reglaget. Drar man under den blir stapeln
 *     röd, precis som i den egna analysen.
 *   - Rader där leverantören säljer samma artikel märks ut. Det är den enda
 *     informationen på sidan som ensam kan avgöra ett pris: kan kunden köpa
 *     vår vara billigare någon annanstans är resten av jämförelsen ointressant.
 *
 * Reglaget skriver till katalogen per variant via /api/admin/variants/[id],
 * inte per produkt — en 50×70-handduk och ett 90×150-badlakan är olika
 * prispunkter under samma produkt.
 */

const SERIES = {
  cost: { label: 'Vårt inköpspris (Franzén)', varName: '--viz-s3' },
  ours: { label: 'Vårt pris (dra för att ändra)', varName: '--viz-s1' },
  b2b: { label: 'B2B-konkurrent', varName: '--viz-s2' },
  b2c: { label: 'B2C-referens', varName: '--viz-ink-3' },
} as const;

const MEMBER_VARS = ['--viz-m1', '--viz-m2', '--viz-m3'] as const;
const memberVar = (index: number) => MEMBER_VARS[index % MEMBER_VARS.length];

type StoredSuggestion = {
  id: number;
  user: string;
  label: string | null;
  prices: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

type Member = StoredSuggestion & { varName: string; hidden: boolean };

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

const optionLabel = (v: VariantPricingVariant) =>
  v.optionValues.map(o => o.value).join(' · ') || v.sku;

const liveOf = (v: VariantPricingVariant) => v.priceMinor / 100;


const marketOf = (sku: string): FranzenCompetitor[] =>
  [...(franzenVariantCompetitors[sku] ?? [])].sort((a, b) => a.priceSek - b.priceSek);

const marginPct = (price: number, cost: number | null) =>
  cost === null || price <= 0 ? null : ((price - cost) / price) * 100;

/** Referensraden ett index räknas mot: den märkta, annars den billigaste. */
const primaryOf = (rows: FranzenCompetitor[]) =>
  rows.find(r => r.primary) ?? rows[0] ?? null;

const ROW =
  'grid grid-cols-[196px_1fr_104px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1';

/**
 * Skalans tak låses till underlaget — inköpspris, nuvarande pris och marknaden
 * — inte till det som dras. Annars hoppar alla staplar i sidled så fort man rör
 * reglaget och varianterna går inte att jämföra med varandra.
 */
const scaleMaxOf = (values: number[]) => {
  const raw = Math.max(...values.filter(v => Number.isFinite(v)), 1) * 1.25;
  const step = raw > 400 ? 100 : raw > 100 ? 25 : raw > 20 ? 5 : 1;
  return Math.ceil(raw / step) * step;
};

const stepOf = (max: number) => (max > 400 ? 5 : max > 40 ? 1 : 0.5);

function VariantAxis({ max }: { max: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
  return (
    <div className="grid grid-cols-[196px_1fr_104px] items-start gap-3 max-[620px]:grid-cols-[1fr_auto]">
      <span className="max-[620px]:hidden" />
      <div className="relative h-[17px] border-t" style={{ borderColor: 'var(--viz-grid)' }}>
        {ticks.map((t, i) => (
          <i
            key={t}
            className="absolute top-[3px] whitespace-nowrap font-mono text-[10.5px] not-italic tabular-nums"
            style={{
              left: `${(t / max) * 100}%`,
              color: 'var(--viz-ink-3)',
              transform:
                i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {sek(t, max > 40 ? 0 : 1)}
          </i>
        ))}
      </div>
      <span className="pt-[3px] font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        kr/st
      </span>
    </div>
  );
}

/** En passiv stapel: inköpspris, konkurrentpris eller någons sparade bud. */
function Bar({
  label,
  sub,
  value,
  varName,
  max,
  decimals,
  tip,
  showTip,
  hideTip,
  flag,
}: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  value: number;
  varName: string;
  max: number;
  decimals: number;
  tip: { title: string; rows: string[]; note: string };
  showTip: (
    e: React.MouseEvent | React.FocusEvent,
    next: { title: string; rows: string[]; note: string }
  ) => void;
  hideTip: () => void;
  flag?: boolean;
}) {
  return (
    <div className={ROW}>
      <div
        className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        {label}
        {sub && (
          <span className="block text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
            {sub}
          </span>
        )}
      </div>
      <div
        className="flex h-[18px] items-stretch"
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      >
        <div
          tabIndex={0}
          role="img"
          aria-label={`${tip.title}: ${sek(value, decimals)} kr`}
          className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
          style={{
            background: `var(${varName})`,
            boxShadow: flag ? 'inset 0 0 0 1.5px var(--viz-flag)' : undefined,
          }}
          onMouseEnter={e => showTip(e, tip)}
          onMouseMove={e => showTip(e, tip)}
          onFocus={e => showTip(e, tip)}
          onMouseLeave={hideTip}
          onBlur={hideTip}
        />
      </div>
      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        {sek(value, decimals)} kr
      </span>
    </div>
  );
}

/**
 * Variantens eget pris som dragbart reglage, med inköpspriset som golv. Under
 * inköpspriset blir stapeln röd — det är inte förbjudet att dra dit, men det
 * ska aldrig gå att göra av misstag.
 */
function PriceSlider({
  label,
  value,
  baseline,
  cost,
  max,
  step,
  decimals,
  edited,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  baseline: number;
  cost: number | null;
  max: number;
  step: number;
  decimals: number;
  edited: boolean;
  onChange: (next: number) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const round = (v: number) => Math.round(v / step) * step;

  const valueFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(max, round(ratio * max)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(valueFromEvent(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) onChange(valueFromEvent(e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 10 : 1;
    const keys: Record<string, number | undefined> = {
      ArrowRight: value + step * big,
      ArrowUp: value + step * big,
      ArrowLeft: value - step * big,
      ArrowDown: value - step * big,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
      Home: 0,
      End: max,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(max, next)));
  };

  const belowCost = cost !== null && value < cost;
  const margin = marginPct(value, cost);
  const diff = value - baseline;

  return (
    <div className={ROW}>
      <div
        className="flex items-center justify-end gap-2 text-right text-[12.5px] font-semibold leading-tight max-[620px]:col-span-full max-[620px]:justify-start max-[620px]:text-left"
        style={{ color: 'var(--viz-ink)' }}
      >
        {edited && (
          <button
            type="button"
            onClick={onReset}
            title={`Återställ till nuvarande pris ${sek(baseline, decimals)} kr`}
            className="rounded-sm border px-[5px] py-px font-mono text-[9.5px] font-normal uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
          >
            ↺
          </button>
        )}
        <span>{label}</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-[26px] touch-none select-none rounded-[3px]"
        style={{ background: 'var(--viz-grid)', cursor: dragging ? 'grabbing' : 'ew-resize' }}
      >
        {/* Inköpspriset som fast streck — golvet reglaget mäts mot. */}
        {cost !== null && (
          <span
            aria-hidden
            title={`Inköpspris ${sek(cost, decimals)} kr`}
            className="pointer-events-none absolute bottom-0 top-0 w-px"
            style={{ left: `${Math.min(100, (cost / max) * 100)}%`, background: 'var(--viz-s3)' }}
          />
        )}
        {/* Var det nuvarande priset låg, så avvikelsen syns medan man drar. */}
        <span
          aria-hidden
          title={`Nuvarande pris i katalogen: ${sek(baseline, decimals)} kr`}
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{
            left: `${Math.min(100, (baseline / max) * 100)}%`,
            background: 'var(--viz-ink-3)',
            opacity: edited ? 0.65 : 0,
          }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Vårt pris för ${label}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${sek(value, decimals)} kronor per styck`}
          onKeyDown={onKeyDown}
          className="absolute bottom-[4px] left-0 top-[4px] rounded-[3px_4px_4px_3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: `${Math.min(100, (value / max) * 100)}%`,
            minWidth: 2,
            background: belowCost ? 'var(--viz-flag)' : 'var(--viz-s1)',
            outlineColor: 'var(--viz-ink)',
          }}
        >
          <span
            aria-hidden
            className="absolute -right-px bottom-[-4px] top-[-4px] w-[3px] rounded-[2px]"
            style={{ background: 'var(--viz-ink)', opacity: dragging ? 1 : 0.55 }}
          />
        </div>
      </div>

      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: belowCost ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
      >
        {sek(value, decimals)} kr
        <span className="block text-[10px]" style={{ color: 'var(--viz-ink-3)' }}>
          {margin === null
            ? edited
              ? `${diff > 0 ? '+' : ''}${sek(diff, decimals)} kr`
              : 'inget inköpspris'
            : `${sek(margin, 0)} % marg.`}
        </span>
      </span>
    </div>
  );
}

/**
 * Inköpsvillkoren för en variant, handskrivna.
 *
 * Franzéns artikelfil bär det listade priset. Det vi faktiskt betalar är
 * förhandlat och ligger bara bakom deras inloggning — ingen import kan hämta
 * hit det, så det skrivs in här. Är fältet ifyllt är det priset som gäller för
 * marginalen i graferna ovanför; tomrensar man det faller allt tillbaka på
 * artikelfilen igen. Det är också vägen in för de varianter som står som
 * "obelagd hos Franzén" och därför saknar inköpspris helt.
 *
 * "Beställes i" är hur många vi tar hem per omgång. Det påverkar ingenting i
 * kassan — kundens steg är `orderIncrement` på samma rad, ett annat tal.
 */
function SupplierTerms({ variant, decimals }: { variant: VariantPricingVariant; decimals: number }) {
  const router = useRouter();
  const saved = {
    cost: negotiatedCostOf(variant),
    batch: variant.purchaseBatchSize,
  };
  const [cost, setCost] = useState(saved.cost === null ? '' : String(saved.cost));
  const [batch, setBatch] = useState(saved.batch === null ? '' : String(saved.batch));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listCost = listCostOf(variant.sku);
  const article = articleForSku(variant.sku);

  // Tomt fält betyder "inget angivet", alltså null — inte noll kronor.
  const parsed = (raw: string): number | null | undefined => {
    const trimmed = raw.trim().replace(',', '.');
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? num : undefined;
  };

  const costValue = parsed(cost);
  const batchValue = parsed(batch);
  const costMinor =
    costValue === undefined ? undefined : costValue === null ? null : Math.round(costValue * 100);
  const batchInt =
    batchValue === undefined ? undefined : batchValue === null ? null : Math.round(batchValue);
  const dirty = costMinor !== variant.supplierCostMinor || batchInt !== variant.purchaseBatchSize;

  const save = async () => {
    if (costValue === undefined) return setError('Inköpspriset måste vara ett tal.');
    if (batchValue === undefined) return setError('Beställningsposten måste vara ett tal.');
    if (batchValue !== null && batchValue < 1) return setError('Beställningsposten måste vara minst 1.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/variants/${variant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierCostMinor: costMinor, purchaseBatchSize: batchInt }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Kunde inte spara inköpsvillkoren.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara inköpsvillkoren.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-[104px] rounded-[3px] border px-2 py-1 text-right font-mono text-[12px] tabular-nums';
  const fieldStyle = {
    background: 'var(--viz-surface)',
    borderColor: 'var(--viz-rule)',
    color: 'var(--viz-ink)',
  };

  return (
    <div className={ROW}>
      <span
        className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        Inköp hos Franzén
        <span className="block text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          {article ? `art. ${article.artikelkod}` : 'ingen artikel'}
        </span>
      </span>

      <div className="col-span-2 flex flex-wrap items-end gap-x-4 gap-y-2 max-[620px]:col-span-full">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] leading-none" style={{ color: 'var(--viz-ink-3)' }}>
            Förmånligt inköpspris från Franzén
          </span>
          <span className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder={listCost === null ? '—' : sek(listCost, decimals)}
              aria-label={`Förmånligt inköpspris från Franzén för ${variant.sku}, kronor per styck`}
              className={field}
              style={fieldStyle}
            />
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
              kr/st
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] leading-none" style={{ color: 'var(--viz-ink-3)' }}>
            Beställes i
          </span>
          <span className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={batch}
              onChange={e => setBatch(e.target.value)}
              placeholder={article?.antalPerFörp ? String(article.antalPerFörp) : '—'}
              aria-label={`Beställes i, antal per omgång för ${variant.sku}`}
              className={field}
              style={fieldStyle}
            />
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
              st/omg.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-sm border px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] disabled:opacity-35"
          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
          title="Sparas på varianten. Priset används för marginalen i graferna ovanför."
        >
          {busy ? 'Sparar…' : 'Spara'}
        </button>

        <span className="text-[10.5px] leading-snug" style={{ color: 'var(--viz-ink-3)' }}>
          {saved.cost !== null && listCost !== null
            ? `Artikelfilen säger ${sek(listCost, decimals)} kr — ${
                saved.cost < listCost
                  ? `${sek(listCost - saved.cost, decimals)} kr bättre`
                  : saved.cost > listCost
                    ? `${sek(saved.cost - listCost, decimals)} kr sämre`
                    : 'samma pris'
              }.`
            : listCost !== null
              ? `Tomt fält = artikelfilens ${sek(listCost, decimals)} kr gäller.`
              : 'Varianten saknar pris i artikelfilen — fyll i det förhandlade här.'}
          {article?.antalPerFörp ? ` Franzéns förpackning: ${article.antalPerFörp} st.` : ''}
        </span>

        {error && (
          <span role="alert" className="text-[11.5px]" style={{ color: 'var(--viz-flag)' }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** Ett block per variant: reglage, inköpspris, marknaden, allas bud. */
function VariantBlock({
  variant,
  price,
  onPrice,
  members,
  applyingBid,
  onApplyBid,
  showTip,
  hideTip,
}: {
  variant: VariantPricingVariant;
  price: number;
  onPrice: (next: number) => void;
  members: Member[];
  /** `sku:användare` för det bud som just nu skrivs till katalogen. */
  applyingBid: string | null;
  onApplyBid: (variant: VariantPricingVariant, memberUser: string, priceSek: number) => void;
  showTip: (
    e: React.MouseEvent | React.FocusEvent,
    next: { title: string; rows: string[]; note: string }
  ) => void;
  hideTip: () => void;
}) {
  const cost = costOf(variant);
  const negotiated = negotiatedCostOf(variant);
  const listCost = listCostOf(variant.sku);
  const market = marketOf(variant.sku);
  const baseline = liveOf(variant);
  const primary = primaryOf(market);

  const max = scaleMaxOf([
    baseline,
    cost ?? 0,
    ...market.map(m => m.priceSek),
    ...members.map(m => m.prices[variant.sku]).filter((v): v is number => typeof v === 'number'),
  ]);
  const decimals = max > 40 ? 0 : 2;
  const edited = price !== baseline;

  const indexPct = primary ? (price / primary.priceSek) * 100 : null;

  return (
    <div className="flex flex-col gap-[9px]">
      <div
        className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b pb-1.5"
        style={{ borderColor: 'var(--viz-grid)' }}
      >
        <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
          {optionLabel(variant)}
        </span>
        <span className="text-[12px]" style={{ color: 'var(--viz-ink-3)' }}>
          {variant.sku}
        </span>
        {cost === null && (
          <span
            className="rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
            title="Varianten är inte belagd mot någon artikel i Franzéns fil — vi vet inte vad den kostar oss."
          >
            obelagd hos Franzén
          </span>
        )}
        {indexPct !== null && (
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.06em]"
            style={{ color: indexPct > 100 ? 'var(--viz-flag)' : 'var(--viz-ink-3)' }}
            title={`Mot ${primary!.vendor} ${primary!.product}, ${sek(primary!.priceSek, decimals)} kr`}
          >
            {Math.round(indexPct) === 100
              ? 'samma pris som marknaden'
              : indexPct > 100
                ? `${Math.round(indexPct - 100)} % dyrare än ${primary!.vendor}`
                : `${Math.round(100 - indexPct)} % billigare än ${primary!.vendor}`}
          </span>
        )}
      </div>

      <PriceSlider
        label="Vårt pris"
        value={price}
        baseline={baseline}
        cost={cost}
        max={max}
        step={stepOf(max)}
        decimals={decimals}
        edited={edited}
        onChange={onPrice}
        onReset={() => onPrice(baseline)}
      />

      {cost !== null && (
        <Bar
          label={negotiated === null ? 'Vårt inköpspris' : 'Vårt inköpspris (förmånligt)'}
          sub={articleForSku(variant.sku)?.artikelkod}
          value={cost}
          varName={SERIES.cost.varName}
          max={max}
          decimals={decimals}
          showTip={showTip}
          hideTip={hideTip}
          tip={{
            title: `Franzén — ${articleForSku(variant.sku)?.benämning ?? variant.sku}`,
            rows: [
              negotiated === null
                ? `${sek(cost, decimals)} kr/st ur artikelfilen, exkl. inkommande frakt`
                : `${sek(cost, decimals)} kr/st — förmånligt pris, inskrivet för hand`,
              negotiated !== null && listCost !== null
                ? `Artikelfilens inköpspris är ${sek(listCost, decimals)} kr`
                : `Franzéns listpris ${sek(articleForSku(variant.sku)?.grundpris ?? 0, 0)} kr, rek. utpris ${sek(articleForSku(variant.sku)?.rekUtpris ?? 0, 0)} kr`,
              `Vid ${sek(price, decimals)} kr blir marginalen ${sek(marginPct(price, cost) ?? 0, 0)} %`,
              variant.purchaseBatchSize
                ? `Beställes i poster om ${variant.purchaseBatchSize} st`
                : 'Ingen beställningspost angiven',
            ],
            note:
              'Inköpspriset saknar frakten in till oss, så den verkliga marginalen är något ' +
              'lägre än den som står här.',
          }}
        />
      )}

      <SupplierTerms variant={variant} decimals={decimals} />

      {market.map(row => {
        const diff = price - row.priceSek;
        return (
          <Bar
            key={`${row.vendor}-${row.product}-${row.size}`}
            label={
              <>
                {row.vendor} · {row.product}
                {row.sameArticle && (
                  <span
                    className="ml-1.5 rounded-sm border px-1 py-px align-middle font-mono text-[9px] uppercase tracking-[0.06em]"
                    style={{ borderColor: 'var(--viz-flag)', color: 'var(--viz-flag)' }}
                    title="Leverantören säljer exakt den artikel vi köper av Franzén."
                  >
                    samma artikel
                  </span>
                )}
              </>
            }
            sub={row.match === 'approx' ? `${row.size} — ${row.caveat ?? 'närmaste motsvarighet'}` : undefined}
            value={row.priceSek}
            varName={SERIES[row.channel].varName}
            max={max}
            decimals={decimals}
            flag={row.sameArticle}
            showTip={showTip}
            hideTip={hideTip}
            tip={{
              title: `${row.vendor} — ${row.product}`,
              rows: [
                `${sek(row.priceSek, 2)} kr/st, ${BASIS_LABEL[row.basis]}`,
                `${row.spec} · ${row.size}`,
                diff === 0
                  ? 'Samma som priset du satt nu'
                  : `${diff > 0 ? '+' : ''}${sek(diff, decimals)} kr mot priset du satt nu`,
              ],
              note:
                row.caveat ??
                (row.sameArticle
                  ? 'Exakt vår artikel — inte en jämförbar produkt.'
                  : row.channel === 'b2c'
                    ? 'Konsumentpris, som referens.'
                    : 'Jämförelseprodukt.'),
            }}
          />
        );
      })}

      {market.length === 0 && (
        <div className="grid grid-cols-[196px_1fr] gap-3 max-[620px]:grid-cols-1">
          <span />
          <span className="text-[11.5px] leading-snug" style={{ color: 'var(--viz-ink-3)' }}>
            Ingen av de fem leverantörerna säljer den här varianten, inte ens ungefärligt — se
            kommentaren i franzenCompetitorPrices.ts. Sätt priset mot variantens systrar ovanför.
          </span>
        </div>
      )}

      {members.map(m => {
        const bid = m.prices[variant.sku];
        if (typeof bid !== 'number') return null;
        const busy = applyingBid === `${variant.sku}:${m.user}`;
        return (
          <div key={m.user} className="flex items-center gap-2">
            <div className="flex-1">
              <Bar
                label={`${m.user}s förslag`}
                value={bid}
                varName={m.varName}
                max={max}
                decimals={decimals}
                showTip={showTip}
                hideTip={hideTip}
                tip={{
                  title: `${m.user}s förslag`,
                  rows: [
                    `${sek(bid, decimals)} kr/st`,
                    cost === null
                      ? 'Ingen känd inköpskostnad att räkna marginal på'
                      : `${sek(marginPct(bid, cost) ?? 0, 0)} % marginal mot ${sek(cost, decimals)} kr inköp`,
                    m.label ? `«${m.label}»` : `Sparat ${fmtWhen(m.updatedAt ?? m.createdAt)}`,
                  ],
                  note:
                    'Läs in hela förslaget med «Använd» i panelen ovanför, eller sätt bara den ' +
                    'här varianten med «Sätt».',
                }}
              />
            </div>
            {/* Till skillnad från «Använd» (som bara flyttar reglaget) skriver
                den här knappen budet till katalogen för just den varianten. */}
            <button
              type="button"
              onClick={() => onApplyBid(variant, m.user, bid)}
              disabled={busy || bid === baseline}
              className="shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em] disabled:opacity-40"
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
              title={
                bid === baseline
                  ? `${m.user}s förslag är redan variantens pris.`
                  : `Sätt ${optionLabel(variant)} till ${sek(bid, decimals)} kr — ${m.user}s förslag`
              }
            >
              {busy ? 'Sätter…' : 'Sätt'}
            </button>
          </div>
        );
      })}

      <VariantAxis max={max} />
    </div>
  );
}

/** Produktkortets bild — samma ruta kunden ser i butiken. */
function ProductThumb({ product }: { product: VariantPricingProduct }) {
  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-[3px]"
      style={{ background: 'var(--viz-plane)', border: '1px solid var(--viz-rule)' }}
    >
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.imageAlt ?? product.title}
          fill
          sizes="(min-width: 640px) 160px, 45vw"
          className="object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center text-[10.5px] uppercase tracking-[0.08em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Ingen bild
        </div>
      )}
    </div>
  );
}

export default function FranzenPricing({
  user,
  products,
}: {
  user: AdminUser | null;
  products: VariantPricingProduct[];
}) {
  const router = useRouter();
  const { tip, showTip, hideTip } = useTip();

  const allVariants = products.flatMap(p => p.variants);

  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(allVariants.map(v => [v.sku, liveOf(v)]))
  );
  const [selectedId, setSelectedId] = useState<number | null>(products[0]?.id ?? null);
  const [suggestions, setSuggestions] = useState<StoredSuggestion[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [hiddenMembers, setHiddenMembers] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyingBid, setApplyingBid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members: Member[] = suggestions
    .slice()
    .sort((a, b) => a.user.localeCompare(b.user, 'sv'))
    .map((s, i) => ({ ...s, varName: memberVar(i), hidden: hiddenMembers.includes(s.user) }));
  const visibleMembers = members.filter(m => !m.hidden);
  const mine = members.find(m => m.user === user) ?? null;

  const priceOf = (v: VariantPricingVariant) => prices[v.sku] ?? liveOf(v);
  const isEdited = (v: VariantPricingVariant) => priceOf(v) !== liveOf(v);
  const editedVariants = allVariants.filter(isEdited);

  const loadSuggestions = async () => {
    const response = await fetch('/api/admin/suggestions?scope=franzen');
    if (!response.ok) return;
    const body = await response.json();
    setSuggestions(body.suggestions ?? []);
    setSuggestionsLoaded(true);
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const saveSuggestion = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    const response = await fetch('/api/admin/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'franzen', prices, label: label.trim() || null }),
    });
    if (response.ok) {
      setLabel('');
      await loadSuggestions();
    } else {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Kunde inte spara förslaget.');
    }
    setSaving(false);
  };

  const removeSuggestion = async () => {
    if (!mine) return;
    setRemoving(true);
    setError(null);
    const response = await fetch('/api/admin/suggestions?scope=franzen', { method: 'DELETE' });
    if (response.ok) await loadSuggestions();
    else {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? 'Kunde inte ta bort förslaget.');
    }
    setRemoving(false);
  };

  /**
   * Skriver de dragna priserna till katalogen, en variant i taget. Till
   * skillnad från att spara ett förslag ändrar det här priset kunden ser.
   */
  const applyPrices = async () => {
    if (!editedVariants.length) return;
    const ok = window.confirm(
      `Sätt ${editedVariants.length === 1 ? 'nytt pris' : `${editedVariants.length} nya priser`}?\n\n` +
        editedVariants
          .map(v => `${v.sku}: ${sek(liveOf(v), 0)} → ${sek(priceOf(v), 0)} kr`)
          .join('\n') +
        '\n\nDet här ändrar priset kunden ser.'
    );
    if (!ok) return;

    setApplying(true);
    setError(null);
    try {
      for (const v of editedVariants) {
        const response = await fetch(`/api/admin/variants/${v.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceMinor: Math.round(priceOf(v) * 100) }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Kunde inte sätta priset för ${v.sku}.`);
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte sätta priserna.');
    } finally {
      setApplying(false);
    }
  };

  /**
   * Skriver en enskild persons bud för en variant rakt till katalogen. Samma
   * knapp som i prisbilden för egna produkter, men per variant i stället för
   * per produkt — Franzén-sortimentet prissätts storlek för storlek.
   */
  const applyMemberPrice = async (
    variant: VariantPricingVariant,
    memberUser: string,
    priceSek: number
  ) => {
    const ok = window.confirm(
      `Sätt priset för ${optionLabel(variant)} (${variant.sku}) till ${sek(priceSek, 2)} kr ` +
        `(${memberUser}s förslag)?\n\n` +
        `Nuvarande pris: ${sek(liveOf(variant), 2)} kr. Det här ändrar priset kunden ser.`
    );
    if (!ok) return;

    setApplyingBid(`${variant.sku}:${memberUser}`);
    setError(null);
    try {
      const response = await fetch(`/api/admin/variants/${variant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceMinor: Math.round(priceSek * 100) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Kunde inte sätta priset för ${variant.sku}.`);
      }
      // Reglaget ska stämma med det pris som nu faktiskt gäller.
      setPrices(prev => ({ ...prev, [variant.sku]: priceSek }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Kunde inte sätta priset för ${variant.sku}.`);
    } finally {
      setApplyingBid(null);
    }
  };

  const chip =
    'rounded-sm border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-opacity disabled:opacity-35';

  const selected = products.find(p => p.id === selectedId) ?? null;

  if (!products.length) return null;

  return (
    <Card
      title="Vad andra tar för Franzéns produkter"
      sub="En produkt i taget: varje variant får ett eget dragbart pris, med vårt inköpspris från Franzén under sig och de fem leverantörernas motsvarigheter under det. Reglaget ändrar ingenting förrän du sparar ett förslag eller sätter priserna."
      note={
        <>
          Läget skiljer sig från våra egna produkter på en avgörande punkt.{' '}
          <b>Här säljer konkurrenten i flera fall exakt samma artikel som vi köper.</b> Sovtex för
          Textilgruppens och Borganäs egna varor rakt till slutkund — Nevada-handduken 50 × 70,
          satinrandspåslakanet 150 × 230, hotellmorgonrocken och våffelrocken är samma artikelnummer
          som står på vår faktura. Där kan vi inte hänvisa till att vår produkt är bättre; det finns
          bara pris, kanal och service att argumentera med. De raderna är rödmarkerade.
        </>
      }
    >
      <Legend
        items={[SERIES.cost, SERIES.ours, ...visibleMembers.map(m => ({ label: `${m.user}s förslag`, varName: m.varName })), SERIES.b2b, SERIES.b2c]}
      />

      {/* Förslagspanelen: spara sitt eget bud, se och läsa in andras. */}
      <div
        className="flex flex-col gap-3 rounded-[3px] border px-4 py-3.5"
        style={{ borderColor: 'var(--viz-rule)', background: 'var(--viz-plane)' }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={mine?.label ?? (user ? `${user}s Franzén-förslag …` : 'Förslag …')}
            maxLength={120}
            className="min-w-[160px] flex-1 rounded-[3px] border px-2.5 py-1.5 text-[13px]"
            style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
          />
          <button
            type="button"
            disabled={!user || !editedVariants.length || saving}
            onClick={saveSuggestion}
            className={chip}
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
            title={
              !user
                ? 'Logga in för att spara ett förslag.'
                : !editedVariants.length
                  ? 'Dra i minst ett pris innan du sparar.'
                  : mine
                    ? 'Skriver över ditt nuvarande Franzén-förslag.'
                    : undefined
            }
          >
            {saving ? 'Sparar…' : mine ? 'Uppdatera mitt förslag' : `Spara som ${user ?? '…'}s förslag`}
          </button>
          <button
            type="button"
            disabled={!editedVariants.length || applying}
            onClick={applyPrices}
            className={chip}
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
            title="Skriver de dragna priserna till katalogen — det kunden ser."
          >
            {applying
              ? 'Sätter…'
              : `Sätt ${editedVariants.length || ''} ${editedVariants.length === 1 ? 'pris' : 'priser'}`.trim()}
          </button>
          {!!editedVariants.length && (
            <button
              type="button"
              onClick={() => setPrices(Object.fromEntries(allVariants.map(v => [v.sku, liveOf(v)])))}
              className={chip}
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
            >
              Återställ
            </button>
          )}
          {mine && (
            <button
              type="button"
              disabled={removing}
              onClick={removeSuggestion}
              className={chip}
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-flag)' }}
            >
              {removing ? 'Tar bort…' : 'Ta bort mitt'}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
            {error}
          </p>
        )}

        {suggestionsLoaded && members.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--viz-grid)' }}>
            <span
              className="font-mono text-[10.5px] uppercase tracking-[0.1em]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              Levande förslag ({members.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {members.map(m => (
                <span
                  key={m.user}
                  className="inline-flex items-center gap-2 rounded-[3px] border px-2.5 py-1.5 text-[12.5px]"
                  style={{
                    borderColor: 'var(--viz-rule)',
                    background: 'var(--viz-surface)',
                    opacity: m.hidden ? 0.5 : 1,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setHiddenMembers(prev =>
                        prev.includes(m.user) ? prev.filter(n => n !== m.user) : [...prev, m.user]
                      )
                    }
                    aria-pressed={!m.hidden}
                    title={m.hidden ? `Visa ${m.user}s förslag` : `Dölj ${m.user}s förslag`}
                    className="inline-flex items-center gap-1.5"
                    style={{ color: 'var(--viz-ink)' }}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-[9px] w-[9px] shrink-0 rounded-sm"
                      style={{
                        background: m.hidden ? 'transparent' : `var(${m.varName})`,
                        boxShadow: m.hidden ? `inset 0 0 0 1px var(${m.varName})` : undefined,
                      }}
                    />
                    <b className="font-semibold">{m.user}</b>
                    {m.user === user && <span style={{ color: 'var(--viz-ink-3)' }}>(du)</span>}
                  </button>
                  <span style={{ color: 'var(--viz-ink-3)' }}>{fmtWhen(m.updatedAt ?? m.createdAt)}</span>
                  <button
                    type="button"
                    onClick={() => setPrices(prev => ({ ...prev, ...m.prices }))}
                    className="rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em]"
                    style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
                    title={`Läs in ${m.user}s priser i reglagen`}
                  >
                    Använd
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Ett kort per produkt. Bara ett öppet i taget — reglagen behöver bredden. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {products.map(product => {
          const values = product.variants.map(liveOf);
          const min = Math.min(...values);
          const max = Math.max(...values);
          const editedHere = product.variants.filter(isEdited).length;
          const isSelected = product.id === selectedId;
          return (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedId(isSelected ? null : product.id)}
              aria-pressed={isSelected}
              className="flex flex-col gap-2 rounded-[3px] p-2 text-left"
              style={{
                outline: `1.5px solid ${isSelected ? 'var(--viz-s1)' : 'var(--viz-rule)'}`,
                background: isSelected ? 'var(--viz-plane)' : 'transparent',
              }}
            >
              <ProductThumb product={product} />
              <span className="flex flex-col gap-0.5">
                <span className="text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--viz-ink)' }}>
                  {product.title}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--viz-ink-3)' }}>
                  {product.variants.length} {product.variants.length === 1 ? 'variant' : 'varianter'} ·{' '}
                  {min === max ? `${sek(min, 0)} kr` : `${sek(min, 0)}–${sek(max, 0)} kr`}
                </span>
                {editedHere > 0 && (
                  <span className="text-[10.5px]" style={{ color: 'var(--viz-s1)' }}>
                    {editedHere} ändrad{editedHere === 1 ? '' : 'e'}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="flex flex-col gap-6 rounded-[3px] border px-4 py-4"
          style={{ borderColor: 'var(--viz-rule)', background: 'var(--viz-plane)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
              {selected.title}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-sm border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em]"
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
            >
              Stäng
            </button>
          </div>

          {selected.variants.map(variant => (
            <VariantBlock
              key={variant.id}
              variant={variant}
              price={priceOf(variant)}
              onPrice={next => setPrices(prev => ({ ...prev, [variant.sku]: Math.max(0, next) }))}
              members={visibleMembers}
              applyingBid={applyingBid}
              onApplyBid={applyMemberPrice}
              showTip={showTip}
              hideTip={hideTip}
            />
          ))}
        </div>
      )}

      <Tooltip tip={tip} />
    </Card>
  );
}
