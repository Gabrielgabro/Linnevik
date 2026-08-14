'use client';

import clsx from 'clsx';
import { Search, X } from 'lucide-react';

/** Rad med sökfält och filter över en lista. */
export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-2.5', className)}>
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Sök…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative min-w-[200px] flex-1 sm:max-w-[320px]', className)}>
      <Search
        size={15}
        strokeWidth={1.75}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
      />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={clsx(
          'w-full rounded-ctl border border-rule bg-surface py-2 pl-9 pr-8 text-[13.5px] text-ink outline-none',
          'placeholder:text-ink-3 focus:border-brand',
          'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]'
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Rensa sökning"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-3 hover:bg-plane hover:text-ink"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Filterknapp. Aktivt läge är varumärkets gröna i stället för det tidigare
 * svarta, och räknaren sitter kvar i knappen.
 */
export function FilterPill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[12.5px] leading-[1.5] transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text',
        active
          ? 'border-brand bg-brand font-medium text-brand-fg'
          : 'border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
      )}
    >
      {children}
      {count !== undefined && (
        <span className={clsx('font-mono text-[11px] tabular-nums', !active && 'text-ink-3')}>
          {count}
        </span>
      )}
    </button>
  );
}
