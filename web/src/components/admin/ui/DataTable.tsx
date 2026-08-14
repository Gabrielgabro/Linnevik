import clsx from 'clsx';

/**
 * Tabellskal för listvyerna. Rullar horisontellt inuti sig själv så att sidan
 * aldrig får en vågrät rullningslist, och håller rubrikraden klistrad.
 */
export function TableShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        'overflow-x-auto rounded-card border border-rule bg-surface shadow-card',
        className
      )}
    >
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
  className,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={clsx(
        'sticky top-0 z-10 whitespace-nowrap border-b border-rule bg-plane px-4 py-2.5',
        'font-mono text-[10.5px] font-normal uppercase tracking-[0.12em] text-ink-3',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  numeric,
  className,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Siffror sätts i mono med tabular-nums så kolumnen står still. */
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={clsx(
        'border-b border-grid px-4 py-3 align-middle text-ink-2',
        numeric && 'font-mono tabular-nums text-ink',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      {...rest}
      className={clsx('transition-colors last:[&>td]:border-b-0 hover:bg-plane', className)}
    >
      {children}
    </tr>
  );
}
