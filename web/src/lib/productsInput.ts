/**
 * Inläsning och kontroll av det som skickas in från katalogformulären.
 *
 * Samma hållning som clientsInput.ts: tomma strängar blir null, och allt som
 * går vidare in i databasen kontrolleras här och inte bara i formuläret.
 * Skälet är skarpare här än för kundregistret — `price_minor` är beloppet som
 * pricing.ts skickar till Stripe, så ett fel tal här blir ett fel pris i kassan.
 */

import { InputError } from '@/lib/clientsInput';
import type { CollectionInput, ProductInput, VariantInput } from '@/lib/productsDb';

export { InputError };

type Body = Record<string, unknown>;

function text(body: Body, key: string, max = 200): string | null {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InputError(`${key} måste vara text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new InputError(`${key} får vara högst ${max} tecken.`);
  return trimmed;
}

function bool(body: Body, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InputError(`${key} måste vara ja eller nej.`);
}

/** Heltal ≥ 0. Öre får inte vara flyttal och inte negativa — CHECK:en i
 *  databasen säger samma sak, men felet därifrån går inte att visa för någon. */
function count(body: Body, key: string, max = 100_000_000): number | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isInteger(num) || num < 0) {
    throw new InputError(`${key} måste vara ett heltal som inte är negativt.`);
  }
  if (num > max) throw new InputError(`${key} är orimligt stort.`);
  return num;
}

function intOrNull(body: Body, key: string): number | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) throw new InputError(`${key} är inget giltigt id.`);
  return num;
}

/** Taggar tas emot som lista eller kommaseparerad sträng. Dubbletter faller bort. */
function tags(body: Body, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const cleaned = list
    .map(item => String(item).trim())
    .filter(Boolean)
    .slice(0, 50);
  if (cleaned.some(item => item.length > 60)) throw new InputError('En tagg är för lång.');
  return [...new Set(cleaned)];
}

export function parseProductInput(body: Body, { partial = false } = {}): ProductInput {
  const title = text(body, 'title', 200);
  if (!partial && !title) throw new InputError('Produkten behöver en titel.');

  const input: ProductInput = {
    titleEn: text(body, 'titleEn', 200),
    handle: text(body, 'handle', 80) ?? undefined,
    // Beskrivningen är HTML från Shopify och får vara lång. Den renderas med
    // dangerouslySetInnerHTML på produktsidan, så den kommer bara härifrån —
    // fältet ligger bakom adminspärren och skrivs av oss, inte av kunder.
    descriptionHtml: text(body, 'descriptionHtml', 20_000),
    descriptionHtmlEn: text(body, 'descriptionHtmlEn', 20_000),
    productType: text(body, 'productType', 120),
    vendor: text(body, 'vendor', 120),
    seoTitle: text(body, 'seoTitle', 200),
    seoDescription: text(body, 'seoDescription', 400),
  };
  if (title) input.title = title;

  // Leverantören är NOT NULL i databasen. Ett tomrensat fält betyder därför
  // "vi vet inte" och blir 'unknown', inte null.
  if (body.supplier !== undefined) input.supplier = text(body, 'supplier', 120) ?? 'unknown';

  const tagList = tags(body, 'tags');
  if (tagList !== undefined) input.tags = tagList;
  const active = bool(body, 'active');
  if (active !== undefined) input.active = active;
  if (body.status !== undefined) {
    const status = text(body, 'status', 20);
    if (!status || !['active', 'draft', 'archived'].includes(status)) {
      throw new InputError('Produktstatus måste vara active, draft eller archived.');
    }
    input.status = status;
  }

  return input;
}

export function parseVariantInput(body: Body, { partial = false } = {}): VariantInput {
  const sku = text(body, 'sku', 60);
  if (!partial && !sku) throw new InputError('Varianten behöver en SKU.');

  const priceMinor = count(body, 'priceMinor');
  if (!partial && priceMinor === undefined) throw new InputError('Varianten behöver ett pris.');

  const currency = text(body, 'currency', 3);
  if (currency !== null && !/^[a-z]{3}$/.test(currency.toLowerCase())) {
    throw new InputError('Valutan måste vara tre bokstäver, till exempel sek.');
  }

  const input: VariantInput = {};
  if (sku) input.sku = sku.toUpperCase();
  if (priceMinor !== undefined) input.priceMinor = priceMinor;
  if (currency) input.currency = currency.toLowerCase();

  const inventoryQuantity = count(body, 'inventoryQuantity', 1_000_000);
  if (inventoryQuantity !== undefined) input.inventoryQuantity = inventoryQuantity;

  const minimumOrderQuantity = count(body, 'minimumOrderQuantity', 10_000);
  if (minimumOrderQuantity !== undefined) {
    if (minimumOrderQuantity < 1) throw new InputError('Minsta beställningsantal måste vara minst 1.');
    input.minimumOrderQuantity = minimumOrderQuantity;
  }

  const orderIncrement = count(body, 'orderIncrement', 10_000);
  if (orderIncrement !== undefined) {
    if (orderIncrement < 1) throw new InputError('Beställningssteget måste vara minst 1.');
    input.orderIncrement = orderIncrement;
  }

  const availableForSale = bool(body, 'availableForSale');
  if (availableForSale !== undefined) input.availableForSale = availableForSale;
  const inventoryTracked = bool(body, 'inventoryTracked');
  if (inventoryTracked !== undefined) input.inventoryTracked = inventoryTracked;
  const active = bool(body, 'active');
  if (active !== undefined) input.active = active;

  const options = body.optionValues;
  if (options !== undefined) {
    if (!Array.isArray(options)) throw new InputError('Varianternas alternativ måste vara en lista.');
    input.optionValues = options.slice(0, 10).map(item => {
      const pair = item as { name?: unknown; value?: unknown };
      const name = String(pair?.name ?? '').trim();
      const value = String(pair?.value ?? '').trim();
      if (!name || !value) throw new InputError('Ett alternativ saknar namn eller värde.');
      return { name: name.slice(0, 60), value: value.slice(0, 60) };
    });
  }

  return input;
}

export function parseCollectionInput(body: Body, { partial = false } = {}): CollectionInput {
  const titleSv = text(body, 'titleSv', 120);
  const titleEn = text(body, 'titleEn', 120);
  if (!partial && (!titleSv || !titleEn)) {
    throw new InputError('Kategorin behöver en titel på både svenska och engelska.');
  }

  const input: CollectionInput = {};
  if (titleSv) input.titleSv = titleSv;
  if (titleEn) input.titleEn = titleEn;

  for (const key of [
    'descriptionHtml',
    'descriptionHtmlEn',
    'seoTitle',
    'seoTitleEn',
    'seoDescription',
    'seoDescriptionEn',
  ] as const) {
    if (body[key] !== undefined) input[key] = text(body, key, 20_000) ?? null;
  }

  const handle = text(body, 'handle', 80);
  if (handle) input.handle = handle;

  const parentId = intOrNull(body, 'parentId');
  if (parentId !== undefined) input.parentId = parentId;

  const position = count(body, 'position', 10_000);
  if (position !== undefined) input.position = position;

  const active = bool(body, 'active');
  if (active !== undefined) input.active = active;

  return input;
}

/** Lista av id:n, för kategorikopplingar och bildordning. */
export function parseIdList(body: Body, key: string): number[] {
  const value = body[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InputError(`${key} måste vara en lista.`);
  return value.map(item => {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) throw new InputError(`${key} innehåller ett ogiltigt id.`);
    return id;
  });
}
