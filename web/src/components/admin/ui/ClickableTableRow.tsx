'use client';

import { useRouter } from 'next/navigation';
import clsx from 'clsx';

type Props = Omit<React.HTMLAttributes<HTMLTableRowElement>, 'onClick' | 'onKeyDown'> & {
  href: string;
  label: string;
};

/** En tabellrad som beter sig som en länk även för tangentbordsanvändare. */
export default function ClickableTableRow({ href, label, className, children, ...rest }: Props) {
  const router = useRouter();

  return (
    <tr
      {...rest}
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={() => router.push(href)}
      onKeyDown={event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        router.push(href);
      }}
      className={clsx(
        'cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-plane focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
        className
      )}
    >
      {children}
    </tr>
  );
}
