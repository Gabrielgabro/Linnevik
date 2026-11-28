import type { CustomerInput, DiscountInput, ShippingInput } from '@/lib/commerceOperations';
import { isCalendarDate } from '@/lib/isoDate';

type Body = Record<string, unknown>;

export class CommerceInputError extends Error {}

/** Fältens namn i admin. Felen visas för admin och ska vara på svenska (§15.4). */
const LABELS: Record<string, string> = {
  email: 'E-post', customerNo: 'Kundnummer', firstName: 'Förnamn', lastName: 'Efternamn',
  company: 'Företag', phone: 'Telefon', taxId: 'Org.nr', notes: 'Anteckningar', status: 'Status',
  acceptsMarketing: 'Utskick', code: 'Kod', title: 'Namn', kind: 'Typ', value: 'Värde',
  minimumSubtotalMinor: 'Minsta order', maximumSubtotalMinor: 'Största order', usageLimit: 'Antal användningar',
  usageLimitPerCustomer: 'Användningar per kund', currency: 'Valuta', startsAt: 'Startdatum', endsAt: 'Slutdatum',
  active: 'Aktiv', name: 'Namn', countryCodes: 'Länder', postalCodePrefixes: 'Postnummer',
  priceMinor: 'Pris', freeAboveMinor: 'Fri över', estimatedMinDays: 'Minsta leveranstid',
  estimatedMaxDays: 'Längsta leveranstid', priority: 'Prioritet',
};
const label = (key: string) => LABELS[key] ?? key;

function text(body: Body, key: string, max = 500): string | null | undefined {
  if (body[key] === undefined) return undefined;
  if (body[key] === null || body[key] === '') return null;
  if (typeof body[key] !== 'string') throw new CommerceInputError(`${label(key)} ska vara text.`);
  const value = body[key].trim();
  if (!value) return null;
  if (value.length > max) throw new CommerceInputError(`${label(key)} är för långt.`);
  return value;
}

function integer(body: Body, key: string, nullable = false): number | null | undefined {
  if (body[key] === undefined) return undefined;
  if (nullable && (body[key] === null || body[key] === '')) return null;
  const value = Number(body[key]);
  if (!Number.isInteger(value) || value < 0) throw new CommerceInputError(`${label(key)} ska vara ett heltal, 0 eller större.`);
  return value;
}

function bool(body: Body, key: string): boolean | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== 'boolean') throw new CommerceInputError(`${label(key)} ska vara ja eller nej.`);
  return body[key];
}

function date(body: Body, key: string): Date | null | undefined {
  const value = text(body, key, 100);
  if (value === undefined || value === null) return value;
  // `new Date('2026-02-31')` kastar inte — den rullar vidare till 3 mars, och
  // ett omöjligt datum sparades tyst som ett annat än det som skickades in.
  // Rena ÅÅÅÅ-MM-DD kontrolleras därför mot kalendern först.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isCalendarDate(value)) {
    throw new CommerceInputError(`${label(key)} är inget giltigt datum.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new CommerceInputError(`${label(key)} är inget giltigt datum.`);
  return parsed;
}

function stringList(body: Body, key: string): string[] | undefined {
  if (body[key] === undefined) return undefined;
  const raw = Array.isArray(body[key]) ? body[key] : String(body[key]).split(',');
  return raw.map(String).map(value => value.trim().toUpperCase()).filter(Boolean);
}

export function parseCustomerInput(body: Body, required = false): CustomerInput {
  const email = text(body, 'email', 320);
  if (required && !email) throw new CommerceInputError('E-post saknas.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new CommerceInputError('E-postadressen ser fel ut.');
  const input: CustomerInput = {};
  if (email !== undefined && email !== null) input.email = email;
  // Org-numret hör till företaget, inte till webbkontot (§11.1, §11.6).
  for (const key of ['customerNo', 'firstName', 'lastName', 'company', 'phone', 'notes'] as const) {
    const value = text(body, key, key === 'notes' ? 10_000 : 320);
    if (value !== undefined) Object.assign(input, { [key]: value });
  }
  const acceptsMarketing = bool(body, 'acceptsMarketing');
  if (acceptsMarketing !== undefined) input.acceptsMarketing = acceptsMarketing;
  const status = text(body, 'status', 30);
  if (status !== undefined) input.status = status ?? 'active';
  return input;
}

export function parseDiscountInput(body: Body, required = false): DiscountInput {
  const code = text(body, 'code', 80);
  const title = text(body, 'title', 200);
  const kind = text(body, 'kind', 30);
  if (required && (!code || !title || !kind)) {
    throw new CommerceInputError('Kod, namn och typ måste fyllas i.');
  }
  if (kind && !['percentage', 'fixed_amount', 'free_shipping'].includes(kind)) {
    throw new CommerceInputError('Okänd typ av rabatt.');
  }
  const input: DiscountInput = {};
  if (code) input.code = code;
  if (title) input.title = title;
  if (kind) input.kind = kind;
  for (const key of ['value', 'minimumSubtotalMinor', 'usageLimit', 'usageLimitPerCustomer'] as const) {
    const value = integer(body, key, key.startsWith('usage'));
    if (value !== undefined) Object.assign(input, { [key]: value });
  }
  const currency = text(body, 'currency', 3);
  if (currency) input.currency = currency.toLowerCase();
  const startsAt = date(body, 'startsAt');
  const endsAt = date(body, 'endsAt');
  if (startsAt !== undefined) input.startsAt = startsAt;
  if (endsAt !== undefined) input.endsAt = endsAt;
  const active = bool(body, 'active');
  if (active !== undefined) input.active = active;
  if ((input.kind ?? kind) === 'percentage' && input.value !== undefined && input.value > 100) {
    throw new CommerceInputError('En procentrabatt kan vara högst 100 %.');
  }
  return input;
}

export function parseShippingInput(body: Body, required = false): ShippingInput {
  const name = text(body, 'name', 200);
  if (required && !name) throw new CommerceInputError('Namn saknas.');
  const input: ShippingInput = {};
  if (name) input.name = name;
  const countryCodes = stringList(body, 'countryCodes');
  const postalCodePrefixes = stringList(body, 'postalCodePrefixes');
  if (countryCodes) input.countryCodes = countryCodes;
  if (postalCodePrefixes) input.postalCodePrefixes = postalCodePrefixes;
  for (const key of [
    'minimumSubtotalMinor', 'maximumSubtotalMinor', 'priceMinor', 'freeAboveMinor',
    'estimatedMinDays', 'estimatedMaxDays', 'priority',
  ] as const) {
    const value = integer(body, key, ['maximumSubtotalMinor', 'freeAboveMinor', 'estimatedMinDays', 'estimatedMaxDays'].includes(key));
    if (value !== undefined) Object.assign(input, { [key]: value });
  }
  const currency = text(body, 'currency', 3);
  if (currency) input.currency = currency.toLowerCase();
  const active = bool(body, 'active');
  if (active !== undefined) input.active = active;
  return input;
}
