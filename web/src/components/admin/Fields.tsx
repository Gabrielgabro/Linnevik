'use client';

/**
 * Formulärdelarna för adminvyn. Fälten är numera inramade i stället för
 * understrukna — vid tät ifyllning är det svårt att se var ett fält börjar när
 * det bara finns en tunn linje under. Etiketten är kvar i mono-versaler, som i
 * resten av gränssnittet.
 *
 * Exporterna är oförändrade (Label, Field, Select, TextArea, Button,
 * ErrorNote, formValues) så att alla befintliga anropsställen fungerar.
 */

import clsx from 'clsx';
import UiButton, { type ButtonVariant } from './ui/Button';

const controlClass = clsx(
  'w-full rounded-ctl border border-rule bg-surface px-3 py-2 text-[14px] text-ink outline-none transition-colors',
  'placeholder:text-ink-3 focus:border-brand',
  // Fokusringen görs med color-mix: färgerna är CSS-variabler, och Tailwinds
  // /opacity-modifierare biter inte på dem i Tailwind 3.
  'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]',
  'disabled:cursor-not-allowed disabled:bg-plane disabled:opacity-60'
);

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
      {children}
    </span>
  );
}

function Hint({ hint, error }: { hint?: React.ReactNode; error?: React.ReactNode }) {
  if (error) {
    return (
      <span className="text-[12px] leading-[1.5] text-danger">{error}</span>
    );
  }
  if (!hint) return null;
  return <span className="text-[12px] leading-[1.5] text-ink-3">{hint}</span>;
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
  hint?: React.ReactNode;
  error?: React.ReactNode;
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
  hint,
  error,
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
        aria-invalid={error ? true : undefined}
        className={clsx(controlClass, error && 'border-danger')}
      />
      <Hint hint={hint} error={error} />
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
  hint,
  className,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue?: string | null;
  blankLabel?: string;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        className={clsx(controlClass, 'appearance-none pr-8')}
        style={{
          // Enkel pil i stället för webbläsarens egen, som annars ser
          // annorlunda ut i varje operativsystem.
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237e8c85' stroke-width='2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '12px',
        }}
      >
        {!required && <option value="">{blankLabel}</option>}
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <Hint hint={hint} />
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  hint,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <Label>{label}</Label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        className={clsx(controlClass, 'resize-y leading-[1.6]')}
      />
      <Hint hint={hint} />
    </label>
  );
}

/**
 * Behåller det gamla API:et (`variant="primary" | "quiet"`) men går via den
 * nya knappen, så att befintliga anropsställen byter utseende utan att ändras.
 */
export function Button({
  variant = 'primary',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <UiButton variant={variant} {...rest} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-ctl border px-3 py-2 text-[13px] text-danger"
      style={{
        borderColor: 'color-mix(in srgb, var(--adm-danger) 40%, transparent)',
        background: 'color-mix(in srgb, var(--adm-danger) 9%, transparent)',
      }}
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
