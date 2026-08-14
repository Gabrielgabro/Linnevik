'use client';

/**
 * Kundlistan med fritextsökning och statusfilter. Filtreringen sker i
 * webbläsaren: registret är ett par hundra rader, och att slå på servern för
 * varje tangenttryck vore att göra det långsammare, inte snabbare.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Trash2, Users } from 'lucide-react';
import { ErrorNote } from '@/components/admin/Fields';
import {
  EmptyState,
  pillStyle,
  SearchInput,
  StatusPill,
  Tag,
  Toolbar,
} from '@/components/admin/ui';
import {
  CLIENT_STATUSES,
  PRIORITIES,
  SEGMENTS,
  statusTone,
  TONE_COLOR,
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
    'rounded-ctl border border-rule bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none ' +
    'focus:border-brand disabled:opacity-50';

  return (
    <div className="sticky bottom-3 z-20 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-brand bg-surface px-3 py-2.5 shadow-pop">
        <span className="rounded-full bg-brand px-2.5 py-[3px] text-[12.5px] font-medium text-brand-fg">
          {ids.length} {ids.length === 1 ? 'vald' : 'valda'}
        </span>

        <select
          className={selectClass}
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
          className="inline-flex items-center gap-1.5 rounded-ctl bg-danger px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          Ta bort
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="ml-auto text-[13px] text-ink-3 hover:underline disabled:opacity-50"
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
      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Namn, kundnr. eller segment"
        />
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={onlyUnworked}
            onChange={e => setOnlyUnworked(e.target.checked)}
            style={{ accentColor: 'var(--adm-brand)' }}
          />
          Bara obearbetade
        </label>
      </Toolbar>

      {/* Statusfiltren behåller sin egen ton även omarkerade — det är den enda
          platsen där hela statusskalan syns bredvid varandra. */}
      <Toolbar className="gap-y-2">
        <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
          Kundstatus
        </span>
        {[ALL, ...CLIENT_STATUSES].map(option => {
          const active = status === option;
          const color =
            option === ALL ? 'var(--adm-brand)' : TONE_COLOR[statusTone(option)];
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? ALL : option)}
              className="rounded-full px-3 py-[5px] text-[12.5px] leading-[1.5] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text"
              style={
                active
                  ? { color: '#fff', background: color, border: `1px solid ${color}`, fontWeight: 500 }
                  : pillStyle(color)
              }
            >
              {option}
            </button>
          );
        })}
      </Toolbar>

      {visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ingen kund matchar filtret"
          description="Rensa sökningen eller välj en annan kundstatus."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-rule bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-rule bg-plane px-4 py-2.5">
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
                style={{ accentColor: 'var(--adm-brand)' }}
              />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
                {visible.length} av {clients.length} kunder
              </span>
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 max-[620px]:hidden">
              Kontakter · Bearbetade
            </span>
          </div>

          <ul className="flex flex-col">
            {visible.map(client => (
              <li
                key={client.id}
                className="flex items-center gap-2.5 border-b border-grid pl-4 last:border-b-0"
                style={
                  selected.has(client.id)
                    ? { background: 'color-mix(in srgb, var(--adm-brand) 7%, transparent)' }
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  aria-label={`Markera ${client.name}`}
                  checked={selected.has(client.id)}
                  onChange={() => toggleOne(client.id)}
                  style={{ accentColor: 'var(--adm-brand)' }}
                />
                <Link
                  href={`/admin/clients/${client.id}`}
                  className="grid flex-1 grid-cols-[56px_1fr_auto] items-center gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-plane max-[620px]:grid-cols-[56px_1fr]"
                >
                  <span className="font-mono text-[12px] tabular-nums text-ink-3">
                    {client.customerNo}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] text-ink">{client.name}</span>
                    {client.segment && <Tag>{client.segment}</Tag>}
                    <StatusPill status={client.status} />
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-ink-3 max-[620px]:hidden">
                    {client.contactCount} · {client.workedCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
