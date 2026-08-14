import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

/** Tom lista, tomt sökresultat. Tidigare bara en grå textrad. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center gap-2.5 rounded-card border border-dashed border-rule bg-surface px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <span className="mb-1 rounded-full bg-plane p-3 text-ink-3">
          <Icon size={22} strokeWidth={1.5} aria-hidden />
        </span>
      )}
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && (
        <p className="max-w-[46ch] text-[13.5px] leading-[1.6] text-ink-2">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
