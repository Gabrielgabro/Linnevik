import clsx from 'clsx';

/**
 * Sidrubriken för adminvyn. Ersätter det identiska header-blocket som tidigare
 * var kopierat till varje sida. Accentfärgen kommer från nav.ts och är det som
 * gör att man känner igen vilken sektion man står i.
 */
export default function PageHeader({
  kicker,
  title,
  description,
  accent = 'var(--viz-ink)',
  actions,
  className,
}: {
  /** Mono-versal översta raden, ofta en räkning: "Katalog · 128 produkter". */
  kicker?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** CSS-variabel, aldrig en hex — mörkt läge går via tokens. */
  accent?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={clsx(
        'flex flex-col gap-3 rounded-card border border-rule bg-surface px-5 py-5 shadow-card sm:px-6',
        className
      )}
      style={{ borderTop: `3px solid ${accent}` }}
    >
      {kicker && (
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          {kicker}
        </span>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="max-w-[24ch] text-balance font-heading text-[clamp(24px,3.4vw,34px)] leading-[1.1] tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && (
        <p className="max-w-[68ch] text-[14px] leading-[1.6] text-ink-2">{description}</p>
      )}
    </header>
  );
}
