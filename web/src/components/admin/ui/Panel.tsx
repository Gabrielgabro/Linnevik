import clsx from 'clsx';

/**
 * Den allmänna korthållaren i adminvyn: vit yta, mjuk skugga, valfri
 * accentlinje överst. Ersätter de linjeavgränsade sektionerna som tidigare
 * flöt ihop med bakgrunden.
 */
export default function Panel({
  title,
  meta,
  actions,
  accent,
  padded = true,
  className,
  children,
}: {
  title?: React.ReactNode;
  /** Liten mono-versal rad under rubriken. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** CSS-variabel för linjen överst. Utelämnas för ett neutralt kort. */
  accent?: string;
  /** Sätt false när innehållet är en tabell som ska gå kant i kant. */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const hasHeader = Boolean(title || meta || actions);

  return (
    <section
      className={clsx(
        'flex flex-col overflow-hidden rounded-card border border-rule bg-surface shadow-card',
        className
      )}
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      {hasHeader && (
        <header
          className={clsx(
            'flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 pt-4 sm:px-6',
            padded ? 'pb-1' : 'pb-4'
          )}
        >
          <div className="flex flex-col gap-1">
            {title && (
              <h2 className="text-[16px] font-semibold tracking-[-0.012em] text-ink">{title}</h2>
            )}
            {meta && (
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                {meta}
              </span>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('flex flex-col', padded && 'gap-4 px-5 pb-5 pt-4 sm:px-6')}>
        {children}
      </div>
    </section>
  );
}
