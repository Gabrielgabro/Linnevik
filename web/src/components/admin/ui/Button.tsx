import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const VARIANT: Record<ButtonVariant, string> = {
  // Primärknappen är numera varumärkets gröna, inte svart.
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-card',
  secondary: 'border border-rule bg-surface text-ink hover:bg-plane',
  quiet: 'text-ink-3 hover:bg-plane hover:text-ink-2',
  // color-mix i stället för Tailwinds /opacity: färgerna är CSS-variabler och
  // opacitetsmodifieraren fungerar inte på dem i Tailwind 3.
  danger:
    'text-danger border border-[color-mix(in_srgb,var(--adm-danger)_38%,transparent)] ' +
    'bg-[color-mix(in_srgb,var(--adm-danger)_9%,transparent)] ' +
    'hover:bg-[color-mix(in_srgb,var(--adm-danger)_18%,transparent)]',
};

const SIZE = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-[12.5px]',
  md: 'gap-2 px-3.5 py-2 text-[13.5px]',
} as const;

export const buttonClass = (
  variant: ButtonVariant = 'primary',
  size: keyof typeof SIZE = 'md'
) =>
  clsx(
    'inline-flex items-center justify-center rounded-ctl font-medium transition-colors',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text',
    'disabled:pointer-events-none disabled:opacity-50',
    SIZE[size],
    VARIANT[variant]
  );

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof SIZE;
}) {
  return (
    <button {...rest} className={clsx(buttonClass(variant, size), className)}>
      {children}
    </button>
  );
}
