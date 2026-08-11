'use client';

/**
 * Kundlistan med fritextsökning och statusfilter. Filtreringen sker i
 * webbläsaren: registret är ett par hundra rader, och att slå på servern för
 * varje tangenttryck vore att göra det långsammare, inte snabbare.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { StatusPill } from '@/components/admin/ContactList';
import { ErrorNote } from '@/components/admin/Fields';
import {
  CLIENT_STATUSES,
  PRIORITIES,
  SEGMENTS,
  toneStyle,
  type ClientWithCounts,
} from '@/lib/clients';

const ALL = 'Alla';

/**
 * Åtgärdsraden för markerade kunder. Ligger kvar i botten av fönstret medan
 * man bockar av — annars skulle man tappa bort den i en lista på hundra rader.
 */
function BatchBar({
  ids,
  busy,
  error,
  onRun,
  onClear,
}: {
  ids: number[];
  busy: boolean;
  error: string | null;
  onRun: (action: string, value?: string) => void;
  onClear: () => void;
}) {
  if (ids.length === 0) return null;

  const selectClass =
    'rounded-[3px] border px-2 py-1.5 text-[13px] outline-none disabled:opacity-50';
  const selectStyle = {
    color: 'var(--viz-ink)',
    background: 'var(--viz-surface)',
    borderColor: 'var(--viz-rule)',
  };

  return (
    <div className="sticky bottom-3 z-10 flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[4px] border px-3 py-2.5 shadow-lg"
        style={{
          background: 'var(--viz-surface)',
          borderColor: 'color-mix(in srgb, var(--viz-s1) 40%, transparent)',
        }}
      >
        <span
          className="rounded-full px-2.5 py-[3px] text-[12.5px] font-medium"
          style={{ background: 'var(--viz-s1)', color: '#fff' }}
        >
          {ids.length} {ids.length === 1 ? 'vald' : 'valda'}
        </span>

        <select
          className={selectClass}
          style={selectStyle}
          disabled={busy}
          value=""
          onChange={e => e.target.value && onRun('status', e.target.value)}
        >
          <option value="">Sätt kundstatus…</option>
          {CLIENT_STATUSES.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          style={selectStyle}
          disabled={busy}
          value=""
          onChange={e => e.target.value && onRun('segment', e.target.value)}
        >
          <option value="">Sätt segment…</option>
          {SEGMENTS.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          className={selectClass}
          style={selectStyle}
          disabled={busy}
          value=""
          onChange={e => e.target.value && onRun('priority', e.target.value)}
        >
          <option value="">Sätt prioritet…</option>
          {PRIORITIES.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => onRun('delete')}
          className="rounded-[3px] px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: 'var(--viz-flag)', color: '#fff' }}
        >
          Ta bort
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="ml-auto text-[13px] hover:underline disabled:opacity-50"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          {busy ? 'Arbetar…' : 'Avmarkera'}
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function ClientTable({ clients }: { clients: ClientWithCounts[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [onlyUnworked, setOnlyUnworked] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Bara markeringar som syns just nu räknas. Filtrerar man om, ska en åtgärd
  // aldrig träffa kunder man inte längre har framför sig.
  const selectedVisible = useMemo(
    () => visible.filter(c => selected.has(c.id)).map(c => c.id),
    [visible, selected]
  );
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

  const toggleOne = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach(c => next.delete(c.id));
      else visible.forEach(c => next.add(c.id));
      return next;
    });

  const runBatch = async (action: string, value?: string) => {
    const ids = selectedVisible;
    if (ids.length === 0) return;
    if (
      action === 'delete' &&
      !confirm(
        `Ta bort ${ids.length} ${ids.length === 1 ? 'kund' : 'kunder'}? ` +
          'Kontaktpersonerna tas bort samtidigt.'
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    const response = await fetch('/api/admin/clients/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, value }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error ?? 'Kunde inte utföra åtgärden.');
      return;
    }
    setSelected(new Set());
    router.refresh();
  };

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
        <span className="flex items-center gap-2.5">
          <input
            type="checkbox"
            aria-label="Markera alla i listan"
            checked={allVisibleSelected}
            ref={node => {
              if (node) node.indeterminate = !allVisibleSelected && selectedVisible.length > 0;
            }}
            onChange={toggleAll}
            disabled={visible.length === 0}
            style={{ accentColor: 'var(--viz-s1)' }}
          />
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            {visible.length} av {clients.length} kunder
          </span>
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
          <li
            key={client.id}
            className="flex items-center gap-2.5 border-b pl-1"
            style={{
              borderColor: 'var(--viz-grid)',
              background: selected.has(client.id)
                ? 'color-mix(in srgb, var(--viz-s1) 8%, transparent)'
                : undefined,
            }}
          >
            <input
              type="checkbox"
              aria-label={`Markera ${client.name}`}
              checked={selected.has(client.id)}
              onChange={() => toggleOne(client.id)}
              style={{ accentColor: 'var(--viz-s1)' }}
            />
            <Link
              href={`/admin/clients/${client.id}`}
              className="grid flex-1 grid-cols-[56px_1fr_auto] items-center gap-x-4 gap-y-1 px-2 py-3 transition-colors hover:bg-[var(--viz-plane)] max-[620px]:grid-cols-[56px_1fr]"
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

      <BatchBar
        ids={selectedVisible}
        busy={busy}
        error={error}
        onRun={runBatch}
        onClear={() => setSelected(new Set())}
      />
      {/* Luft under den fastnaglade raden så att sista kunden inte hamnar bakom den. */}
      {selectedVisible.length > 0 && <div className="h-6" />}
    </>
  );
}
