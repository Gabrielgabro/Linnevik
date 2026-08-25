'use client';

/**
 * Produktkortet. Allt en produkt är, på en sida: texter, bilder, varianter och
 * kategorier. Varje panel sparar för sig — man ändrar ett pris utan att först
 * behöva ta ställning till beskrivningen.
 */

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Button,
  Combobox,
  ErrorNote,
  Field,
  Label,
  Select,
  TextArea,
  formValues,
} from '@/components/admin/Fields';
import PageHeader from '@/components/admin/ui/PageHeader';
import { Tag } from '@/components/admin/ui/StatusPill';
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
    <section className="flex flex-col gap-4 rounded-card border border-rule bg-surface px-5 py-5 shadow-card sm:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{title}</h2>
        {note && <p className="max-w-[62ch] text-[13px] leading-[1.6] text-ink-2">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** Texterna. Svenska och engelska sida vid sida — sajten är tvåspråkig. */
function ContentPanel({ detail, suppliers }: { detail: ProductDetail; suppliers: string[] }) {
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
        <Combobox
          label="Leverantör"
          name="supplier"
          options={suppliers}
          defaultValue={product.supplier}
          placeholder="unknown"
        />
        {/* Visas som rutan "Leveranstid" på produktsidan när den är ifylld. */}
        <Field
          label="Leveranstid"
          name="leadTime"
          defaultValue={product.leadTime}
          placeholder="4-6 veckor"
        />
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
        <Field label="SEO-titel (sv)" name="seoTitle" defaultValue={product.seoTitle} />
        <Field label="SEO-titel (en)" name="seoTitleEn" defaultValue={product.seoTitleEn} />
        <Field label="SEO-beskrivning (sv)" name="seoDescription" defaultValue={product.seoDescription} />
        <Field
          label="SEO-beskrivning (en)"
          name="seoDescriptionEn"
          defaultValue={product.seoDescriptionEn}
        />
      </div>

      <Select
        label="Publiceringsstatus"
        name="status"
        options={['active', 'draft', 'archived']}
        defaultValue={product.status}
        required
      />

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

type OptionPair = { name: string; value: string };

/**
 * Variantens namn. Namnet är paren (Storlek / 50x70) och inte en fri text,
 * eftersom produktsidans väljare byggs av dem: alternativets namn blir
 * rubriken och värdena blir knapparna under. Värdena sammanfogade är också
 * det kunden ser i korgen, och det varianten listas under här.
 *
 * En variant utan par har inget namn och faller tillbaka på SKU:n överallt.
 * SKU:n är ett lagernummer — den duger som nödutgång, inte som namn.
 */
function OptionFields({
  options,
  setOptions,
  disabled,
}: {
  options: OptionPair[];
  setOptions: (next: OptionPair[]) => void;
  disabled?: boolean;
}) {
  const patch = (index: number, part: Partial<OptionPair>) =>
    setOptions(options.map((option, i) => (i === index ? { ...option, ...part } : option)));

  return (
    <div className="flex flex-col gap-3">
      <Label>Variantnamn</Label>
      {options.map((option, index) => (
        <div key={index} className="flex items-end gap-3 max-[560px]:flex-wrap">
          <Field
            label="Alternativ"
            name={`optionName${index}`}
            placeholder="Storlek"
            value={option.name}
            onChange={event => patch(index, { name: event.target.value })}
            className="flex-1"
          />
          <Field
            label="Värde"
            name={`optionValue${index}`}
            placeholder="50x70"
            value={option.value}
            onChange={event => patch(index, { value: event.target.value })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="quiet"
            disabled={disabled}
            onClick={() => setOptions(options.filter((_, i) => i !== index))}
            className="mb-[26px]"
            style={{ color: 'var(--viz-flag)' }}
          >
            Ta bort
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="quiet"
        disabled={disabled}
        onClick={() => setOptions([...options, { name: '', value: '' }])}
        className="self-start"
      >
        + Lägg till alternativ
      </Button>
    </div>
  );
}

/**
 * Halvifyllda par är alltid ett misstag — servern avvisar dem, och tyst kasta
 * bort dem hade tagit bort namnet någon just skrivit in. Helt tomma rader är
 * däremot bara en rad man ångrade, och plockas bort.
 */
function cleanOptions(options: OptionPair[]): OptionPair[] | null {
  const filled = options
    .map(option => ({ name: option.name.trim(), value: option.value.trim() }))
    .filter(option => option.name || option.value);
  if (filled.some(option => !option.name || !option.value)) return null;
  return filled;
}

const OPTION_ERROR = 'Varje alternativ behöver både namn och värde, till exempel Storlek och 50x70.';

/** Vad varje rörelsetyp betyder, på svenska. Typerna skrivs av inventoryDb. */
const MOVEMENT_LABEL: Record<string, string> = {
  reserve: 'Reserverad',
  release: 'Släppt',
  fulfill: 'Plockad',
  return: 'Retur',
  restock: 'Åter i lager',
  adjust: 'Justerad',
};

type Movement = {
  id: number;
  type: string;
  quantity: number;
  orderId: number | null;
  note: string | null;
  actor: string;
  createdAt: string;
};

const movementStamp = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Stockholm',
});

/**
 * Lagerhistoriken för en variant. Tabellen har skrivits av varje reservation,
 * plock och retur sedan 0011, men ingen vy visade den — frågan "varför står det
 * 3 här när jag räknade 5 i hyllan" gick bara att svara på i psql.
 *
 * Hämtas när raden öppnas och inte med sidan: det är den längsta datamängden i
 * produktkortet, och intressant först när någon undrar över just den varianten.
 */
function StockHistory({ variantId }: { variantId: number }) {
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/variants/${variantId}/movements`)
      .then(response => (response.ok ? response.json() : Promise.reject(new Error('fel'))))
      .then(data => {
        if (!cancelled) setMovements(data.movements ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Kunde inte hämta lagerhistoriken.');
      });
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  if (error) return <p className="text-[12.5px] text-ink-3">{error}</p>;
  if (movements === null) return <p className="text-[12.5px] text-ink-3">Hämtar historik…</p>;
  if (movements.length === 0) {
    return <p className="text-[12.5px] text-ink-3">Inga lagerrörelser ännu.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {movements.map(movement => (
        <li
          key={movement.id}
          className="flex flex-wrap items-baseline gap-x-3 font-mono text-[11.5px] text-ink-3"
        >
          <span className="tabular-nums">{movementStamp.format(new Date(movement.createdAt))}</span>
          <span className="text-ink-2">{MOVEMENT_LABEL[movement.type] ?? movement.type}</span>
          {/* Justeringar bär tecken — de kan gå åt båda hållen. Övriga typer
              lagras som magnitud och beskrivs av sin typ. */}
          <span className="tabular-nums text-ink">
            {movement.type === 'adjust' && movement.quantity > 0 ? '+' : ''}
            {movement.quantity} st
          </span>
          <span>{movement.actor}</span>
          {movement.orderId !== null && <span>order {movement.orderId}</span>}
          {movement.note && <span className="text-ink-3">· {movement.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function VariantRow({
  variant,
  landedCostSek,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  variant: VariantWithUsage;
  landedCostSek: number | null;
  /** Flyttar varianten ett steg. Ordningen är den kunden ser i väljaren. */
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionPair[]>(
    variant.optionValues.length ? variant.optionValues : [{ name: '', value: '' }]
  );

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
    const optionValues = cleanOptions(options);
    if (!optionValues) {
      setBusy(false);
      setError(OPTION_ERROR);
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
        optionValues,
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
    <li className="flex items-start gap-1 border-b" style={{ borderColor: 'var(--viz-grid)' }}>
      {/* Pilar i stället för dra-och-släpp: fungerar med tangentbord, och
          listan är kort. Samma lösning som bilderna redan har. */}
      <span className="flex shrink-0 flex-col pt-4">
        <button
          type="button"
          aria-label={`Flytta ${variant.sku} uppåt`}
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
          className="px-1 text-[10px] leading-none text-ink-3 enabled:hover:text-ink disabled:opacity-25"
        >
          ▲
        </button>
        <button
          type="button"
          aria-label={`Flytta ${variant.sku} nedåt`}
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
          className="px-1 text-[10px] leading-none text-ink-3 enabled:hover:text-ink disabled:opacity-25"
        >
          ▼
        </button>
      </span>

      <div className="min-w-0 flex-1">
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

          <OptionFields options={options} setOptions={setOptions} disabled={busy} />

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
          <div
            className="flex flex-col gap-2 border-t pt-4"
            style={{ borderColor: 'var(--viz-grid)' }}
          >
            <span
              className="font-mono text-[10.5px] uppercase tracking-[0.12em]"
              style={{ color: 'var(--viz-ink-3)' }}
            >
              Lagerhistorik
              {variant.inventoryReserved > 0 && ` · ${variant.inventoryReserved} reserverade`}
            </span>
            <StockHistory variantId={variant.id} />
          </div>

          <ErrorNote>{error}</ErrorNote>
        </form>
      )}
      </div>
    </li>
  );
}

function NewVariant({ productId }: { productId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionPair[]>([{ name: '', value: '' }]);

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
    const optionValues = cleanOptions(options);
    if (!optionValues) {
      setBusy(false);
      setError(OPTION_ERROR);
      return;
    }
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
        optionValues,
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
      </div>
      <OptionFields options={options} setOptions={setOptions} disabled={busy} />
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

  // Brödsmulan på sajten går efter den primära kategorin, inte efter kryssen.
  // Att sätta den var förr ett eget klick på en radioknapp som satt låst tills
  // rutan var ikryssad — ett klick i fel ordning försvann tyst, och produkten
  // sparades kopplad men utan primär, alltså utan brödsmula. Den väljs därför
  // åt en nu: första ikryssade kategorin blir primär, och kryssar man ur den
  // som var primär flyttas märket till en av dem som är kvar.
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
    if (primary === null || !next.has(primary)) {
      // Faller tillbaka i listans ordning, inte i klickordning, så att samma
      // urval alltid ger samma primär.
      setPrimary(collections.find(collection => next.has(collection.id))?.id ?? null);
    }
  };

  const save = async () => {
    // Kan inte nås från gränssnittet så länge toggle håller ihop de två, men
    // en produkt utan primär är exakt det fel vi är här för att laga.
    if (selected.size > 0 && primary === null) {
      setError('Välj en primär kategori — det är den brödsmulan på sajten går efter.');
      return;
    }
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
        {selected.size === 0 && (
          <span className="text-[12.5px]" style={{ color: 'var(--viz-flag)' }}>
            Utan kategori blir brödsmulan på sajten tom.
          </span>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Varianterna i den ordning kunden möter dem. Ordningen sparas på servern och
 * inte bara här: samma `position` styr knapparna i produktsidans variantväljare,
 * som förr byggdes i id-ordning — alltså i den ordning varianterna råkade skapas.
 */
function VariantList({
  detail,
  landedCostSek,
}: {
  detail: ProductDetail;
  landedCostSek: number | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const move = async (index: number, direction: -1 | 1) => {
    const order = detail.variants.map(variant => variant.id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];

    setError(null);
    const response = await fetch(`/api/admin/products/${detail.product.id}/variants`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    if (!response.ok) {
      setError('Kunde inte spara ordningen.');
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {detail.variants.map((variant, index) => (
          <VariantRow
            key={variant.id}
            variant={variant}
            landedCostSek={landedCostSek}
            onMove={direction => move(index, direction)}
            canMoveUp={index > 0}
            canMoveDown={index < detail.variants.length - 1}
          />
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Vad som fattas innan produkten kan gå live.
 *
 * Ingen av punkterna blockerar — status går att sätta till `active` ändå, och
 * ska göra det: ibland vill man publicera först och fylla på sen. Men en
 * produkt utan bild, utan säljbar variant eller utan primär kategori ser
 * färdig ut i listan och är det inte, och det var förr något man upptäckte på
 * sajten. Nya varianter har dessutom `available_for_sale` avstängt som förval,
 * så "har varianter" räcker inte som mått.
 */
function PublishChecklist({ detail }: { detail: ProductDetail }) {
  const checks = [
    { done: detail.images.length > 0, label: 'Minst en bild' },
    {
      done: detail.variants.some(variant => variant.active && variant.availableForSale),
      label: 'Minst en säljbar variant',
    },
    { done: detail.primaryCollectionId !== null, label: 'Primär kategori (brödsmulan)' },
    { done: Boolean(detail.product.titleEn), label: 'Engelsk titel' },
    { done: Boolean(detail.product.stripeProductId), label: 'Kopplad till Stripe' },
  ];
  const missing = checks.filter(check => !check.done);

  if (missing.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--adm-ok)' }}>
        Allt på plats för publicering.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Saknas för publicering</Label>
      <ul className="flex flex-col gap-1">
        {missing.map(check => (
          <li key={check.label} className="text-[13px]" style={{ color: 'var(--viz-ink-2)' }}>
            · {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kopplar produkten till Stripe utan att någon behöver köra skriptet. */
function StripeLink({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = detail.product.stripeProductId;

  const link = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${detail.product.id}/stripe`, {
      method: 'POST',
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte koppla produkten till Stripe.');
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={linked ? 'quiet' : 'secondary'}
          disabled={busy}
          onClick={link}
        >
          {busy ? 'Kopplar…' : linked ? 'Uppdatera i Stripe' : 'Koppla till Stripe'}
        </Button>
        <span className="font-mono text-[11.5px]" style={{ color: 'var(--viz-ink-3)' }}>
          {linked ?? 'Ingen Stripe-produkt'}
        </span>
      </div>
      {/* Inga priser skapas i Stripe — beloppen räknas per kund hos oss och
          skickas som price_data i kassan. Se stripeCatalog.ts. */}
      <p className="max-w-[62ch] text-[12.5px]" style={{ color: 'var(--viz-ink-3)' }}>
        Kopplingen gör att försäljningen syns per produkt i Stripes rapporter. Priserna påverkas
        inte — de räknas här och skickas med i kassan.
      </p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Att ta bort en produkt.
 *
 * Två olika saker, och skillnaden är hela poängen. Arkivera tar bort den från
 * sajten — `catalogDb` läser bara `status = 'active'`, så produktsidan,
 * kategorierna, sökningen och sitemapen släpper den — men allt är kvar och går
 * att ångra. Radera tar bort raden, och det får bara ske för en produkt som
 * aldrig sålts: orderraden pekar på varianten, och en order ska gå att läsa i
 * efterhand även om katalogen har ändrats sedan dess.
 *
 * Vilken av dem som är möjlig avgörs av servern, men vi vet redan här om
 * någon variant förekommer på en order — och en knapp som säkert kommer att
 * nekas är bättre att inte visa.
 */
function DangerPanel({ detail }: { detail: ProductDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { product } = detail;
  const sold = detail.variants.reduce((sum, variant) => sum + variant.orderLineCount, 0);
  const archived = product.status === 'archived';

  const setStatus = async (status: 'archived' | 'draft', confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte ändra status.');
      return;
    }
    router.refresh();
  };

  const remove = async () => {
    // Titeln skrivs av för hand. Ett confirm() klickas bort på reflex, och det
    // här går inte att ångra: varianter och bilder följer med.
    const typed = prompt(
      `Radera ${product.title} permanent, med ${detail.variants.length} ` +
        `${detail.variants.length === 1 ? 'variant' : 'varianter'} och ${detail.images.length} ` +
        `${detail.images.length === 1 ? 'bild' : 'bilder'}? Skriv produktens titel för att bekräfta.`
    );
    if (typed === null) return;
    if (typed.trim() !== product.title) {
      setError('Titeln stämde inte — inget raderades.');
      return;
    }

    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${product.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy(false);
      setError(data.error ?? 'Kunde inte radera produkten.');
      return;
    }
    router.replace('/admin/products');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {archived ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setStatus('draft')}>
            Återställ som utkast
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              setStatus(
                'archived',
                `Arkivera ${product.title}? Produkten försvinner från sajten men allt sparas.`
              )
            }
          >
            Arkivera
          </Button>
        )}
        {sold === 0 ? (
          <Button type="button" variant="danger" disabled={busy} onClick={remove}>
            Radera permanent
          </Button>
        ) : (
          <span className="text-[12.5px] text-ink-3">
            Har sålts ({sold} {sold === 1 ? 'orderrad' : 'orderrader'}) och kan inte raderas —
            arkivera i stället.
          </span>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

/**
 * Kopierar produkten och går till kopian. Den skapas som utkast, utan bilder
 * och utan lager — se duplicateProduct för varför.
 */
function DuplicateButton({ productId }: { productId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duplicate = async () => {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/products/${productId}/duplicate`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? 'Kunde inte kopiera produkten.');
      return;
    }
    router.push(`/admin/products/${data.product.handle}`);
  };

  return (
    <span className="flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={duplicate}>
        {busy ? 'Kopierar…' : 'Duplicera'}
      </Button>
      {error && <span className="text-[12.5px] text-danger">{error}</span>}
    </span>
  );
}

export default function ProductEditor({
  detail,
  collections,
  suppliers,
  landedCostSek,
  landedConfidence,
}: {
  detail: ProductDetail;
  collections: CollectionListRow[];
  suppliers: string[];
  landedCostSek: number | null;
  landedConfidence: string | null;
}) {
  const { product } = detail;
  const stock = detail.variants.reduce((sum, v) => sum + v.inventoryQuantity, 0);

  return (
    <>
      <PageHeader
        kicker={
          <>
            {detail.variants.length} {detail.variants.length === 1 ? 'variant' : 'varianter'} ·{' '}
            {stock} i lager
            {landedCostSek !== null &&
              ` · landad kostnad ${landedCostSek.toFixed(2)} kr${
                landedConfidence === 'likely' ? ' (osäker koppling)' : ''
              }`}
          </>
        }
        title={product.title}
        accent="var(--adm-brand)"
        actions={
          <>
            {/* Att se ändringen som kunden ser den krävde förr att man skrev av
                adressen för hand. */}
            <a
              href={`/sv/products/${product.handle}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-ctl border border-rule px-3 py-2 text-[13.5px] text-ink-2 hover:bg-plane hover:text-ink"
            >
              Visa på sajten
            </a>
            <DuplicateButton productId={product.id} />
          </>
        }
        description={
          product.stripeProductId ? (
            <Tag color="var(--adm-ok)">Stripe: {product.stripeProductId}</Tag>
          ) : (
            <Tag color="var(--adm-danger)">Inte i Stripe</Tag>
          )
        }
      />

      <Panel
        title="Innehåll"
        note="Texterna som visas på produktsidan. Engelskan hämtas inte längre från Shopify — den bor här."
      >
        <ContentPanel detail={detail} suppliers={suppliers} />
      </Panel>

      <Panel title="Bilder" note="Ligger i Vercel Blob. Första bilden är den som visas i listor.">
        <ImagePanel detail={detail} />
      </Panel>

      <Panel
        title="Varianter"
        note="Priset här är det kassan tar betalt. SKU:n är produktens beständiga identitet och måste vara unik i hela katalogen."
      >
        <VariantList detail={detail} landedCostSek={landedCostSek} />
        <NewVariant productId={product.id} />
      </Panel>

      <Panel
        title="Kategorier"
        note="Den primära kategorin bestämmer brödsmulan på sajten. Hierarkin redigeras under Kategorier."
      >
        <CollectionPanel detail={detail} collections={collections} />
      </Panel>

      <Panel
        title="Publicering"
        note="Vad som återstår innan produkten är komplett på sajten, och kopplingen till Stripe."
      >
        <div className="flex flex-col gap-5">
          <PublishChecklist detail={detail} />
          <StripeLink detail={detail} />
        </div>
      </Panel>

      <Panel
        title="Ta bort"
        note="Arkivera tar bort produkten från sajten men behåller allt — det är det normala sättet att sluta sälja något. Radera går bara på en produkt som aldrig sålts, eftersom ordrar ska gå att läsa i efterhand."
      >
        <DangerPanel detail={detail} />
      </Panel>
    </>
  );
}
