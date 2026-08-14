'use client';

/**
 * Formulärdelarna för kundregistret. Samma visuella språk som resten av
 * adminvyn: mono-versaler som etikett, tunn linje under fältet, inga rutor.
 */

import clsx from 'clsx';

const inputClass =
  'w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none ' +
  'focus:border-b-2 focus:pb-[5px] disabled:opacity-50';

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
      style={{ color: 'var(--viz-ink-3)' }}
    >
      {children}
    </span>
  );
}

type FieldProps = {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'number';
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  max?: string;
  className?: string;
};

export function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  placeholder,
  step,
  min,
  max,
  className,
}: FieldProps) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <Label>
        {label}
        {required && ' *'}
      </Label>
      <input
        name={name}
        type={type}
        step={step}
        min={min}
        max={max}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
        style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
      />
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  blankLabel = '—',
  required,
  className,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue?: string | null;
  blankLabel?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
        style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
      >
        {!required && <option value="">{blankLabel}</option>}
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        className={clsx(inputClass, 'resize-y leading-[1.6]')}
        style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
      />
    </label>
  );
}

export function Button({
  children,
  variant = 'primary',
  style,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' }) {
  return (
    <button
      {...rest}
      className={clsx(
        'rounded-[3px] px-3.5 py-2 text-[13px] transition-opacity',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:opacity-50',
        variant === 'primary' ? 'font-medium hover:opacity-85' : 'hover:underline',
        className
      )}
      // Anropssidan får sista ordet om färgen — "Ta bort" är röd men i övrigt
      // en helt vanlig tyst knapp.
      style={{
        ...(variant === 'primary'
          ? { background: 'var(--viz-ink)', color: 'var(--viz-surface)' }
          : { color: 'var(--viz-ink-3)' }),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="border-l-2 pl-3 text-[13px]"
      style={{ color: 'var(--viz-flag)', borderColor: 'var(--viz-flag)' }}
    >
      {children}
    </p>
  );
}

/** Läser ut ett formulär som ett vanligt objekt att skicka som JSON. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(
    Array.from(new FormData(form).entries()).map(([k, v]) => [k, String(v)])
  );
}
