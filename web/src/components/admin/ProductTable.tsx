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
import { ChevronRight, ImageOff, Package, Plus } from 'lucide-react';
import { ErrorNote } from '@/components/admin/Fields';
import {
  Button,
  EmptyState,
  FilterPill,
  SearchInput,
  Tag,
  Toolbar,
} from '@/components/admin/ui';
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

/** Ett predikat per filter, så att både urval och räknare går via samma regel. */
const MATCHES: Record<Filter, (product: ProductListRow) => boolean> = {
  alla: () => true,
  'i-lager': product => product.stock > 0,
  slut: product => product.stock <= 0,
  'utan-stripe': product => !product.stripeProductId,
  'utan-kategori': product => !product.primaryCollection,
  'utan-leverantor': product => product.supplier === 'unknown',
  inaktiva: product => !product.active,
};

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
      <Button type="button" onClick={() => setOpen(true)} className="shrink-0">
        <Plus size={16} strokeWidth={2} aria-hidden />
        Ny produkt
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
    <form
      onSubmit={submit}
      className="flex w-full flex-col gap-2 rounded-card border border-rule bg-surface p-4 shadow-card"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
            Titel
          </span>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder="Täcke - Sebastian"
            className="w-full rounded-ctl border border-rule bg-surface px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--adm-brand-text)_22%,transparent)]"
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

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(option => [option.key, products.filter(MATCHES[option.key]).length])
      ) as Record<Filter, number>,
    [products]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(product => {
      if (!MATCHES[filter](product)) return false;
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
      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Titel, handle, tagg eller leverantör"
        />
        <NewProductForm onDone={() => router.refresh()} />
      </Toolbar>

      <Toolbar className="gap-y-2">
        {FILTERS.map(option => (
          <FilterPill
            key={option.key}
            active={filter === option.key}
            count={counts[option.key]}
            onClick={() => setFilter(filter === option.key ? 'alla' : option.key)}
          >
            {option.label}
          </FilterPill>
        ))}
      </Toolbar>

      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Ingen produkt matchar filtret"
          description="Rensa sökningen eller välj ett annat filter."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-rule bg-surface shadow-card">
          <div className="flex items-baseline justify-between border-b border-rule bg-plane px-4 py-2.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">
              {visible.length} av {products.length} produkter
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 max-[620px]:hidden">
              Pris · Lager
            </span>
          </div>

          <ul className="flex flex-col">
            {visible.map(product => (
              <li key={product.id} className="border-b border-grid last:border-b-0">
                <Link
                  href={`/admin/products/${product.handle}`}
                  className="group grid grid-cols-[44px_1fr_auto_16px] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-plane"
                >
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-ctl border border-rule bg-plane">
                    {product.thumbnailUrl ? (
                      <Image
                        src={product.thumbnailUrl}
                        alt={product.thumbnailAlt ?? ''}
                        width={44}
                        height={44}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff size={16} strokeWidth={1.5} aria-hidden className="text-ink-3" />
                    )}
                  </span>

                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={
                          product.active ? 'text-[14px] text-ink' : 'text-[14px] text-ink-3'
                        }
                      >
                        {product.title}
                      </span>
                      {!product.active && <Tag>Inaktiv</Tag>}
                      {/* Utan Stripe-produkt går varan att sälja ändå — kassan
                          faller tillbaka på ett namn — men den blir osynlig i
                          Stripes rapporter, och det är värt att se här. */}
                      {!product.stripeProductId && (
                        <Tag color="var(--adm-danger)">Saknar Stripe</Tag>
                      )}
                      {!product.primaryCollection && (
                        <Tag color="var(--adm-warn)">Utan kategori</Tag>
                      )}
                    </span>
                    <span className="font-mono text-[11.5px] text-ink-3">
                      {product.handle} · {product.variantCount}{' '}
                      {product.variantCount === 1 ? 'variant' : 'varianter'}
                      {` · ${product.supplier === 'unknown' ? 'okänd leverantör' : product.supplier}`}
                    </span>
                  </span>

                  <span className="flex flex-col items-end gap-1 max-[620px]:hidden">
                    <span className="font-mono text-[12.5px] tabular-nums text-ink">
                      {priceRange(product)}
                    </span>
                    <span
                      className={
                        product.stock > 0
                          ? 'font-mono text-[11.5px] tabular-nums text-ink-3'
                          : 'font-mono text-[11.5px] font-medium tabular-nums text-danger'
                      }
                    >
                      {product.stock} st
                    </span>
                  </span>

                  <ChevronRight
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
