'use client';

/**
 * Produktkortet. Allt en produkt är, på en sida: texter, bilder, varianter och
 * kategorier. Varje panel sparar för sig — man ändrar ett pris utan att först
 * behöva ta ställning till beskrivningen.
 */

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote, Field, TextArea, formValues } from '@/components/admin/Fields';
import { formatMinor, toMinor } from '@/lib/money';
import type { CollectionListRow, ProductDetail, VariantWithUsage } from '@/lib/productsDb';

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-4 border-t pt-5"
      style={{ borderColor: 'var(--viz-rule)' }}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="font-mono text-[11px] uppercase tracking-[0.14em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          {title}
        </h2>
        {note && (
          <p className="max-w-[62ch] text-[13px] leading-[1.6]" style={{ color: 'var(--viz-ink-2)' }}>
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Texterna. Svenska och engelska sida vid sida — sajten är tvåspråkig. */
function ContentPanel({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const { product } = detail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const values = formValues(event.currentTarget);
    const response = await fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        active: values.active === 'on',
        tags: values.tags,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara.');
      return;
    }
    setSaved(true);
    // Handlen kan ha ändrats, och då är URL:en vi står på inte längre rätt.
    if (data.product?.handle && data.product.handle !== product.handle) {
      router.replace(`/admin/products/${data.product.handle}`);
      return;
    }
    router.refresh();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field label="Titel (sv)" name="title" required defaultValue={product.title} />
        <Field label="Titel (en)" name="titleEn" defaultValue={product.titleEn} />
        <Field label="Handle" name="handle" defaultValue={product.handle} />
        <Field
          label="Taggar"
          name="tags"
          defaultValue={product.tags.join(', ')}
          placeholder="MTO, dun"
        />
        <Field label="Typ" name="productType" defaultValue={product.productType} />
        <Field label="Leverantör" name="vendor" defaultValue={product.vendor} />
      </div>

      <TextArea
        label="Beskrivning (sv) — HTML"
        name="descriptionHtml"
        defaultValue={product.descriptionHtml}
        rows={6}
      />
      <TextArea
        label="Beskrivning (en) — HTML"
        name="descriptionHtmlEn"
        defaultValue={product.descriptionHtmlEn}
        rows={6}
      />

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field label="SEO-titel" name="seoTitle" defaultValue={product.seoTitle} />
        <Field label="SEO-beskrivning" name="seoDescription" defaultValue={product.seoDescription} />
      </div>

      <label
        className="flex cursor-pointer items-center gap-2 text-[13px]"
        style={{ color: 'var(--viz-ink-2)' }}
      >
        <input
          type="checkbox"
          name="active"
          defaultChecked={product.active}
          style={{ accentColor: 'var(--viz-s1)' }}
        />
        Aktiv — visas på sajten och går att sälja
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Sparar…' : 'Spara'}
        </Button>
        {saved && (
          <span className="text-[13px]" style={{ color: 'var(--viz-ink-3)' }}>
            Sparat.
          </span>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}

function ImagePanel({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/admin/products/${detail.product.id}/images`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    event.target.value = '';
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ladda upp bilden.');
      return;
    }
    router.refresh();
  };

  const remove = async (id: number) => {
    if (!confirm('Ta bort bilden?')) return;
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/admin/products/${detail.product.id}/images?imageId=${id}`,
      { method: 'DELETE' }
    );
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ta bort bilden.');
      return;
    }
    router.refresh();
  };

  /** Flyttar en bild ett steg. Enklare än drag & drop och fungerar med tangentbord. */
  const move = async (index: number, direction: -1 | 1) => {
    const order = detail.images.map(image => image.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];

    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${detail.product.id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    setBusy(false);
    if (!response.ok) {
      setError('Kunde inte spara ordningen.');
      return;
    }
    router.refresh();
  };

  const saveAlt = async (id: number, altText: string) => {
    await fetch(`/api/admin/products/${detail.product.id}/images`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId: id, altText }),
    });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      {detail.images.length === 0 && (
        <p className="text-[13.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          Inga bilder ännu.
        </p>
      )}

      <ul className="flex flex-col">
        {detail.images.map((image, index) => (
          <li
            key={image.id}
            className="grid grid-cols-[72px_1fr_auto] items-center gap-4 border-b py-3"
            style={{ borderColor: 'var(--viz-grid)' }}
          >
            <span
              className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[3px]"
              style={{ background: 'var(--viz-plane)', border: '1px solid var(--viz-rule)' }}
            >
              <Image
                src={image.url}
                alt={image.altText ?? ''}
                width={72}
                height={72}
                className="h-full w-full object-cover"
              />
            </span>

            <label className="flex flex-col gap-1.5">
              <span
                className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--viz-ink-3)' }}
              >
                Alt-text
              </span>
              <input
                defaultValue={image.altText ?? ''}
                onBlur={e => {
                  if (e.target.value !== (image.altText ?? '')) saveAlt(image.id, e.target.value);
                }}
                placeholder="Beskriv bilden"
                className="w-full rounded-none border-0 border-b bg-transparent px-0 py-1.5 text-[14px] outline-none focus:border-b-2 focus:pb-[5px]"
                style={{ color: 'var(--viz-ink)', borderColor: 'var(--viz-rule)' }}
              />
            </label>

            <span className="flex items-center gap-1">
              <Button
                type="button"
                variant="quiet"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label="Flytta upp"
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={busy || index === detail.images.length - 1}
                onClick={() => move(index, 1)}
                aria-label="Flytta ner"
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="quiet"
                disabled={busy}
                onClick={() => remove(image.id)}
                style={{ color: 'var(--viz-flag)' }}
              >
                Ta bort
              </Button>
            </span>
          </li>
        ))}
      </ul>

      <label className="flex flex-col gap-1.5">
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
          style={{ color: 'var(--viz-ink-3)' }}
        >
          Ladda upp
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={upload}
          disabled={busy}
          className="text-[13px]"
          style={{ color: 'var(--viz-ink-2)' }}
        />
      </label>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

function variantName(variant: VariantWithUsage): string {
  const options = variant.optionValues.map(option => option.value).filter(Boolean);
  return options.length ? options.join(' / ') : variant.sku;
}

function VariantRow({
  variant,
  landedCostSek,
}: {
  variant: VariantWithUsage;
  landedCostSek: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Priset är inklusive moms; landad kostnad är det inte. Jämför man dem rakt
  // av ser marginalen 25 % bättre ut än den är.
  const exVat = variant.priceMinor / 100 / 1.25;
  const belowCost = landedCostSek !== null && exVat < landedCostSek;

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = formValues(event.currentTarget);
    const priceMinor = toMinor(values.price);
    if (!Number.isFinite(priceMinor)) {
      setBusy(false);
      setError('Priset måste vara ett tal.');
      return;
    }
    const response = await fetch(`/api/admin/variants/${variant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: values.sku,
        priceMinor,
        inventoryQuantity: values.inventoryQuantity,
        minimumOrderQuantity: values.minimumOrderQuantity,
        orderIncrement: values.orderIncrement,
        inventoryTracked: values.inventoryTracked === 'on',
        availableForSale: values.availableForSale === 'on',
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
    if (!confirm(`Ta bort ${variant.sku}?`)) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/variants/${variant.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ta bort varianten.');
      return;
    }
    router.refresh();
  };

  return (
    <li className="border-b" style={{ borderColor: 'var(--viz-grid)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 py-3 text-left transition-colors hover:bg-[var(--viz-plane)]"
      >
        <span className="flex flex-col gap-0.5">
          <span
            className="text-[14px]"
            style={{ color: variant.active ? 'var(--viz-ink)' : 'var(--viz-ink-3)' }}
          >
            {variantName(variant)}
          </span>
          <span className="font-mono text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
            {variant.sku}
            {!variant.active && ' · inaktiv'}
            {!variant.availableForSale && ' · ej säljbar'}
          </span>
        </span>
        <span
          className="font-mono text-[12.5px] tabular-nums max-[560px]:hidden"
          style={{ color: belowCost ? 'var(--viz-flag)' : 'var(--viz-ink-3)' }}
        >
          {variant.inventoryQuantity} st
        </span>
        <span
          className="font-mono text-[13px] tabular-nums"
          style={{ color: belowCost ? 'var(--viz-flag)' : 'var(--viz-ink)' }}
        >
          {formatMinor(variant.priceMinor, variant.currency)}
        </span>
      </button>

      {belowCost && (
        <p className="pb-2 text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
          Priset exklusive moms ({exVat.toFixed(2)} kr) är lägre än landad kostnad (
          {landedCostSek!.toFixed(2)} kr).
        </p>
      )}

      {open && (
        <form onSubmit={save} className="flex flex-col gap-4 pb-5 pt-1">
          <div className="grid grid-cols-3 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
            <Field label="SKU" name="sku" required defaultValue={variant.sku} />
            <Field
              label={`Pris (${variant.currency.toUpperCase()}, inkl. moms)`}
              name="price"
              type="number"
              step="0.01"
              required
              defaultValue={(variant.priceMinor / 100).toFixed(2)}
            />
            <Field
              label="Lager"
              name="inventoryQuantity"
              type="number"
              defaultValue={String(variant.inventoryQuantity)}
            />
            <Field
              label="Minsta antal"
              name="minimumOrderQuantity"
              type="number"
              min="1"
              defaultValue={String(variant.minimumOrderQuantity)}
            />
            <Field
              label="Beställningssteg"
              name="orderIncrement"
              type="number"
              min="1"
              defaultValue={String(variant.orderIncrement)}
            />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label
              className="flex cursor-pointer items-center gap-2 text-[13px]"
              style={{ color: 'var(--viz-ink-2)' }}
            >
              <input
                type="checkbox"
                name="active"
                defaultChecked={variant.active}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              Aktiv
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-[13px]"
              style={{ color: 'var(--viz-ink-2)' }}
            >
              <input
                type="checkbox"
                name="availableForSale"
                defaultChecked={variant.availableForSale}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              Säljbar
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-[13px]"
              style={{ color: 'var(--viz-ink-2)' }}
            >
              <input
                type="checkbox"
                name="inventoryTracked"
                defaultChecked={variant.inventoryTracked}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              Lagerstyrd
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Sparar…' : 'Spara'}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            {/* En variant som sålts går inte att ta bort — ordern ska kunna
                läsas i efterhand. Knappen döljs hellre än att servern får säga
                nej efteråt. */}
            {variant.orderLineCount === 0 ? (
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
            ) : (
              <span className="ml-auto text-[12.5px]" style={{ color: 'var(--viz-ink-3)' }}>
                Finns på {variant.orderLineCount}{' '}
                {variant.orderLineCount === 1 ? 'order' : 'ordrar'} — inaktivera i stället.
              </span>
            )}
          </div>
          <ErrorNote>{error}</ErrorNote>
        </form>
      )}
    </li>
  );
}

function NewVariant({ productId }: { productId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" variant="quiet" onClick={() => setOpen(true)} className="self-start">
        + Ny variant
      </Button>
    );
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = formValues(event.currentTarget);
    const response = await fetch(`/api/admin/products/${productId}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: values.sku,
        priceMinor: toMinor(values.price),
        inventoryQuantity: values.inventoryQuantity || 0,
        minimumOrderQuantity: values.minimumOrderQuantity || 1,
        orderIncrement: values.orderIncrement || 1,
        inventoryTracked: values.inventoryTracked === 'on',
        availableForSale: values.availableForSale === 'on',
        optionValues: values.optionName
          ? [{ name: values.optionName, value: values.optionValue }]
          : [],
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte skapa varianten.');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4 pt-2">
      <div className="grid grid-cols-3 gap-x-6 gap-y-5 max-[560px]:grid-cols-1">
        <Field label="SKU" name="sku" required placeholder="TAC-SEB-150200-AND" />
        <Field label="Pris (SEK, inkl. moms)" name="price" type="number" step="0.01" required />
        <Field label="Lager" name="inventoryQuantity" type="number" defaultValue="0" />
        <Field label="Minsta antal" name="minimumOrderQuantity" type="number" min="1" defaultValue="1" />
        <Field label="Beställningssteg" name="orderIncrement" type="number" min="1" defaultValue="1" />
        <Field label="Alternativ" name="optionName" placeholder="Storlek" />
        <Field label="Värde" name="optionValue" placeholder="150x200" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: 'var(--viz-ink-2)' }}>
          <input type="checkbox" name="availableForSale" style={{ accentColor: 'var(--viz-s1)' }} />
          Säljbar
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: 'var(--viz-ink-2)' }}>
          <input type="checkbox" name="inventoryTracked" defaultChecked style={{ accentColor: 'var(--viz-s1)' }} />
          Lagerstyrd
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

function CollectionPanel({
  detail,
  collections,
}: {
  detail: ProductDetail;
  collections: CollectionListRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set(detail.collectionIds));
  const [primary, setPrimary] = useState<number | null>(detail.primaryCollectionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      // Den primära måste vara en av de valda, annars blir brödsmulan tom.
      if (primary !== null && !next.has(primary)) setPrimary(null);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${detail.product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionIds: [...selected],
        primaryCollectionId: primary,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte spara kategorierna.');
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col">
        {collections.map(collection => (
          <li
            key={collection.id}
            className="flex items-center gap-3 border-b py-2"
            style={{ borderColor: 'var(--viz-grid)' }}
          >
            <label
              className="flex flex-1 cursor-pointer items-center gap-2.5 text-[14px]"
              style={{ color: 'var(--viz-ink)' }}
            >
              <input
                type="checkbox"
                checked={selected.has(collection.id)}
                onChange={() => toggle(collection.id)}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              {collection.titleSv}
              <span className="font-mono text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
                {collection.handle}
              </span>
            </label>

            <label
              className="flex cursor-pointer items-center gap-2 text-[12.5px]"
              style={{ color: selected.has(collection.id) ? 'var(--viz-ink-2)' : 'var(--viz-ink-3)' }}
            >
              <input
                type="radio"
                name="primaryCollection"
                checked={primary === collection.id}
                disabled={!selected.has(collection.id)}
                onChange={() => setPrimary(collection.id)}
                style={{ accentColor: 'var(--viz-s1)' }}
              />
              Primär
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? 'Sparar…' : 'Spara kategorier'}
        </Button>
        {primary === null && selected.size > 0 && (
          <span className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
            Utan primär kategori blir brödsmulan på sajten tom.
          </span>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function ProductEditor({
  detail,
  collections,
  landedCostSek,
  landedConfidence,
}: {
  detail: ProductDetail;
  collections: CollectionListRow[];
  landedCostSek: number | null;
  landedConfidence: string | null;
}) {
  const { product } = detail;
  const stock = detail.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);

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
          {detail.variants.length} {detail.variants.length === 1 ? 'variant' : 'varianter'} ·{' '}
          {stock} i lager ·{' '}
          {product.stripeProductId ? `Stripe: ${product.stripeProductId}` : 'inte i Stripe'}
          {landedCostSek !== null &&
            ` · landad kostnad ${landedCostSek.toFixed(2)} kr${
              landedConfidence === 'likely' ? ' (osäker koppling)' : ''
            }`}
        </span>
        <h1
          className="max-w-[20ch] text-balance font-heading text-[clamp(26px,4vw,38px)] leading-[1.1] tracking-[-0.02em]"
          style={{ color: 'var(--viz-ink)' }}
        >
          {product.title}
        </h1>
      </header>

      <Panel
        title="Innehåll"
        note="Texterna som visas på produktsidan. Engelskan hämtas inte längre från Shopify — den bor här."
      >
        <ContentPanel detail={detail} />
      </Panel>

      <Panel title="Bilder" note="Ligger i Vercel Blob. Första bilden är den som visas i listor.">
        <ImagePanel detail={detail} />
      </Panel>

      <Panel
        title="Varianter"
        note="Priset här är det kassan tar betalt. SKU:n är produktens beständiga identitet och måste vara unik i hela katalogen."
      >
        <ul className="flex flex-col">
          {detail.variants.map(variant => (
            <VariantRow key={variant.id} variant={variant} landedCostSek={landedCostSek} />
          ))}
        </ul>
        <NewVariant productId={product.id} />
      </Panel>

      <Panel
        title="Kategorier"
        note="Den primära kategorin bestämmer brödsmulan på sajten. Hierarkin redigeras under Kategorier."
      >
        <CollectionPanel detail={detail} collections={collections} />
      </Panel>
    </>
  );
}
