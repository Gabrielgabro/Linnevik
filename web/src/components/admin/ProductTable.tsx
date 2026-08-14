'use client';

/**
 * Produktlistan. Samma hållning som kundlistan: filtreringen sker i webbläsaren
 * eftersom katalogen är liten, och raderna är en lista och inte en tabell så att
 * kolumnerna kan falla bort på en smal skärm.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, ErrorNote } from '@/components/admin/Fields';
import { formatMinor } from '@/lib/money';
import type { ProductListRow } from '@/lib/productsDb';

type Filter =
  | 'alla'
  | 'i-lager'
  | 'slut'
  | 'utan-stripe'
  | 'utan-kategori'
  | 'utan-leverantor'
  | 'inaktiva';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'alla', label: 'Alla' },
  { key: 'i-lager', label: 'I lager' },
  { key: 'slut', label: 'Slut' },
  { key: 'utan-stripe', label: 'Saknar Stripe' },
  { key: 'utan-kategori', label: 'Utan kategori' },
  { key: 'utan-leverantor', label: 'Okänd leverantör' },
  { key: 'inaktiva', label: 'Inaktiva' },
];

function priceRange(product: ProductListRow): string {
  if (product.priceMinMinor === null) return '—';
  const currency = product.currency ?? 'sek';
  const low = formatMinor(product.priceMinMinor, currency);
  if (product.priceMaxMinor === product.priceMinMinor) return low;
  return `${low}–${formatMinor(product.priceMaxMinor ?? product.priceMinMinor, currency)}`;
}

/** Nyskapade produkter går direkt till detaljsidan — där finns allt annat. */
function NewProductForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
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
        + Ny produkt
      </Button>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte skapa produkten.');
      return;
    }
    onDone();
    router.push(`/admin/products/${data.product.handle}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <span
            className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
            style={{ color: 'var(--viz-ink-3)' }}
          >
            Titel
          </span>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder="Täcke - Sebastian"
            className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
            style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
          />
        </label>
        <Button type="submit" disabled={busy || !title.trim()}>
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

export default function ProductTable({ products }: { products: ProductListRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('alla');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(product => {
      if (filter === 'i-lager' && product.stock <= 0) return false;
      if (filter === 'slut' && product.stock > 0) return false;
      if (filter === 'utan-stripe' && product.stripeProductId) return false;
      if (filter === 'utan-kategori' && product.primaryCollection) return false;
      if (filter === 'utan-leverantor' && product.supplier !== 'unknown') return false;
      if (filter === 'inaktiva' && product.active) return false;
      if (!needle) return true;
      return (
        product.title.toLowerCase().includes(needle) ||
        product.handle.toLowerCase().includes(needle) ||
        product.supplier.toLowerCase().includes(needle) ||
        product.tags.some(tag => tag.toLowerCase().includes(needle))
      );
    });
  }, [products, query, filter]);

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
            placeholder="Titel, handle, tagg eller leverantör"
            className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
            style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
          />
        </label>
        <NewProductForm onDone={() => router.refresh()} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(option => {
          const active = filter === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? 'alla' : option.key)}
              className="rounded-full px-2.5 py-[3px] text-[12.5px] leading-[1.5] transition-opacity"
              style={
                active
                  ? {
                      color: 'var(--viz-surface)',
                      background: 'var(--viz-ink)',
                      border: '1px solid var(--viz-ink)',
                    }
                  : {
                      color: 'var(--viz-ink-2)',
                      background: 'transparent',
                      border: '1px solid var(--viz-rule)',
                    }
              }
            >
              {option.label}
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
          {visible.length} av {products.length} produkter
        </span>
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.14em] max-[620px]:hidden"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Pris · Lager
        </span>
      </div>

      <ul className="flex flex-col">
        {visible.map(product => (
          <li key={product.id} className="border-b" style={{ borderColor: 'var(--viz-grid)' }}>
            <Link
              href={`/admin/products/${product.handle}`}
              className="grid grid-cols-[44px_1fr_auto] items-center gap-x-4 gap-y-1 px-2 py-3 transition-colors hover:bg-[var(--viz-plane)]"
            >
              <span
                className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[3px]"
                style={{ background: 'var(--viz-plane)', border: '1px solid var(--viz-rule)' }}
              >
                {product.thumbnailUrl ? (
                  <Image
                    src={product.thumbnailUrl}
                    alt={product.thumbnailAlt ?? ''}
                    width={44}
                    height={44}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-mono text-[10px]" style={{ color: 'var(--viz-ink-3)' }}>
                    —
                  </span>
                )}
              </span>

              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span
                    className="text-[14px]"
                    style={{ color: product.active ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}
                  >
                    {product.title}
                  </span>
                  {!product.active && (
                    <span
                      className="rounded-full px-2 py-[2px] text-[12px] leading-[1.5]"
                      style={{
                        color: 'var(--viz-ink-3)',
                        background: 'var(--viz-plane)',
                        border: '1px solid var(--viz-rule)',
                      }}
                    >
                      Inaktiv
                    </span>
                  )}
                  {/* Utan Stripe-produkt går varan att sälja ändå — kassan
                      faller tillbaka på ett namn — men den blir osynlig i
                      Stripes rapporter, och det är värt att se här. */}
                  {!product.stripeProductId && (
                    <span
                      className="rounded-full px-2 py-[2px] text-[12px] leading-[1.5]"
                      style={{
                        color: 'var(--viz-flag)',
                        background: 'color-mix(in srgb, var(--viz-flag) 8%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--viz-flag) 40%, transparent)',
                      }}
                    >
                      Saknar Stripe
                    </span>
                  )}
                </span>
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: 'var(--viz-ink-3)' }}
                >
                  {product.handle} · {product.variantCount}{' '}
                  {product.variantCount === 1 ? 'variant' : 'varianter'}
                  {product.primaryCollection ? ` · ${product.primaryCollection}` : ' · ingen kategori'}
                  {` · ${product.supplier === 'unknown' ? 'okänd leverantör' : product.supplier}`}
                </span>
              </span>

              <span className="flex flex-col items-end gap-1 max-[620px]:hidden">
                <span
                  className="font-mono text-[12.5px] tabular-nums"
                  style={{ color: 'var(--viz-ink)' }}
                >
                  {priceRange(product)}
                </span>
                <span
                  className="font-mono text-[11.5px] tabular-nums"
                  style={{ color: product.stock > 0 ? 'var(--viz-ink-3)' : 'var(--viz-flag)' }}
                >
                  {product.stock} st
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Ingen produkt matchar filtret.
        </p>
      )}
    </>
  );
}
