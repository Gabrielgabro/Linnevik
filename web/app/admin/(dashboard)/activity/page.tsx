import { Activity } from 'lucide-react';
import { EmptyState, Notice, PageHeader, Panel } from '@/components/admin/ui';
import { accentFor } from '../nav';
import { actionLabel, activityConfigured, isFlagged, list } from '@/lib/adminActivity';

export const dynamic = 'force-dynamic';

const stamp = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Stockholm',
});

/** Grupperar per dag, så att listan går att läsa uppifrån som en dagbok. */
function dayKey(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

/** Detaljerna är fritt formade — visa dem som `nyckel värde`, inte som JSON. */
function detailText(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key} ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

export default async function AdminActivityPage() {
  const rows = await list();

  const days = rows.reduce<{ day: string; rows: typeof rows }[]>((groups, row) => {
    const day = dayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
    return groups;
  }, []);

  return (
    <>
      <PageHeader
        kicker={`Senaste ${rows.length} händelserna`}
        title="Vad som hänt i adminvyn"
        accent={accentFor('/admin/activity')}
        description="Inloggningar, sparade prisförslag och botkörningar. Tider i svensk tid."
      />

      {!activityConfigured() && (
        <Notice tone="danger" title="DATABASE_URL saknas">
          Ingenting loggas i den här miljön.
        </Notice>
      )}

      {activityConfigured() && rows.length === 0 && (
        <EmptyState
          icon={Activity}
          title="Inget loggat ännu"
          description="Så fort någon loggar in eller sparar ett prisförslag dyker det upp här."
        />
      )}

      {days.map(group => (
        <Panel key={group.day} meta={group.day} padded={false}>
          <ul className="flex flex-col">
            {group.rows.map(row => (
              <li
                key={row.id}
                className="grid grid-cols-[64px_112px_1fr] items-baseline gap-3 border-t border-grid px-5 py-2.5 transition-colors hover:bg-plane max-[620px]:grid-cols-[64px_1fr] sm:px-6"
              >
                <span className="font-mono text-[12px] tabular-nums text-ink-3">
                  {stamp.format(row.createdAt).split(' ')[1]}
                </span>
                <span className="truncate text-[13.5px] text-ink-2 max-[620px]:hidden">
                  {row.actor}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className="flex items-baseline gap-1.5 text-[13.5px]"
                    style={{ color: isFlagged(row.action) ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
                  >
                    {isFlagged(row.action) && (
                      <span
                        aria-hidden
                        className="inline-block h-[6px] w-[6px] shrink-0 translate-y-[-1px] rounded-full bg-danger"
                      />
                    )}
                    <span className="min-[621px]:hidden">{row.actor} · </span>
                    {actionLabel(row.action)}
                  </span>
                  {detailText(row.detail) && (
                    <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
                      {detailText(row.detail)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </>
  );
}
