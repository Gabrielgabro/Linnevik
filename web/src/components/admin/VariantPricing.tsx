'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BASIS_LABEL,
  collectedAt,
  competitorProducts,
  eurSek,
  type Basis,
  type Channel,
  variantCompetitors,
} from '@/data/competitorPrices';
import { landedPerPcs, products as landedProducts } from '@/data/landedCost';
import type { AdminUser } from '@/lib/adminAuth';
import type { VariantPricingProduct, VariantPricingVariant } from '@/lib/productsDb';
import { Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

/**
 * Prisbilden för våra egna produkter — per variant, inte per produkt.
 *
 * Den här vyn ersätter den gamla "Vad marknaden tar för motsvarande produkt",
 * som satte ett pris per produkt och därför bara kunde visa en jämförelse per
 * produkt. Det räckte inte: Täcke Sebastian finns i två storlekar och två
 * duntyper, och 150×200 och 220×200 möter inte samma marknad. Allt som fanns
 * där — landad kostnad, konkurrentfältet, allas sparade bud, källtabellen —
 * ligger nu under den variant det gäller.
 *
 * Två saker är per produkt och inte per variant, och det syns i gränssnittet:
 *
 *   - **Landad kostnad.** Prisanalysen (sändning HTL26-01) har en rad per
 *     produkt, inte per storlek. Samma kostnad ritas därför under varje variant
 *     av produkten, märkt med vilken storlek den faktiskt är räknad på. En
 *     220×200 kostar mer än en 150×200 att tillverka och frakta — marginalen på
 *     den större varianten är alltså optimistisk, inte exakt.
 *   - **Gamla bud.** Förslag sparade före den här vyn är nycklade på SKU-prefix
 *     (`TAC-SEB`), inte på variant-SKU. De visas fortfarande, på varje variant
 *     av produkten, och märks som produktbud i tooltipen. Nästa sparning från
 *     den här vyn skriver per variant och tar över.
 *
 * Reglaget skriver till katalogen per variant via /api/admin/variants/[id].
 */

const SERIES = {
  landed: { label: 'Landad kostnad', varName: '--viz-s3' },
  ours: { label: 'Vårt pris (dra för att ändra)', varName: '--viz-s1' },
  b2b: { label: 'B2B-konkurrent', varName: '--viz-s2' },
  b2c: { label: 'B2C-referens', varName: '--viz-ink-3' },
} as const;

/**
 * En färg per person. Tilldelas efter namnordning och inte efter inloggad
 * användare, så att Johans stapel har samma färg oavsett vem som tittar.
 */
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

/**
 * Prisanalysens rad för en variant. Nycklas på SKU-prefix, längsta först, så
 * att `KUD-SIG` inte kan tas för `KUD-ERI` — samma regel som
 * landedCostLookup.ts på serversidan.
 */
const byPrefixDesc = [...landedProducts].sort((a, b) => b.skuPrefix.length - a.skuPrefix.length);

const landedRowForSku = (sku: string) => byPrefixDesc.find(p => sku.startsWith(p.skuPrefix)) ?? null;

/** Landad kostnad per styck för varianten, eller null när produkten är obelagd. */
const costOf = (sku: string) => {
  const row = landedRowForSku(sku);
  return row ? landedPerPcs(row) : null;
};

const marginPct = (price: number, cost: number | null) =>
  cost === null || price <= 0 ? null : ((price - cost) / price) * 100;

const digitsOf = (s: string): string[] => s.match(/\d+/g) ?? [];

/**
 * Jämför "160" mot "160 × 200" lika gärna som "50 x 70" mot "50 × 70" — vår
 * databas anger ibland bara bredden, konkurrentdatan anger alltid hela måttet.
 */
const sizesMatch = (a: string, b: string) => {
  const da = digitsOf(a);
  const db = digitsOf(b);
  const short = da.length <= db.length ? da : db;
  const long = da.length <= db.length ? db : da;
  return short.length > 0 && short.every(d => long.includes(d));
};

const CHANNEL = {
  b2b: SERIES.b2b,
  b2c: SERIES.b2c,
} as const;

/** En marknadsrad att rita som stapel bredvid variantens eget pris. */
type MarketRow = {
  id: string;
  vendor: string;
  product: string;
  spec?: string;
  size: string;
  priceSek: number;
  channel: Channel;
  basis: Basis;
  url: string;
  match: 'exact' | 'approx';
  /** Sant för den rad vi bedömt vara närmast likvärdig — indexet räknas mot den. */
  primary?: boolean;
  caveat?: string;
};

/**
 * Marknadens jämförelseprodukter för en specifik variant — alla, inte bara den
 * primära. Slår upp `sku` i `variantCompetitors` (storlekar utanför
 * sändningsanalysen) och faller annars tillbaka på produktens vanliga
 * jämförelse i `competitorPrices.ts`, om variantens storlek stämmer med den.
 * Tom lista betyder att underlaget saknar den här storleken helt — se
 * kommentarerna i competitorPrices.ts för vilka det gäller.
 */
const marketRowsFor = (handle: string, variant: VariantPricingVariant): MarketRow[] => {
  const perVariant = variantCompetitors[variant.sku];
  if (perVariant?.length) {
    return perVariant.map(c => ({
      id: `${variant.sku}-${c.vendor}-${c.product}-${c.size}`,
      vendor: c.vendor,
      product: c.product,
      size: c.size,
      priceSek: c.priceSek,
      channel: c.channel,
      basis: c.basis,
      url: c.url,
      match: c.match,
      primary: c.primary,
      caveat: c.caveat,
    }));
  }

  const landed = landedProducts.find(p => p.handle === handle);
  const product = landed ? competitorProducts.find(p => p.skuPrefix === landed.skuPrefix) : undefined;
  if (!product) return [];

  // Utan storleksoption, eller med en storlek analysen inte gäller, visas
  // ingenting hellre än fel marknad. Varianter som saknar option men har en
  // egen storlek täcks av `variantCompetitors` ovanför (t.ex. KSK-6090X).
  const ourSize = variant.optionValues.find(o => o.name.trim().toLowerCase().includes('storlek'))?.value;
  if (!ourSize || !sizesMatch(ourSize, product.ourSize)) return [];

  return product.competitors.map(c => ({
    id: `${variant.sku}-${c.vendor}-${c.product}-${c.size}`,
    vendor: c.vendor,
    product: c.product,
    spec: c.spec,
    size: c.size,
    priceSek: c.priceSek,
    channel: c.channel,
    basis: c.basis,
    url: c.url,
    match: 'exact' as const,
    primary: c.primary,
    caveat: c.caveat,
  }));
};

/** Referensraden ett index räknas mot: den märkta, annars den billigaste B2B. */
const primaryOf = (rows: MarketRow[]) =>
  rows.find(r => r.primary) ?? rows.find(r => r.channel === 'b2b') ?? rows[0] ?? null;

/** Billigaste B2B-alternativet — den prispunkt en inköpare faktiskt kan välja. */
const floorOfRows = (rows: MarketRow[]) => {
  const b2b = rows.filter(r => r.channel === 'b2b');
  return b2b.length ? b2b.reduce((lo, r) => (r.priceSek < lo.priceSek ? r : lo)) : null;
};

/**
 * En persons bud för en variant. Faller tillbaka på produktbudet när personen
 * sparade innan den här vyn fanns — se filkommentaren.
 */
const bidFor = (member: Member, sku: string): { value: number; perVariant: boolean } | null => {
  const exact = member.prices[sku];
  if (typeof exact === 'number') return { value: exact, perVariant: true };
  const row = landedRowForSku(sku);
  const legacy = row ? member.prices[row.skuPrefix] : undefined;
  return typeof legacy === 'number' ? { value: legacy, perVariant: false } : null;
};

/**
 * Skalans tak låses till underlaget — landad kostnad, nuvarande pris, marknaden
 * och allas bud — inte till det som dras. Annars hoppar alla staplar i sidled
 * så fort man rör reglaget och varianterna går inte att jämföra med varandra.
 */
const scaleMaxOf = (values: number[]) => {
  const raw = Math.max(...values.filter(v => Number.isFinite(v)), 1) * 1.25;
  const step = raw > 400 ? 100 : raw > 100 ? 25 : raw > 20 ? 5 : 1;
  return Math.ceil(raw / step) * step;
};

const stepOf = (max: number) => (max > 400 ? 5 : max > 40 ? 1 : 0.5);

const ROW =
  'grid grid-cols-[196px_1fr_104px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1';

function VariantAxis({ max, decimals }: { max: number; decimals: number }) {
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
            {sek(t, decimals)}
          </i>
        ))}
      </div>
      <span className="pt-[3px] font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        kr/st
      </span>
    </div>
  );
}

/** En passiv stapel: landad kostnad, konkurrentpris eller någons sparade bud. */
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
  emphasis,
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
  emphasis?: boolean;
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
            boxShadow: emphasis ? 'inset 0 0 0 1.5px var(--viz-ink)' : undefined,
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
 * Variantens eget pris som dragbart reglage, med landad kostnad som golv.
 * Under kostnaden blir stapeln röd — det är inte förbjudet att dra dit, men det
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
        {/* Landad kostnad — under den här linjen säljer vi med förlust. */}
        {cost !== null && (
          <span
            aria-hidden
            title={`Landad kostnad ${sek(cost, decimals)} kr`}
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
          aria-valuetext={`${sek(value, decimals)} kronor per styck${
            margin === null ? '' : `, ${sek(margin, 0)} procent bruttomarginal`
          }`}
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
              : 'ingen känd kostnad'
            : `${sek(margin, 0)} % marg.`}
        </span>
      </span>
    </div>
  );
}

/** Ett block per variant: reglage, landad kostnad, marknaden, allas bud, källor. */
function VariantBlock({
  handle,
  variant,
  price,
  onPrice,
  members,
  applyingBid,
  onApplyBid,
  showTip,
  hideTip,
}: {
  handle: string;
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
  const landedRow = landedRowForSku(variant.sku);
  const cost = costOf(variant.sku);
  const market = [...marketRowsFor(handle, variant)].sort((a, b) => a.priceSek - b.priceSek);
  const baseline = liveOf(variant);
  const primary = primaryOf(market);
  const floor = floorOfRows(market);

  const analysis = landedRow
    ? competitorProducts.find(p => p.skuPrefix === landedRow.skuPrefix)
    : undefined;

  const max = scaleMaxOf([
    baseline,
    price,
    cost ?? 0,
    ...market.map(m => m.priceSek),
    ...members.map(m => bidFor(m, variant.sku)?.value ?? 0),
  ]);
  const decimals = max > 40 ? 0 : 2;
  const edited = price !== baseline;

  const indexPct = primary ? (price / primary.priceSek) * 100 : null;
  const floorPct = floor ? (price / floor.priceSek) * 100 : null;

  return (
    <div className="flex flex-col gap-[9px]">
      <div
        className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b pb-1.5"
        style={{ borderColor: 'var(--viz-grid)' }}
      >
        <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
          {optionLabel(variant)}
        </span>
        <span className="font-mono text-[12px]" style={{ color: 'var(--viz-ink-3)' }}>
          {variant.sku}
        </span>
        {cost === null && (
          <span
            className="rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
            title="Produkten finns inte i prisanalysen för sändning HTL26-01 — vi vet inte vad den kostar oss."
          >
            ingen landad kostnad
          </span>
        )}
        {indexPct !== null && primary && (
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.06em]"
            style={{ color: indexPct > 100 ? 'var(--viz-flag)' : 'var(--viz-ink-3)' }}
            title={`Mot ${primary.vendor} ${primary.product}, ${sek(primary.priceSek, decimals)} kr`}
          >
            {Math.round(indexPct) === 100
              ? `samma pris som ${primary.vendor}`
              : indexPct > 100
                ? `${Math.round(indexPct - 100)} % dyrare än ${primary.vendor}`
                : `${Math.round(100 - indexPct)} % billigare än ${primary.vendor}`}
          </span>
        )}
        {floorPct !== null && floor && floor.id !== primary?.id && (
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.06em]"
            style={{ color: 'var(--viz-ink-3)' }}
            title={`Billigaste B2B-alternativet: ${floor.vendor} ${floor.product}, ${sek(floor.priceSek, decimals)} kr`}
          >
            {Math.round(floorPct)} % av golvet ({floor.vendor})
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

      {cost !== null && landedRow && (
        <Bar
          label="Landad kostnad"
          sub={analysis ? `räknad på ${analysis.ourSize} cm` : undefined}
          value={cost}
          varName={SERIES.landed.varName}
          max={max}
          decimals={decimals}
          showTip={showTip}
          hideTip={hideTip}
          tip={{
            title: `${landedRow.title} — landad kostnad`,
            rows: [
              `${sek(cost, 2)} kr/st: ${sek(landedRow.goodsPerPcs, 2)} vara + ${sek(landedRow.freightPerPcs, 2)} frakt + ${sek(landedRow.dutyPerPcs, 2)} tull`,
              `Vid ${sek(price, decimals)} kr blir marginalen ${sek(marginPct(price, cost) ?? 0, 0)} %`,
              `${sek(price - cost, decimals)} kr täckningsbidrag per styck`,
            ],
            note:
              'Kostnaden är räknad per produkt i sändning HTL26-01, inte per storlek' +
              (analysis ? ` — underlaget avser ${analysis.ourSize} cm.` : '.') +
              ' En större variant kostar mer att tillverka och frakta, så marginalen här är i så fall optimistisk.',
          }}
        />
      )}

      {market.map(row => {
        const diff = price - row.priceSek;
        return (
          <Bar
            key={row.id}
            label={
              <>
                {row.vendor} · {row.product}
                {row.primary && (
                  <span
                    className="ml-1.5 rounded-sm border px-1 py-px align-middle font-mono text-[9px] uppercase tracking-[0.06em]"
                    style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    title="Den produkt vi bedömt vara närmast likvärdig — indexet i rubriken räknas mot den."
                  >
                    motsvarighet
                  </span>
                )}
              </>
            }
            sub={
              row.match === 'approx'
                ? `${row.size} — ${row.caveat ?? 'närmaste storlek'}`
                : `${row.spec ? `${row.spec} · ` : ''}${row.size} cm`
            }
            value={row.priceSek}
            varName={CHANNEL[row.channel].varName}
            max={max}
            decimals={decimals}
            emphasis={row.primary}
            showTip={showTip}
            hideTip={hideTip}
            tip={{
              title: `${row.vendor} — ${row.product}`,
              rows: [
                `${sek(row.priceSek, 2)} kr/st, ${BASIS_LABEL[row.basis]}`,
                `${row.spec ? `${row.spec} · ` : ''}${row.size} cm${
                  row.match === 'approx' ? ' (närmaste storlek)' : ''
                }`,
                diff === 0
                  ? 'Samma som priset du satt nu'
                  : `${diff > 0 ? '+' : ''}${sek(diff, decimals)} kr mot priset du satt nu`,
              ],
              note:
                row.caveat ??
                (row.primary
                  ? 'Vald som närmaste motsvarighet.'
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
            Ingen av leverantörerna i underlaget säljer den här storleken, inte ens ungefärligt — se
            kommentarerna i competitorPrices.ts. Sätt priset mot variantens systrar ovanför.
          </span>
        </div>
      )}

      {members.map(m => {
        const bid = bidFor(m, variant.sku);
        if (!bid) return null;
        const busy = applyingBid === `${variant.sku}:${m.user}`;
        return (
          <div key={m.user} className="flex items-center gap-2">
            <div className="flex-1">
              <Bar
                label={`${m.user}s förslag`}
                sub={bid.perVariant ? undefined : 'produktbud, före variantvyn'}
                value={bid.value}
                varName={m.varName}
                max={max}
                decimals={decimals}
                showTip={showTip}
                hideTip={hideTip}
                tip={{
                  title: `${m.user}s förslag`,
                  rows: [
                    `${sek(bid.value, decimals)} kr/st`,
                    cost === null
                      ? 'Ingen känd landad kostnad att räkna marginal på'
                      : `${sek(marginPct(bid.value, cost) ?? 0, 0)} % marginal mot ${sek(cost, decimals)} kr landad kostnad`,
                    m.label ? `«${m.label}»` : `Sparat ${fmtWhen(m.updatedAt ?? m.createdAt)}`,
                  ],
                  note: bid.perVariant
                    ? 'Läs in hela förslaget med «Använd» i panelen ovanför, eller sätt bara den här varianten med «Sätt».'
                    : 'Sparat per produkt innan den här vyn fanns, och visas därför på alla varianter av produkten. Nästa sparning skriver per variant.',
                }}
              />
            </div>
            {/* Till skillnad från «Använd» (som bara flyttar reglaget) skriver
                den här knappen budet till katalogen för just den varianten. */}
            <button
              type="button"
              onClick={() => onApplyBid(variant, m.user, bid.value)}
              disabled={busy || bid.value === baseline}
              className="shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em] disabled:opacity-40"
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
              title={
                bid.value === baseline
                  ? `${m.user}s förslag är redan variantens pris.`
                  : `Sätt ${optionLabel(variant)} till ${sek(bid.value, decimals)} kr — ${m.user}s förslag`
              }
            >
              {busy ? 'Sätter…' : 'Sätt'}
            </button>
          </div>
        );
      })}

      <VariantAxis max={max} decimals={decimals} />

      {market.length > 0 && <SourceTable rows={market} />}
    </div>
  );
}

/**
 * Källorna bakom variantens staplar. Samma kolumner som den gamla
 * produkttabellen längst ned i prisbilden — leverantör, produkt med länk,
 * specifikation, storlek, kanal och momsbas — men bara raderna som gäller den
 * här varianten. Det är den tabellen som gör en jämförelse granskningsbar:
 * utan länk och momsbas är ett konkurrentpris bara en siffra.
 */
function SourceTable({ rows }: { rows: MarketRow[] }) {
  const [open, setOpen] = useState(false);
  const cell = 'border-b px-2.5 py-1.5';

  return (
    <div className="grid grid-cols-[196px_1fr] gap-3 max-[620px]:grid-cols-1">
      <span className="max-[620px]:hidden" />
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="self-start rounded-sm border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em]"
          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
        >
          {open ? 'Dölj källor' : `Källor (${rows.length})`}
        </button>

        {open && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
              <caption
                className="pb-2 text-left font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: 'var(--viz-ink-3)' }}
              >
                SEK per styck · insamlat {collectedAt} · EUR omräknat till {sek(eurSek, 3)} ·
                &rdquo;exkl.?&rdquo; = leverantören anger inte momsstatus
              </caption>
              <thead>
                <tr>
                  {['Leverantör', 'Produkt', 'Specifikation', 'Storlek', 'Kanal', 'Prisbas', 'Pris'].map(
                    (h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={`whitespace-nowrap border-b px-2.5 py-1.5 font-mono text-[10px] font-normal uppercase tracking-[0.06em] ${
                          i === 6 ? 'text-right' : 'text-left'
                        }`}
                        style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody style={{ color: 'var(--viz-ink)' }}>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className={cell} style={{ borderColor: 'var(--viz-rule)' }}>
                      {row.vendor}
                    </td>
                    <td className={cell} style={{ borderColor: 'var(--viz-rule)' }}>
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {row.product}
                      </a>
                      {row.primary && (
                        <span
                          className="ml-[7px] whitespace-nowrap rounded-sm border px-[5px] py-px font-mono text-[10px] uppercase tracking-[0.06em]"
                          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                        >
                          motsvarighet
                        </span>
                      )}
                    </td>
                    <td className={cell} style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}>
                      {row.spec ?? '—'}
                      {row.caveat && (
                        <span className="block text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
                          {row.caveat}
                        </span>
                      )}
                    </td>
                    <td
                      className={`${cell} whitespace-nowrap tabular-nums`}
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {row.size}
                    </td>
                    <td
                      className={`${cell} font-mono text-[11px] uppercase`}
                      style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                    >
                      {row.channel}
                    </td>
                    <td
                      className={`${cell} whitespace-nowrap font-mono text-[10.5px]`}
                      style={{
                        borderColor: 'var(--viz-rule)',
                        color: row.basis === 'ex-antag' ? 'var(--viz-flag)' : 'var(--viz-ink-3)',
                      }}
                      title={BASIS_LABEL[row.basis]}
                    >
                      {row.basis === 'ex' ? 'exkl.' : row.basis === 'ex-antag' ? 'exkl.?' : 'omräknat'}
                    </td>
                    <td
                      className={`${cell} whitespace-nowrap text-right tabular-nums`}
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      {sek(row.priceSek, 0)} kr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Allas bud sida vid sida, en kolumn per person och en rad per variant.
 *
 * Den här tabellen är poängen med att flera sätter pris: spridningen mellan
 * lägsta och högsta bud säger var vi är oense, och det är de raderna som
 * behöver diskuteras. Rader där alla ligger lika behöver ingen tid alls.
 */
function MemberMatrix({
  products,
  members,
  priceOf,
}: {
  products: VariantPricingProduct[];
  members: Member[];
  priceOf: (v: VariantPricingVariant) => number;
}) {
  if (!members.length) return null;

  const cell = 'whitespace-nowrap border-b px-2.5 py-1.5 text-right font-mono tabular-nums';
  const head =
    'whitespace-nowrap border-b px-2.5 py-2 text-right font-mono text-[10px] font-normal uppercase tracking-[0.06em]';

  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-mono text-[10.5px] uppercase tracking-[0.1em]"
        style={{ color: 'var(--viz-ink-3)' }}
      >
        Vad var och en föreslår · SEK per styck exkl. moms · per variant
      </span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th
                scope="col"
                className={`${head} text-left`}
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
              >
                Variant
              </th>
              <th
                scope="col"
                className={head}
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Landad kostnad per styck, räknad per produkt."
              >
                Landad
              </th>
              {members.map(m => (
                <th
                  key={m.user}
                  scope="col"
                  className={head}
                  style={{ borderColor: 'var(--viz-rule)', color: `var(${m.varName})` }}
                >
                  {m.user}
                </th>
              ))}
              <th
                scope="col"
                className={head}
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Priset du satt med reglaget just nu."
              >
                Ditt reglage
              </th>
              <th
                scope="col"
                className={head}
                style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                title="Skillnaden mellan högsta och lägsta bud."
              >
                Spridning
              </th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--viz-ink)' }}>
            {products.flatMap(product =>
              product.variants.map((variant, i) => {
                const values = members
                  .map(m => bidFor(m, variant.sku)?.value)
                  .filter((v): v is number => typeof v === 'number');
                const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
                const lowest = values.length ? Math.min(...values) : null;
                const highest = values.length ? Math.max(...values) : null;
                const cost = costOf(variant.sku);

                return (
                  <tr key={variant.id}>
                    <th
                      scope="row"
                      className="whitespace-nowrap border-b px-2.5 py-1.5 text-left font-normal"
                      style={{ borderColor: 'var(--viz-rule)' }}
                    >
                      <span style={{ color: i === 0 ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}>
                        {i === 0 ? product.title : '↳'}
                      </span>{' '}
                      <span style={{ color: 'var(--viz-ink-2)' }}>{optionLabel(variant)}</span>
                    </th>
                    <td className={cell} style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}>
                      {cost === null ? '—' : sek(cost, 0)}
                    </td>
                    {members.map(m => {
                      const bid = bidFor(m, variant.sku);
                      if (!bid) {
                        return (
                          <td
                            key={m.user}
                            className={cell}
                            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                          >
                            —
                          </td>
                        );
                      }
                      // Extremerna märks ut bara när någon faktiskt skiljer sig.
                      const isLow = spread > 0 && bid.value === lowest;
                      const isHigh = spread > 0 && bid.value === highest;
                      const below = cost !== null && bid.value < cost;
                      return (
                        <td
                          key={m.user}
                          className={cell}
                          style={{
                            borderColor: 'var(--viz-rule)',
                            color: below ? 'var(--viz-flag)' : 'var(--viz-ink)',
                            fontWeight: isLow || isHigh ? 600 : 400,
                            opacity: bid.perVariant ? 1 : 0.6,
                          }}
                          title={
                            below
                              ? `Under landad kostnad (${sek(cost!, 0)} kr)`
                              : `${sek(marginPct(bid.value, cost) ?? 0, 1)} % marginal${
                                  isLow ? ' · lägsta budet' : isHigh ? ' · högsta budet' : ''
                                }${bid.perVariant ? '' : ' · produktbud, före variantvyn'}`
                          }
                        >
                          {sek(bid.value, 0)}
                          {isLow && spread > 0 && <span aria-hidden> ↓</span>}
                          {isHigh && spread > 0 && <span aria-hidden> ↑</span>}
                        </td>
                      );
                    })}
                    <td className={cell} style={{ borderColor: 'var(--viz-rule)' }}>
                      {sek(priceOf(variant), 0)}
                    </td>
                    <td
                      className={cell}
                      style={{
                        borderColor: 'var(--viz-rule)',
                        color: spread === 0 ? 'var(--viz-ink-3)' : 'var(--viz-s2)',
                      }}
                    >
                      {spread === 0 ? 'eniga' : `${sek(spread, 0)} kr`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

export default function VariantPricing({
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
    const response = await fetch('/api/admin/suggestions?scope=egna');
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
      body: JSON.stringify({ scope: 'egna', prices, label: label.trim() || null }),
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
    const response = await fetch('/api/admin/suggestions?scope=egna', { method: 'DELETE' });
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

  /** Skriver en enskild persons bud för en variant rakt till katalogen. */
  const applyMemberPrice = async (
    variant: VariantPricingVariant,
    memberUser: string,
    priceSek: number
  ) => {
    const ok = window.confirm(
      `Sätt priset för ${optionLabel(variant)} (${variant.sku}) till ${sek(priceSek, 0)} kr ` +
        `(${memberUser}s förslag)?\n\n` +
        `Nuvarande pris: ${sek(liveOf(variant), 0)} kr. Det här ändrar priset kunden ser.`
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
      title="Marknadsjämförelse per produkt och variant"
      sub="En produkt i taget: varje variant får ett eget dragbart pris, med vår landade kostnad under sig och de närmast likvärdiga produkterna hos svenska och nordiska hotelltextilleverantörer under den. Reglaget ändrar ingenting förrän du sparar ett förslag eller sätter priserna."
      note={
        <>
          Sortimentet delar sig i två. <b>På dun är marknaden dyr och trög</b> — 825–1 427 kr i B2B,
          och allt är 50/50 dun och fjäder mot våra 90/10. De 90 %-referenser som finns är
          konsumentledet (Engmo, Värnamo, Mille Notti, 1 439–3 600 kr exkl. moms) och ingen av dem når
          vår fyllnadsvikt. Ett tredje, billigare 60/40-läge (Alva/Jakob) fanns aldrig prissatt på
          riktigt och är arkiverat. <b>På fiber och skydd är den brutal.</b> Mandales säljer ett
          800-grams fibertäcke för 190 kr, Livv en kudde för 95 kr och ett kuddskydd i exakt vår
          storlek för 45 kr. De prispunkterna ligger nära vår egen landade kostnad, och de går inte
          att möta — bara att förklara sig ifrån.{' '}
          <b>Jämför alltid inom en storlek, inte mellan.</b> Landad kostnad är räknad per produkt på
          en enda storlek, så en större variant har en optimistisk marginal här.
        </>
      }
    >
      <Legend
        items={[
          SERIES.landed,
          SERIES.ours,
          ...visibleMembers.map(m => ({ label: `${m.user}s förslag`, varName: m.varName })),
          SERIES.b2b,
          SERIES.b2c,
        ]}
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
            placeholder={mine?.label ?? (user ? `${user}s förslag …` : 'Förslag …')}
            maxLength={120}
            className="min-w-[160px] flex-1 rounded-[3px] border px-2.5 py-1.5 text-[13px]"
            style={{
              background: 'var(--viz-surface)',
              borderColor: 'var(--viz-rule)',
              color: 'var(--viz-ink)',
            }}
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
                    ? 'Skriver över ditt nuvarande förslag.'
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
              Återställ till nuvarande pris
            </button>
          )}
          {mine && (
            <button
              type="button"
              disabled={removing}
              onClick={removeSuggestion}
              className={chip}
              style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-flag)' }}
              title="Ta bort mitt förslag helt."
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
              className="flex flex-col gap-2 rounded-[3px] p-2 text-left transition-[outline-color]"
              style={{
                outline: `1.5px solid ${isSelected ? 'var(--viz-s1)' : 'var(--viz-rule)'}`,
                background: isSelected ? 'var(--viz-plane)' : 'transparent',
              }}
            >
              <ProductThumb product={product} />
              <span className="flex flex-col gap-0.5">
                <span
                  className="text-[12.5px] font-semibold leading-tight"
                  style={{ color: 'var(--viz-ink)' }}
                >
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
              handle={selected.handle}
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

      <MemberMatrix products={products} members={visibleMembers} priceOf={priceOf} />

      <Tooltip tip={tip} />
    </Card>
  );
}
