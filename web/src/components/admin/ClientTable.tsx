'use client';

/**
 * Kundlistan med fritextsökning och statusfilter. Filtreringen sker i
 * webbläsaren: registret är ett par hundra rader, och att slå på servern för
 * varje tangenttryck vore att göra det långsammare, inte snabbare.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { StatusPill } from '@/components/admin/ContactList';
import { CLIENT_STATUSES, toneStyle, type ClientWithCounts } from '@/lib/clients';

const ALL = 'Alla';

export default function ClientTable({ clients }: { clients: ClientWithCounts[] }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [onlyUnworked, setOnlyUnworked] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter(client => {
      if (status !== ALL && client.status !== status) return false;
      if (onlyUnworked && client.workedCount > 0) return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        client.customerNo.toLowerCase().includes(needle) ||
        (client.segment ?? '').toLowerCase().includes(needle)
      );
    });
  }, [clients, query, status, onlyUnworked]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            Sök
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Namn, kundnr. eller segment"
            className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
            style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
          />
        </label>

        <label
          className="flex cursor-pointer items-center gap-2 pb-2 text-[13px]"
          style={{ color: 'var(--viz-ink-2)' }}
        >
          <input
            type="checkbox"
            checked={onlyUnworked}
            onChange={e => setOnlyUnworked(e.target.checked)}
            style={{ accentColor: 'var(--viz-s1)' }}
          />
          Bara obearbetade
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Kundstatus
        </span>
        {[ALL, ...CLIENT_STATUSES].map(option => {
          const active = status === option;
          const tone =
            option === ALL
              ? { color: 'var(--viz-ink-2)', background: 'transparent', border: '1px solid var(--viz-rule)' }
              : toneStyle(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? ALL : option)}
              className="rounded-full px-2.5 py-[3px] text-[12.5px] leading-[1.5] transition-opacity"
              style={
                active
                  ? {
                      color: 'var(--viz-surface)',
                      background: option === ALL ? 'var(--viz-ink)' : tone.color,
                      border: `1px solid ${option === ALL ? 'var(--viz-ink)' : tone.color}`,
                    }
                  : tone
              }
            >
              {option}
            </button>
          );
        })}
      </div>

      <div
        className="flex items-baseline justify-between border-b pb-2"
        style={{ borderColor: 'var(--viz-rule)' }}
      >
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          {visible.length} av {clients.length} kunder
        </span>
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.14em] max-[620px]:hidden"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Kontakter · Bearbetade
        </span>
      </div>

      <ul className="flex flex-col">
        {visible.map(client => (
          <li key={client.id} className="border-b" style={{ borderColor: 'var(--viz-grid)' }}>
            <Link
              href={`/admin/clients/${client.id}`}
              className="grid grid-cols-[56px_1fr_auto] items-center gap-x-4 gap-y-1 px-2 py-3 transition-colors hover:bg-[var(--viz-plane)] max-[620px]:grid-cols-[56px_1fr]"
            >
              <span
                className="font-mono text-[12px] tabular-nums"
                style={{ color: 'var(--viz-ink-3)' }}
              >
                {client.customerNo}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-[14px]" style={{ color: 'var(--viz-ink)' }}>
                  {client.name}
                </span>
                {client.nameTruncated && (
                  <span
                    title="Namnet kapades i källfilen och behöver kompletteras"
                    className="rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.1em]"
                    style={{
                      color: 'var(--viz-s2)',
                      background: 'color-mix(in srgb, var(--viz-s2) 11%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--viz-s2) 28%, transparent)',
                    }}
                  >
                    kapat namn
                  </span>
                )}
                {client.segment && (
                  <span
                    className="rounded-full px-2 py-[2px] text-[12px] leading-[1.5]"
                    style={{
                      color: 'var(--viz-ink-2)',
                      background: 'var(--viz-plane)',
                      border: '1px solid var(--viz-rule)',
                    }}
                  >
                    {client.segment}
                  </span>
                )}
                <StatusPill status={client.status} />
              </span>
              <span
                className="font-mono text-[12px] tabular-nums max-[620px]:hidden"
                style={{ color: 'var(--viz-ink-3)' }}
              >
                {client.contactCount} · {client.workedCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Ingen kund matchar filtret.
        </p>
      )}
    </>
  );
}
