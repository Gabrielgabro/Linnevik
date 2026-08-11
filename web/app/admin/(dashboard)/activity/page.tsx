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
      <header
        className="flex flex-col gap-[18px] border-b border-t-2 pb-5 pt-[18px]"
        style={{ borderTopColor: 'var(--viz-ink)', borderBottomColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Aktivitet · Senaste {rows.length} händelserna
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          Vad som hänt i adminvyn
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
          Inloggningar, sparade prisförslag och botkörningar. Tider i svensk tid.
        </p>
      </header>

      {!activityConfigured() && (
        <p
          className="border-l-2 pl-3 text-[13.5px]"
          style={{ color: 'var(--viz-ink-2)', borderColor: 'var(--viz-flag)' }}
        >
          DATABASE_URL saknas, så ingenting loggas i den här miljön.
        </p>
      )}

      {activityConfigured() && rows.length === 0 && (
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Inget loggat ännu.
        </p>
      )}

      {days.map(group => (
        <section key={group.day} className="flex flex-col gap-0">
          <h2
            className="border-b pb-2 font-mono text-[10.5px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--viz-ink-3)', borderColor: 'var(--viz-rule)' }}
          >
            {group.day}
          </h2>
          <ul className="flex flex-col">
            {group.rows.map(row => (
              <li
                key={row.id}
                className="grid grid-cols-[64px_96px_1fr] items-baseline gap-3 border-b py-2.5 max-[620px]:grid-cols-[64px_1fr]"
                style={{ borderColor: 'var(--viz-grid)' }}
              >
                <span
                  className="font-mono text-[12px] tabular-nums"
                  style={{ color: 'var(--viz-ink-3)' }}
                >
                  {stamp.format(row.createdAt).split(' ')[1]}
                </span>
                <span
                  className="text-[13.5px] max-[620px]:hidden"
                  style={{ color: 'var(--viz-ink-2)' }}
                >
                  {row.actor}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className="text-[13.5px]"
                    style={{ color: isFlagged(row.action) ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
                  >
                    <span className="min-[621px]:hidden">{row.actor} · </span>
                    {actionLabel(row.action)}
                  </span>
                  {detailText(row.detail) && (
                    <span
                      className="font-mono text-[11.5px] tabular-nums"
                      style={{ color: 'var(--viz-ink-3)' }}
                    >
                      {detailText(row.detail)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
