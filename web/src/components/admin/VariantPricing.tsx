'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { VariantPricingProduct, VariantPricingVariant } from '@/lib/productsDb';
import { Card, sek } from './VizPrimitives';

const optionLabel = (v: VariantPricingVariant) => v.optionValues.map(o => o.value).join(' · ') || v.sku;

const liveOf = (v: VariantPricingVariant) => v.priceMinor / 100;

/**
 * Skalans tak, samma runda-upp-logik som konkurrentgraferna men utan
 * beroende av landad kostnad eller konkurrentdata — den finns inte för en
 * produkt som just lagts till i katalogen.
 */
const scaleMaxOf = (values: number[]) => {
  const raw = Math.max(...values, 1) * 1.6;
  const step = raw > 400 ? 100 : raw > 100 ? 25 : 5;
  return Math.ceil(raw / step) * step;
};

const stepOf = (max: number) => (max > 400 ? 5 : 1);

/**
 * Ett dragbart spår, likadant hanterat som reglaget i konkurrentgraferna men
 * utan landad-kostnad-strecket — den datan finns bara för de sex produkterna
 * från Kina-sändningen, inte för en godtycklig variant.
 */
function SliderRow({
  label,
  value,
  max,
  step,
  emphasis,
  edited,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  emphasis: boolean;
  edited: boolean;
  onChange: (next: number) => void;
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

  return (
    <div className="grid grid-cols-[178px_1fr_92px] items-center gap-3 max-[560px]:grid-cols-[1fr_auto] max-[560px]:gap-x-2.5 max-[560px]:gap-y-1">
      <div
        className="text-right text-[12.5px] leading-tight max-[560px]:col-span-full max-[560px]:text-left"
        style={{ color: emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)', fontWeight: emphasis ? 600 : 400 }}
      >
        {label}
      </div>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-[22px] touch-none select-none rounded-[3px]"
        style={{ background: 'var(--viz-grid)', cursor: dragging ? 'grabbing' : 'ew-resize' }}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.round(value)}
          aria-valuetext={`${sek(value, 0)} kronor per styck`}
          onKeyDown={onKeyDown}
          className="absolute bottom-[3px] top-[3px] left-0 rounded-[3px_4px_4px_3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: `${pct}%`,
            minWidth: 2,
            background: emphasis ? 'var(--viz-s1)' : 'var(--viz-s4)',
            outlineColor: 'var(--viz-ink)',
            opacity: edited ? 1 : 0.85,
          }}
        />
      </div>
      <span
        className="whitespace-nowrap font-mono text-[11px] tabular-nums"
        style={{ color: emphasis ? 'var(--viz-ink)' : 'var(--viz-ink-2)' }}
      >
        {sek(value, 0)} kr
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

  const priceOf = (v: VariantPricingVariant) => prices[v.id] ?? liveOf(v);
  const setPrice = (v: VariantPricingVariant, next: number) =>
    setPrices(prev => ({ ...prev, [v.id]: Math.max(0, Math.round(next)) }));

  const edited = product.variants.filter(v => Math.round(priceOf(v)) !== Math.round(liveOf(v)));
  const anyEdited = edited.length > 0;

  const cheapest = product.variants.reduce((min, v) => (priceOf(v) < priceOf(min) ? v : min));
  // Låst till de nuvarande priserna, inte till det som dras — annars hoppar
  // hela skalan i sidled så fort ett reglage rör sig.
  const max = scaleMaxOf(product.variants.map(liveOf));
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
    <div className="flex flex-col gap-3 border-t px-1 pb-1 pt-4" style={{ borderColor: 'var(--viz-grid)' }}>
      <div className="flex flex-col gap-2.5">
        {product.variants
          .filter(v => v.id !== cheapest.id)
          .map(v => (
            <SliderRow
              key={v.id}
              label={optionLabel(v)}
              value={priceOf(v)}
              max={max}
              step={step}
              emphasis={false}
              edited={Math.round(priceOf(v)) !== Math.round(liveOf(v))}
              onChange={next => setPrice(v, next)}
            />
          ))}
        <SliderRow
          label={`Vårt pris — ${optionLabel(cheapest)} (billigast)`}
          value={priceOf(cheapest)}
          max={max}
          step={step}
          emphasis
          edited={Math.round(priceOf(cheapest)) !== Math.round(liveOf(cheapest))}
          onChange={next => setPrice(cheapest, next)}
        />
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
    </div>
  );
}

/**
 * Egna produkter med fler än en variant, en klickbar ruta per produkt. Listan
 * byggs av `listLinnevikVariantProducts` i productsDb.ts — leverantör Linnevik,
 * fler än en variant — så en ny variantprodukt dyker upp här utan kodändring.
 *
 * Rutan är stängd som standard: de flesta produkter har samma pris på alla
 * varianter, så den som bara vill se det övergripande priset (i grafen ovanför)
 * ska inte behöva bläddra förbi en vägg av reglage för att komma dit.
 */
export default function VariantPricing({ products }: { products: VariantPricingProduct[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (!products.length) return null;

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card
      title="Egna produkter med flera varianter"
      sub="Samma produkt kan sälja i flera storlekar eller fyllningar, och de behöver inte kosta lika mycket. Klicka på en produkt för att sätta priset per variant."
      note="Vårt pris i grafen ovanför är alltid den billigaste varianten av produkten — här sätter du resten."
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
        {products.map(product => {
          const prices = product.variants.map(liveOf);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          const isOpen = expanded.has(product.id);
          return (
            <div
              key={product.id}
              className="col-span-full flex flex-col rounded-[3px] border px-4 py-3"
              style={{ borderColor: 'var(--viz-rule)', background: 'var(--viz-plane)' }}
            >
              <button
                type="button"
                onClick={() => toggle(product.id)}
                aria-expanded={isOpen}
                className="flex items-center justify-between gap-3 text-left"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold" style={{ color: 'var(--viz-ink)' }}>
                    {product.title}
                  </span>
                  <span className="text-[12px]" style={{ color: 'var(--viz-ink-3)' }}>
                    {product.variants.length} varianter ·{' '}
                    {min === max ? `${sek(min, 0)} kr` : `${sek(min, 0)}–${sek(max, 0)} kr`}
                  </span>
                </span>
                <span aria-hidden style={{ color: 'var(--viz-ink-3)' }}>
                  {isOpen ? '▲' : '▼'}
                </span>
              </button>
              {isOpen && <ProductPanel product={product} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
