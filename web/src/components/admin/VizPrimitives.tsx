'use client';

import { useState } from 'react';

export const sek = (v: number, decimals = 2) =>
  v.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function Swatch({ varName }: { varName: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[9px] w-[9px] shrink-0 rounded-sm"
      style={{ background: `var(${varName})` }}
    />
  );
}

export function Legend({ items }: { items: { label: string; varName: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-[18px] gap-y-1.5">
      {items.map(i => (
        <span
          key={i.label}
          className="inline-flex items-center gap-[7px] text-[12.5px]"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          <Swatch varName={i.varName} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Axis({
  ticks,
  max,
  unit,
  format,
}: {
  ticks: number[];
  max: number;
  unit: string;
  format: (t: number) => string;
}) {
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

export type Tip = { x: number; y: number; title: string; rows: string[]; note: string } | null;

/** Delad hover/fokus-tooltip. Returnerar en handler att koppla på varje stapel. */
export function useTip() {
  const [tip, setTip] = useState<Tip>(null);

  const showTip = (e: React.MouseEvent | React.FocusEvent, next: Omit<NonNullable<Tip>, 'x' | 'y'>) => {
    const point = 'clientX' in e ? { x: e.clientX, y: e.clientY } : null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ ...next, x: point?.x ?? rect.left + rect.width / 2, y: point?.y ?? rect.top });
  };

  const hideTip = () => setTip(null);

  return { tip, showTip, hideTip };
}

export function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
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
  );
}

export function Card({
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
      className="flex flex-col gap-[18px] rounded-card border border-rule bg-surface px-6 pb-5 pt-6 shadow-card"
      style={{ borderTop: `3px solid ${flag ? 'var(--viz-flag)' : 'var(--adm-info)'}` }}
    >
      <header className="flex flex-col gap-[5px]">
        <h2 className="text-[17px] font-semibold tracking-[-0.012em] text-ink">{title}</h2>
        <p className="max-w-[70ch] text-[13.5px] text-ink-2">{sub}</p>
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
