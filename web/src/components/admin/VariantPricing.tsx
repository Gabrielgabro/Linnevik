'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  BASIS_LABEL,
  competitorProducts,
  type Basis,
  type Channel,
  variantCompetitors,
} from '@/data/competitorPrices';
import { products as landedProducts } from '@/data/landedCost';
import type { VariantPricingProduct, VariantPricingVariant } from '@/lib/productsDb';
import { Card, Legend, sek, Tooltip, useTip } from './VizPrimitives';

const optionLabel = (v: VariantPricingVariant) => v.optionValues.map(o => o.value).join(' · ') || v.sku;

const liveOf = (v: VariantPricingVariant) => v.priceMinor / 100;

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
  b2b: { label: 'B2B-konkurrent', varName: '--viz-s2' },
  b2c: { label: 'B2C-referens', varName: '--viz-ink-3' },
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
  match: 'exact' | 'approx';
  caveat?: string;
};

/**
 * Marknadens jämförelseprodukter för en specifik variant — alla, inte bara
 * den primära, precis som graferna längre upp visar hela konkurrentfältet per
 * produkt. Slår upp `sku` i `variantCompetitors` (storlekar utanför
 * sändningsanalysen) och faller annars tillbaka på produktens vanliga
 * jämförelse i `competitorPrices.ts`, om variantens storlek stämmer med den.
 * Tom lista betyder att marknaden research-mässigt saknar den här storleken
 * helt — se kommentarerna i competitorPrices.ts för vilka det gäller.
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
      match: c.match,
      caveat: c.caveat,
    }));
  }

  const landed = landedProducts.find(p => p.handle === handle);
  const product = landed ? competitorProducts.find(p => p.skuPrefix === landed.skuPrefix) : undefined;
  if (!product) return [];

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
    match: 'exact' as const,
    caveat: c.caveat,
  }));
};

/**
 * Skalans tak, samma runda-upp-logik som konkurrentgraferna men utan
 * beroende av landad kostnad eller konkurrentdata — den finns inte för en
 * produkt som just lagts till i katalogen.
 */
const scaleMaxOf = (values: number[]) => {
  const raw = Math.max(...values, 1) * 1.25;
  const step = raw > 400 ? 100 : raw > 100 ? 25 : 5;
  return Math.ceil(raw / step) * step;
};

const stepOf = (max: number) => (max > 400 ? 5 : 1);

/** Rutnätet varje rad delar: etikett, spår, siffra. */
const ROW = 'grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[560px]:grid-cols-[1fr_auto] max-[560px]:gap-x-2.5 max-[560px]:gap-y-1';

/** Skalstreck under varje variantgrupp, i samma rutnät som raderna ovanför. */
function VariantAxis({ max }: { max: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(max * f));
  return (
    <div className="grid grid-cols-[178px_1fr_92px] items-start gap-3 max-[560px]:grid-cols-[1fr_auto]">
      <span className="max-[560px]:hidden" />
      <div className="relative h-[17px] border-t" style={{ borderColor: 'var(--viz-grid)' }}>
        {ticks.map((t, i) => (
          <i
            key={t}
            className="absolute top-[3px] whitespace-nowrap font-mono text-[10.5px] not-italic tabular-nums"
            style={{
              left: `${(t / max) * 100}%`,
              color: 'var(--viz-ink-3)',
              transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {sek(t, 0)}
          </i>
        ))}
      </div>
      <span className="pt-[3px] font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        kr/st
      </span>
    </div>
  );
}

/**
 * Variantens eget pris som dragbart reglage — samma reglage som i graferna
 * längre upp, men utan landad-kostnad-strecket: den datan finns bara för de
 * sex produkterna från Kina-sändningen, inte för en godtycklig variant. Det
 * enda strecket i spåret är därför nuvarande pris i katalogen, och det syns
 * bara när du dragit ifrån det.
 */
function PriceSliderRow({
  label,
  value,
  baseline,
  max,
  step,
  edited,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  baseline: number;
  max: number;
  step: number;
  edited: boolean;
  onChange: (next: number) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const valueFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(max, Math.round((ratio * max) / step) * step));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(valueFromEvent(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onChange(valueFromEvent(e.clientX));
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

  const pct = Math.min(100, (value / max) * 100);
  const diff = Math.round(value) - Math.round(baseline);

  return (
    <div className={ROW}>
      <div
        className="flex items-center justify-end gap-2 text-right text-[12.5px] font-semibold leading-tight max-[560px]:col-span-full max-[560px]:justify-start max-[560px]:text-left"
        style={{ color: 'var(--viz-ink)' }}
      >
        {edited && (
          <button
            type="button"
            onClick={onReset}
            title={`Återställ till nuvarande pris ${sek(baseline, 0)} kr`}
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
        {/* Var det nuvarande priset låg, så avvikelsen syns medan man drar. */}
        <span
          aria-hidden
          title={`Nuvarande pris i katalogen: ${sek(baseline, 0)} kr`}
          className="pointer-events-none absolute bottom-0 top-0 w-px"
          style={{ left: `${Math.min(100, (baseline / max) * 100)}%`, background: 'var(--viz-ink-3)', opacity: edited ? 0.65 : 0 }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Vårt pris för ${label}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${sek(value, 0)} kronor per styck`}
          onKeyDown={onKeyDown}
          className="absolute bottom-[4px] top-[4px] left-0 rounded-[3px_4px_4px_3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: `${pct}%`,
            minWidth: 2,
            background: 'var(--viz-s1)',
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

      <span className="whitespace-nowrap font-mono text-[11px] tabular-nums" style={{ color: 'var(--viz-ink)' }}>
        {sek(value, 0)} kr
        {edited && (
          <span className="block text-[10px]" style={{ color: 'var(--viz-ink-3)' }}>
            {diff > 0 ? '+' : ''}
            {sek(diff, 0)} kr
          </span>
        )}
      </span>
    </div>
  );
}

/** En konkurrentprodukt som stapel — orange för B2B, grå för B2C-referenser. */
function MarketBar({
  row,
  max,
  ourPrice,
  showTip,
  hideTip,
}: {
  row: MarketRow;
  max: number;
  ourPrice: number;
  showTip: (e: React.MouseEvent | React.FocusEvent, next: { title: string; rows: string[]; note: string }) => void;
  hideTip: () => void;
}) {
  const diff = Math.round(ourPrice) - Math.round(row.priceSek);
  const tip = {
    title: `${row.vendor} — ${row.product}`,
    rows: [
      `${sek(row.priceSek, 0)} SEK/st, ${BASIS_LABEL[row.basis]}`,
      `${row.spec ? `${row.spec} · ` : ''}${row.size} cm${row.match === 'approx' ? ' (närmaste storlek)' : ''}`,
      diff === 0 ? 'Samma som priset du satt nu' : `${diff > 0 ? '+' : ''}${sek(diff, 0)} kr mot priset du satt nu`,
    ],
    note: row.caveat ?? (row.channel === 'b2c' ? 'Konsumentpris, som referens.' : 'Jämförelseprodukt.'),
  };

  return (
    <div className={ROW}>
      <div
        className="text-right text-[12.5px] leading-tight max-[560px]:col-span-full max-[560px]:text-left"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        {row.vendor} · {row.product}
        {row.match === 'approx' && (
          <span className="block text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
            {row.size} — {row.caveat ?? 'närmaste storlek'}
          </span>
        )}
      </div>
      <div className="flex h-[18px] items-stretch" style={{ width: `${Math.min(100, (row.priceSek / max) * 100)}%` }}>
        <div
          tabIndex={0}
          role="img"
          aria-label={`${row.vendor} ${row.product}, ${sek(row.priceSek, 0)} kr`}
          className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
          style={{ background: `var(${CHANNEL[row.channel].varName})` }}
          onMouseEnter={e => showTip(e, tip)}
          onMouseMove={e => showTip(e, tip)}
          onFocus={e => showTip(e, tip)}
          onMouseLeave={hideTip}
          onBlur={hideTip}
        />
      </div>
      <span className="whitespace-nowrap font-mono text-[11px] tabular-nums" style={{ color: 'var(--viz-ink-2)' }}>
        {sek(row.priceSek, 0)} kr
      </span>
    </div>
  );
}

function ProductPanel({ product }: { product: VariantPricingProduct }) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<number, number>>(() =>
    Object.fromEntries(product.variants.map(v => [v.id, liveOf(v)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tip, showTip, hideTip } = useTip();

  const priceOf = (v: VariantPricingVariant) => prices[v.id] ?? liveOf(v);
  const setPrice = (v: VariantPricingVariant, next: number) =>
    setPrices(prev => ({ ...prev, [v.id]: Math.max(0, Math.round(next)) }));
  const isEdited = (v: VariantPricingVariant) => Math.round(priceOf(v)) !== Math.round(liveOf(v));

  const edited = product.variants.filter(isEdited);
  const anyEdited = edited.length > 0;

  const cheapest = product.variants.reduce((min, v) => (liveOf(v) < liveOf(min) ? v : min));

  // Varje variant med sitt marknadsfält, sorterat billigast först så att
  // stapelblocket läses som en prislista.
  const groups = product.variants.map(v => ({
    variant: v,
    market: marketRowsFor(product.handle, v).sort((a, b) => a.priceSek - b.priceSek),
  }));

  // En delad skala för hela produkten, låst till de nuvarande priserna (och
  // marknadens), inte till det som dras — annars hoppar skalan i sidled så
  // fort ett reglage rör sig, och varianterna går inte att jämföra med
  // varandra. Måste också rymma marknadspriset, annars klipps de orangea
  // staplarna av vid kanten och ser ut som en mindre skillnad än de är
  // (t.ex. Värnamos 220×220-duntäcke, långt dyrare än våra nuvarande priser).
  const max = scaleMaxOf([
    ...product.variants.map(liveOf),
    ...groups.flatMap(g => g.market.map(m => m.priceSek)),
  ]);
  const step = stepOf(max);

  const reset = () => setPrices(Object.fromEntries(product.variants.map(v => [v.id, liveOf(v)])));

  const save = async () => {
    const ok = window.confirm(
      `Sätt ${edited.length === 1 ? 'nytt pris' : `${edited.length} nya priser`} för ${product.title}?\n\n` +
        edited.map(v => `${optionLabel(v)}: ${sek(liveOf(v), 0)} → ${sek(priceOf(v), 0)} kr`).join('\n') +
        '\n\nDet här ändrar priset kunden ser.'
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      for (const v of edited) {
        const response = await fetch(`/api/admin/variants/${v.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceMinor: Math.round(priceOf(v) * 100) }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? `Kunde inte sätta priset för ${optionLabel(v)}.`);
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara priserna.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Legend
        items={[
          { label: 'Vårt pris (dra för att ändra)', varName: '--viz-s1' },
          CHANNEL.b2b,
          CHANNEL.b2c,
        ]}
      />

      <div className="flex flex-col gap-6">
        {groups.map(({ variant, market }) => (
          <div key={variant.id} className="flex flex-col gap-[9px]">
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
              {variant.id === cheapest.id && (
                <span
                  className="rounded-sm border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.06em]"
                  style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-3)' }}
                  title="Billigaste varianten — det är den här som visas som «vårt pris» i grafen ovanför."
                >
                  billigast · syns i grafen ovanför
                </span>
              )}
            </div>

            <PriceSliderRow
              label="Vårt pris"
              value={priceOf(variant)}
              baseline={liveOf(variant)}
              max={max}
              step={step}
              edited={isEdited(variant)}
              onChange={next => setPrice(variant, next)}
              onReset={() => setPrice(variant, liveOf(variant))}
            />

            {market.map(row => (
              <MarketBar
                key={row.id}
                row={row}
                max={max}
                ourPrice={priceOf(variant)}
                showTip={showTip}
                hideTip={hideTip}
              />
            ))}

            {market.length === 0 && (
              <div className="grid grid-cols-[178px_1fr] gap-3 max-[560px]:grid-cols-1">
                <span />
                <span className="text-[11.5px] leading-snug" style={{ color: 'var(--viz-ink-3)' }}>
                  Ingen av leverantörerna i underlaget säljer den här storleken — sätt priset utifrån
                  variantens systrar ovanför i stället.
                </span>
              </div>
            )}

            <VariantAxis max={max} />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          disabled={!anyEdited || saving}
          onClick={save}
          className="rounded-sm border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] disabled:opacity-35"
          style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink)' }}
        >
          {saving ? 'Sätter…' : 'Sätt priser'}
        </button>
        {anyEdited && (
          <button
            type="button"
            disabled={saving}
            onClick={reset}
            className="rounded-sm border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] disabled:opacity-35"
            style={{ borderColor: 'var(--viz-rule)', color: 'var(--viz-ink-2)' }}
          >
            Återställ
          </button>
        )}
      </div>

      <Tooltip tip={tip} />
    </div>
  );
}

/** Samma bildruta som kunden ser i butiken — kvadratisk, urklippt, gråbotten om bilden saknas. */
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

/**
 * Egna produkter med fler än en variant, som klickbara produktkort — samma
 * bild kunden ser i butiken. Listan byggs av `listLinnevikVariantProducts` i
 * productsDb.ts (leverantör Linnevik, fler än en variant), inte av en
 * hårdkodad produktlista, så en ny variantprodukt dyker upp här utan
 * kodändring.
 *
 * Varje variant får sitt eget block med marknadens motsvarigheter under sig,
 * likadant uppställt som produktgraferna längre upp — en variant är i
 * praktiken en egen prispunkt och behöver en egen jämförelse.
 *
 * Bara ett kort öppet i taget: reglagen tar full bredd för att vara dragbara,
 * och får inte plats i en smal rutnätscell bredvid de andra korten.
 */
export default function VariantPricing({ products }: { products: VariantPricingProduct[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!products.length) return null;

  const selected = products.find(p => p.id === selectedId) ?? null;

  return (
    <Card
      title="Egna produkter med flera varianter"
      sub="Samma produkt kan sälja i flera storlekar eller fyllningar, och de behöver inte kosta lika mycket. Klicka på en produkt: varje variant får ett eget dragbart pris med marknadens motsvarigheter i den storleken under sig, precis som produktgraferna ovanför."
      note="Vårt pris i grafen ovanför är alltid den billigaste varianten av produkten — här sätter du resten. Saknar en storlek orangea staplar finns den inte hos någon leverantör i underlaget."
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {products.map(product => {
          const prices = product.variants.map(liveOf);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
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
                <span className="text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--viz-ink)' }}>
                  {product.title}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--viz-ink-3)' }}>
                  {product.variants.length} varianter ·{' '}
                  {min === max ? `${sek(min, 0)} kr` : `${sek(min, 0)}–${sek(max, 0)} kr`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="flex flex-col gap-3 rounded-[3px] border px-4 py-4"
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
          <ProductPanel key={selected.id} product={selected} />
        </div>
      )}
    </Card>
  );
}
