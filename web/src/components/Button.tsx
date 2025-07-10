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
  ...rest
}: Props) {
  const base =
    'inline-block px-6 py-3 font-medium rounded-md transition-colors';
  const styles = {
    primary:  'bg-accent text-white hover:bg-ink',
    secondary:'border border-accent text-accent hover:bg-accent hover:text-white',
  };

  return (
    <button className={clsx(base, styles[variant], className)} {...rest}>
      {children}
    </button>
  );
}

