import type { CustomerInput, DiscountInput, ShippingInput } from '@/lib/commerceOperations';
import { isCalendarDate } from '@/lib/isoDate';

type Body = Record<string, unknown>;

export class CommerceInputError extends Error {}

function text(body: Body, key: string, max = 500): string | null | undefined {
  if (body[key] === undefined) return undefined;
  if (body[key] === null || body[key] === '') return null;
  if (typeof body[key] !== 'string') throw new CommerceInputError(`${key} must be text.`);
  const value = body[key].trim();
  if (!value) return null;
  if (value.length > max) throw new CommerceInputError(`${key} is too long.`);
  return value;
}

function integer(body: Body, key: string, nullable = false): number | null | undefined {
  if (body[key] === undefined) return undefined;
  if (nullable && (body[key] === null || body[key] === '')) return null;
  const value = Number(body[key]);
  if (!Number.isInteger(value) || value < 0) throw new CommerceInputError(`${key} must be a non-negative integer.`);
  return value;
}

function bool(body: Body, key: string): boolean | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== 'boolean') throw new CommerceInputError(`${key} must be boolean.`);
  return body[key];
}

function date(body: Body, key: string): Date | null | undefined {
  const value = text(body, key, 100);
  if (value === undefined || value === null) return value;
  // `new Date('2026-02-31')` kastar inte — den rullar vidare till 3 mars, och
  // ett omöjligt datum sparades tyst som ett annat än det som skickades in.
  // Rena ÅÅÅÅ-MM-DD kontrolleras därför mot kalendern först.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !isCalendarDate(value)) {
    throw new CommerceInputError(`${key} must be a date.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new CommerceInputError(`${key} must be a date.`);
  return parsed;
}

function stringList(body: Body, key: string): string[] | undefined {
  if (body[key] === undefined) return undefined;
  const raw = Array.isArray(body[key]) ? body[key] : String(body[key]).split(',');
  return raw.map(String).map(value => value.trim().toUpperCase()).filter(Boolean);
}

export function parseCustomerInput(body: Body, required = false): CustomerInput {
  const email = text(body, 'email', 320);
  if (required && !email) throw new CommerceInputError('email is required.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new CommerceInputError('email is invalid.');
  const input: CustomerInput = {};
  if (email !== undefined && email !== null) input.email = email;
  for (const key of ['customerNo', 'firstName', 'lastName', 'company', 'phone', 'taxId', 'notes'] as const) {
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
    throw new CommerceInputError('code, title and kind are required.');
  }
  if (kind && !['percentage', 'fixed_amount', 'free_shipping'].includes(kind)) {
    throw new CommerceInputError('kind is invalid.');
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
  return input;
}

export function parseShippingInput(body: Body, required = false): ShippingInput {
  const name = text(body, 'name', 200);
  if (required && !name) throw new CommerceInputError('name is required.');
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
