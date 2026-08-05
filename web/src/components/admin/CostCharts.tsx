'use client';

import { useState } from 'react';
import type { LandedCostProduct } from '@/data/landedCost';
import { landedPerPcs, lineTotal } from '@/data/landedCost';

type Props = { products: LandedCostProduct[] };

type Part = { key: 'goodsPerPcs' | 'freightPerPcs' | 'dutyPerPcs'; label: string; varName: string };

const PARTS: Part[] = [
  { key: 'goodsPerPcs', label: 'Betald varukostnad', varName: '--viz-s1' },
  { key: 'freightPerPcs', label: 'Frakt & logistik', varName: '--viz-s2' },
  { key: 'dutyPerPcs', label: 'Tull', varName: '--viz-s3' },
];

const sek = (v: number, decimals = 2) =>
  v.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

type Tip = { x: number; y: number; title: string; rows: string[]; note: string } | null;

function Swatch({ varName }: { varName: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-sm"
      style={{ background: `var(${varName})` }}
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5">
      {PARTS.map(p => (
        <span
          key={p.key}
          className="inline-flex items-center gap-[7px] text-[12.5px]"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          <Swatch varName={p.varName} />
          {p.label}
        </span>
      ))}
    </div>
  );
}

function Axis({ ticks, max, unit, format }: { ticks: number[]; max: number; unit: string; format: (t: number) => string }) {
  return (
    <div className="mt-0.5 grid grid-cols-[132px_1fr_88px] items-start gap-3 max-[620px]:grid-cols-[1fr_auto]">
      <span className="max-[620px]:hidden" />
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
            {format(t)}
          </i>
        ))}
      </div>
      <span className="pt-[3px] font-mono text-[10.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        {unit}
      </span>
    </div>
  );
}

export default function CostCharts({ products }: Props) {
  const [tip, setTip] = useState<Tip>(null);

  const capital = products.reduce((sum, p) => sum + lineTotal(p), 0);
  const shareOf = (...prefixes: string[]) =>
    (products
      .filter(p => prefixes.includes(p.skuPrefix))
      .reduce((sum, p) => sum + lineTotal(p), 0) /
      capital) *
    100;
  const MAX_PER_PCS = 450;
  const MAX_LINE = 18000;

  const showTip = (e: React.MouseEvent | React.FocusEvent, next: Omit<NonNullable<Tip>, 'x' | 'y'>) => {
    const point = 'clientX' in e ? { x: e.clientX, y: e.clientY } : null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ ...next, x: point?.x ?? rect.left + rect.width / 2, y: point?.y ?? rect.top });
  };

  const stackedRow = (p: LandedCostProduct, normalized: boolean) => {
    const landed = landedPerPcs(p);
    const width = normalized ? 100 : (landed / MAX_PER_PCS) * 100;
    const addOnShare = ((p.freightPerPcs + p.dutyPerPcs) / landed) * 100;

    return (
      <div
        key={`${p.skuPrefix}-${normalized}`}
        className="grid grid-cols-[132px_1fr_88px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {p.title}
        </div>
        <div className="flex h-[22px] items-stretch gap-0.5" style={{ width: `${width}%` }}>
          {PARTS.map((part, i) => {
            const value = p[part.key];
            const share = (value / landed) * 100;
            return (
              <div
                key={part.key}
                tabIndex={0}
                role="img"
                aria-label={`${p.title}, ${part.label}: ${sek(value)} kronor per styck, ${sek(share, 1)} procent av styckkostnaden.`}
                className="min-w-[2px] cursor-default transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
                style={{
                  background: `var(${part.varName})`,
                  flex: `${value} 0 0`,
                  borderRadius: i === 0 ? '3px 0 0 3px' : i === PARTS.length - 1 ? '0 4px 4px 0' : 0,
                }}
                onMouseEnter={e => showTip(e, tipFor(p, part, value, share, landed))}
                onMouseMove={e => showTip(e, tipFor(p, part, value, share, landed))}
                onFocus={e => showTip(e, tipFor(p, part, value, share, landed))}
                onMouseLeave={() => setTip(null)}
                onBlur={() => setTip(null)}
              />
            );
          })}
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {normalized ? `${sek(addOnShare, 0)} %` : `${sek(landed)} kr`}
        </span>
      </div>
    );
  };

  const tipFor = (p: LandedCostProduct, part: Part, value: number, share: number, landed: number) => ({
    title: p.title,
    rows: [`${part.label}`, `${sek(value)} SEK / st · ${sek(share, 1)} %`],
    note: `Landad kostnad ${sek(landed)} SEK · ${p.qty} st · ${sek(p.cbm, 2)} CBM`,
  });

  const soloRow = (p: LandedCostProduct) => {
    const total = lineTotal(p);
    const share = (total / capital) * 100;
    return (
      <div
        key={p.skuPrefix}
        className="grid grid-cols-[132px_1fr_88px] items-center gap-3 max-[620px]:grid-cols-[1fr_auto] max-[620px]:gap-x-2.5 max-[620px]:gap-y-1"
      >
        <div
          className="text-right text-[12.5px] leading-tight max-[620px]:col-span-full max-[620px]:text-left"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {p.title}
        </div>
        <div className="flex h-[22px] items-stretch" style={{ width: `${(total / MAX_LINE) * 100}%` }}>
          <div
            tabIndex={0}
            role="img"
            aria-label={`${p.title}: ${sek(total)} kronor totalt, ${sek(share, 1)} procent av sändningens kapital.`}
            className="min-w-[2px] flex-1 cursor-default rounded-[3px_4px_4px_3px] transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
            style={{ background: 'var(--viz-s1)' }}
            onMouseEnter={e => showTip(e, soloTip(p, total, share))}
            onMouseMove={e => showTip(e, soloTip(p, total, share))}
            onFocus={e => showTip(e, soloTip(p, total, share))}
            onMouseLeave={() => setTip(null)}
            onBlur={() => setTip(null)}
          />
        </div>
        <span
          className="whitespace-nowrap font-mono text-[11px] tabular-nums"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          {sek(total, 0)} kr
        </span>
      </div>
    );
  };

  const soloTip = (p: LandedCostProduct, total: number, share: number) => ({
    title: p.title,
    rows: [`${sek(total)} SEK totalt`, `${sek(share, 1)} % av sändningens kapital`],
    note: `${p.qty} st à ${sek(landedPerPcs(p))} SEK landad kostnad`,
  });

  return (
    <>
      <Card
        title="Landad kostnad per styck"
        sub="Vad en enhet kostar när den står på lagret i Uppsala. Segmenten är staplade i den ordning kostnaden uppstår: vara, transport, tull."
        note={
          <>
            Skalan gör spridningen tydlig: <b>Täcke Sebastian kostar 32 gånger mer per styck än ett
            kuddskydd.</b> Det är därför den här vyn ensam inte räcker för att sätta pris — se nästa graf.
          </>
        }
      >
        <Legend />
        <div className="flex flex-col gap-[9px]">{products.map(p => stackedRow(p, false))}</div>
        <Axis ticks={[0, 150, 300, 450]} max={MAX_PER_PCS} unit="kr/st" format={t => sek(t, 0)} />
      </Card>

      <Card
        title="Hur kostnaden är sammansatt"
        sub="Samma produkter, samma ordning, men varje stapel normerad till 100 %. Nu syns vilken andel av styckkostnaden som är frakt och tull i stället för vara — siffran till höger är den andelen."
        flag
        note={
          <>
            <b>Kudde Eric bär inte sin frakt.</b> 61 % av styckkostnaden är frakt och tull, och frakten
            ensam (39,28 kr) är dyrare än själva kudden (27,86 kr). Kudden är billig men skrymmande:
            250 st tar 4,28 CBM, alltså 55 % av hela containervolymen. Frakt betalas på volym, inte vikt.
          </>
        }
      >
        <Legend />
        <div className="flex flex-col gap-[9px]">{products.map(p => stackedRow(p, true))}</div>
        <Axis ticks={[0, 25, 50, 75, 100]} max={100} unit="frakt + tull" format={t => `${t} %`} />
      </Card>

      <Card
        title="Var pengarna faktiskt tog vägen"
        sub="Landad kostnad gånger antal. Ordningen är densamma som ovan — och den vänder helt."
        note={
          <>
            De två dyraste produkterna per styck, Sebastian och Sigrid, är tillsammans{' '}
            <b>{sek(shareOf('TAC-SEB', 'KUD-SIG'), 0)} % av kapitalet</b>. Kudde Eric ensam är{' '}
            {sek(shareOf('KUD-ERI'), 0)} %. Prissättningen bör
            läggas mest möda på de produkter som binder mest pengar, inte på dem med högst styckpris.
          </>
        }
      >
        <div className="flex flex-col gap-[9px]">{products.map(soloRow)}</div>
        <Axis ticks={[0, 6000, 12000, 18000]} max={MAX_LINE} unit="SEK" format={t => sek(t, 0)} />
      </Card>

      {tip && (
        <div
          role="status"
          className="pointer-events-none fixed z-50 max-w-[250px] rounded-[3px] border px-[11px] py-[9px] text-[12.5px] shadow-lg"
          style={{
            left: Math.min(Math.max(8, tip.x + 14), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 258),
            top: Math.max(8, tip.y - 90),
            background: 'var(--viz-surface)',
            color: 'var(--viz-ink)',
            borderColor: 'var(--viz-rule)',
          }}
        >
          <div className="mb-[3px] font-semibold">{tip.title}</div>
          {tip.rows.map(r => (
            <div key={r} className="tabular-nums" style={{ color: 'var(--viz-ink-2)' }}>
              {r}
            </div>
          ))}
          <div className="mt-1 text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
            {tip.note}
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  title,
  sub,
  note,
  flag,
  children,
}: {
  title: string;
  sub: string;
  note: React.ReactNode;
  flag?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-[18px] rounded-[3px] border px-6 pb-5 pt-6"
      style={{ background: 'var(--viz-surface)', borderColor: 'var(--viz-rule)' }}
    >
      <header className="flex flex-col gap-[5px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.012em]" style={{ color: 'var(--viz-ink)' }}>
          {title}
        </h2>
        <p className="max-w-[70ch] text-[13.5px]" style={{ color: 'var(--viz-ink-2)' }}>
          {sub}
        </p>
      </header>
      {children}
      <p
        className="max-w-[72ch] border-l-2 pl-[13px] text-[13px] [&_b]:font-semibold [&_b]:text-[color:var(--viz-ink)]"
        style={{
          color: 'var(--viz-ink-2)',
          borderColor: flag ? 'var(--viz-flag)' : 'var(--viz-s2)',
        }}
      >
        {note}
      </p>
    </section>
  );
}
