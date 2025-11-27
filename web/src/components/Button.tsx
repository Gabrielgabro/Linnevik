import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({
  variant = 'primary',
  className,
  children,
  style,
  ...rest
}: Props) {
  // Base styles shared by all button variants. Uses token-based ring color.
  const base =
    'inline-block px-6 py-3 font-medium rounded-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-custom disabled:opacity-50 disabled:cursor-not-allowed';

  // Token-backed variants
  // - Primary: solid accent background from tokens, with on-accent text (fallback to white until token is added)
  // - Secondary: subtle surface background so it always reads as a button, plus light border & primary text
  const styles: Record<Variant, string> = {
    primary: 'bg-accent-primary text-white',
    secondary: 'bg-overlay border border-light text-primary hover-surface',
  };

  // Prefer text color tokens if present; fall back to safe defaults
  const computedStyle: React.CSSProperties | undefined =
    variant === 'primary'
      ? { color: 'var(--color-button-primary-fg, #ffffff)', ...(style || {}) }
      : variant === 'secondary'
      ? { color: 'var(--color-button-secondary-fg, var(--color-text-primary))', ...(style || {}) }
      : style;

  return (
    <button className={clsx(base, styles[variant], className)} style={computedStyle} {...rest}>
      {children}
    </button>
  );
}

