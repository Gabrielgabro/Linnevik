import clsx from 'clsx';
import { statusTone, TONE_COLOR } from '@/lib/clients';

/**
 * Status som tonad etikett. Alltid prick *och* text — färgen ensam får aldrig
 * bära informationen. Tonerna kommer från TONE_COLOR i lib/clients.ts.
 */
export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block h-[7px] w-[7px] shrink-0 rounded-full', className)}
      style={{ background: TONE_COLOR[statusTone(status)] }}
    />
  );
}

/** Samma tonade platta som tidigare, men något starkare så den syns på vitt. */
export function pillStyle(color: string) {
  return {
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
  };
}

export default function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium leading-[1.5]',
        className
      )}
      style={pillStyle(TONE_COLOR[statusTone(status)])}
    >
      <StatusDot status={status} />
      {status}
    </span>
  );
}

/** Fristående etikett när tonen är känd direkt, t.ex. "Kopplad till Stripe". */
export function Tag({
  children,
  color = 'var(--viz-ink-3)',
  className,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] leading-[1.5]',
        className
      )}
      style={pillStyle(color)}
    >
      {children}
    </span>
  );
}
