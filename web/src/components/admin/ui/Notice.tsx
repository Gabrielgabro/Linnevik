import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

const TONE = {
  info: { color: 'var(--adm-info)', icon: Info },
  ok: { color: 'var(--adm-ok)', icon: CheckCircle2 },
  warn: { color: 'var(--adm-warn)', icon: AlertTriangle },
  danger: { color: 'var(--adm-danger)', icon: TriangleAlert },
} as const;

/**
 * Meddelanderuta — saknad DATABASE_URL, valideringsfel, bekräftelser.
 * Ersätter de lösa border-l-2-styckena som fanns utspridda på sidorna.
 */
export default function Notice({
  tone = 'info',
  title,
  className,
  children,
}: {
  tone?: keyof typeof TONE;
  title?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const { color, icon: Icon } = TONE[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={clsx('flex items-start gap-3 rounded-card border px-4 py-3 text-[13.5px]', className)}
      style={{
        color: 'var(--viz-ink-2)',
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 9%, transparent)`,
      }}
    >
      <Icon size={17} strokeWidth={1.75} aria-hidden className="mt-[1px] shrink-0" style={{ color }} />
      <div className="flex flex-col gap-1 leading-[1.6]">
        {title && (
          <span className="font-medium" style={{ color }}>
            {title}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
