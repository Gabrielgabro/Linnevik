'use client';

/**
 * Kategoriträdet. Hierarkin är en adjacenslista i databasen — varje rad pekar
 * på sin förälder — så trädet byggs här vid renderingen i stället för att
 * lagras. Djupet är litet och listan kort, så det är billigare än att hålla en
 * materialiserad väg uppdaterad.
 */

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, ErrorNote, Field, formValues } from '@/components/admin/Fields';
import type { CollectionListRow } from '@/lib/productsDb';

type Node = CollectionListRow & { depth: number };

/**
 * Platt lista i trädordning. Rader vars förälder saknas eller är inaktiv
 * hamnar sist på rotnivå i stället för att försvinna — en kategori man inte
 * ser är en kategori man inte kan laga.
 */
function flatten(rows: CollectionListRow[]): Node[] {
  const byParent = new Map<number | null, CollectionListRow[]>();
  const ids = new Set(rows.map(row => row.id));
  for (const row of rows) {
    const parent = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(row);
    byParent.set(parent, list);
  }

  const out: Node[] = [];
  const seen = new Set<number>();
  const walk = (parentId: number | null, depth: number) => {
    for (const row of byParent.get(parentId) ?? []) {
      // Skydd mot en cykel som redan hunnit in i databasen: rita raden en gång
      // och gå inte vidare ner i den.
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ ...row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function CollectionRow({ node, options }: { node: Node; options: CollectionListRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = formValues(event.currentTarget);
    const response = await fetch(`/api/admin/collections/${node.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleSv: values.titleSv,
        titleEn: values.titleEn,
        handle: values.handle,
        parentId: values.parentId ? Number(values.parentId) : null,
        position: values.position,
        active: values.active === 'on',
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara.');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  const remove = async () => {
    if (!confirm(`Ta bort ${node.titleSv}?`)) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/collections/${node.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ta bort kategorin.');
      return;
    }
    router.refresh();
  };

  return (
    <li className="border-b" style={{ borderColor: 'var(--viz-grid)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 py-3 text-left transition-colors hover:bg-[var(--viz-plane)]"
        style={{ paddingLeft: `${node.depth * 20}px` }}
      >
        <span className="flex flex-col gap-0.5">
          <span
            className="text-[14px]"
            style={{ color: node.active ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}
          >
            {node.depth > 0 && <span aria-hidden>└ </span>}
            {node.titleSv}
            <span className="ml-2 text-[13px]" style={{ color: 'var(--viz-ink-3)' }}>
              {node.titleEn}
            </span>
          </span>
          <span className="font-mono text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
            {node.handle} · pos {node.position}
            {!node.active && ' · inaktiv'}
          </span>
        </span>
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          {node.productCount} {node.productCount === 1 ? 'produkt' : 'produkter'}
        </span>
      </button>

      {open && (
        <form onSubmit={save} className="flex flex-col gap-4 pb-5 pt-1">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
            <Field label="Titel (sv)" name="titleSv" required defaultValue={node.titleSv} />
            <Field label="Titel (en)" name="titleEn" required defaultValue={node.titleEn} />
            <Field label="Handle" name="handle" defaultValue={node.handle} />
            <Field
              label="Position"
              name="position"
              type="number"
              defaultValue={String(node.position)}
            />
            <label className="flex flex-col gap-1.5">
              <span
                className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--viz-ink-3)' }}
              >
                Förälder
              </span>
              <select
                name="parentId"
                defaultValue={node.parentId ?? ''}
                className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
                style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
              >
                <option value="">— ingen (rot)</option>
                {options
                  .filter(option => option.id !== node.id)
                  .map(option => (
                    <option key={option.id} value={option.id}>
                      {option.titleSv}
                    </option>
                  ))}
              </select>
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[13px]"
              style={{ color: 'var(--viz-ink-2)' }}
            >
              <input
                type="checkbox"
                name="active"
                defaultChecked={node.active}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              Aktiv
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sparar…' : 'Spara'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button
              type="button"
              variant="quiet"
              disabled={busy}
              onClick={remove}
              style={{ color: 'var(--viz-flag)' }}
              className="ml-auto"
            >
              Ta bort
            </Button>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </form>
      )}
    </li>
  );
}

function NewCollection({ options }: { options: CollectionListRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: 'var(--viz-s1)', color: '#fff' }}
        className="self-start font-medium"
      >
        + Ny kategori
      </Button>
    );
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = formValues(event.currentTarget);
    const response = await fetch('/api/admin/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleSv: values.titleSv,
        titleEn: values.titleEn,
        handle: values.handle || undefined,
        parentId: values.parentId ? Number(values.parentId) : null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte skapa kategorin.');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pt-2">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field label="Titel (sv)" name="titleSv" required placeholder="Täcken" />
        <Field label="Titel (en)" name="titleEn" required placeholder="Duvets" />
        <Field label="Handle" name="handle" placeholder="lämna tomt för automatisk" />
        <label className="flex flex-col gap-1.5">
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            Förälder
          </span>
          <select
            name="parentId"
            defaultValue=""
            className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
            style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
          >
            <option value="">— ingen (rot)</option>
            {options.map(option => (
              <option key={option.id} value={option.id}>
                {option.titleSv}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Skapar…' : 'Skapa'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          Avbryt
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}

export default function CollectionTree({ collections }: { collections: CollectionListRow[] }) {
  const nodes = useMemo(() => flatten(collections), [collections]);

  return (
    <>
      <ul className="flex flex-col">
        {nodes.map(node => (
          <CollectionRow key={node.id} node={node} options={collections} />
        ))}
      </ul>

      {nodes.length === 0 && (
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Inga kategorier ännu.
        </p>
      )}

      <NewCollection options={collections} />
    </>
  );
}
