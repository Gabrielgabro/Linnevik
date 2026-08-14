import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/**
 * Nyckeltal överst på en sida. Ersätter hårstrecksrutnätet (gap-px) med
 * riktiga kort som har en accentlinje överst.
 */
export default function StatTile({
  label,
  value,
  hint,
  accent = 'var(--viz-ink-3)',
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** CSS-variabel, aldrig en hex. */
  accent?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-1.5 rounded-card border border-rule bg-surface px-4 py-3.5 shadow-card',
        className
      )}
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
        {Icon && <Icon size={13} strokeWidth={1.75} aria-hidden style={{ color: accent }} />}
        {label}
      </span>
      <span className="font-mono text-[24px] leading-none tabular-nums text-ink">{value}</span>
      {hint && <span className="text-[12.5px] leading-[1.5] text-ink-2">{hint}</span>}
    </div>
  );
}

/** Raden som håller ihop nyckeltalen. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">{children}</div>
  );
}
