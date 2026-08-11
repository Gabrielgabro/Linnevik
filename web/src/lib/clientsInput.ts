/**
 * Inläsning och kontroll av det som skickas in från kundformulären.
 *
 * Formulären är visserligen bakom adminspärren, men fälten går rakt in i
 * registret vi säljer utifrån — så tomma strängar normaliseras till null och
 * statusvärden måste finnas i listorna, annars faller filtreringen isär
 * längre fram.
 *
 * `diff` finns för aktivitetsloggen: den ska visa *vad* som ändrades, inte
 * bara att någon rörde raden.
 */

import { CHANNELS, CLIENT_STATUSES, CONTACT_STATUSES, PRIORITIES, SEGMENTS } from '@/lib/clients';

export class InputError extends Error {}

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

function oneOf(body: Body, key: string, allowed: readonly string[]): string | null {
  const value = text(body, key);
  if (value === null) return null;
  if (!allowed.includes(value)) throw new InputError(`Ogiltigt värde för ${key}: ${value}`);
  return value;
}

/** Datum lagras som YYYY-MM-DD. Vi tar emot precis det formatet, inget annat. */
function isoDate(body: Body, key: string): string | null {
  const value = text(body, key, 10);
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InputError(`${key} måste vara ÅÅÅÅ-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new InputError(`${key} är inget giltigt datum.`);
  return value;
}

function decimal(body: Body, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) throw new InputError(`${key} måste vara ett positivt tal.`);
  return num.toFixed(2);
}

function email(body: Body, key: string): string | null {
  const value = text(body, key);
  if (value === null) return null;
  // Avsiktligt grov kontroll: fånga uppenbara slintningar utan att avvisa
  // adresser som faktiskt fungerar.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new InputError('Mejladressen ser fel ut.');
  return value.toLowerCase();
}

function url(body: Body, key: string): string | null {
  const value = text(body, key, 300);
  if (value === null) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    throw new InputError('LinkedIn-länken ser fel ut.');
  }
}

export type ClientInput = {
  customerNo: string;
  name: string;
  segment: string | null;
  status: string;
  priority: string | null;
  reminderFee: string | null;
  notes: string | null;
};

export function parseClientInput(body: Body): ClientInput {
  const customerNo = text(body, 'customerNo', 20);
  const name = text(body, 'name');
  if (!customerNo) throw new InputError('Kundnummer saknas.');
  if (!name) throw new InputError('Kundnamn saknas.');
  return {
    customerNo,
    name,
    segment: oneOf(body, 'segment', SEGMENTS),
    status: oneOf(body, 'status', CLIENT_STATUSES) ?? 'Prospekt',
    priority: oneOf(body, 'priority', PRIORITIES),
    reminderFee: decimal(body, 'reminderFee'),
    notes: text(body, 'notes', 2000),
  };
}

export type ContactInput = {
  firstName: string;
  lastName: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  status: string;
  channel: string | null;
  lastContactedAt: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  notes: string | null;
};

export function parseContactInput(body: Body): ContactInput {
  const firstName = text(body, 'firstName', 80);
  if (!firstName) throw new InputError('Kontaktpersonens namn saknas.');
  return {
    firstName,
    lastName: text(body, 'lastName', 80),
    role: text(body, 'role', 120),
    email: email(body, 'email'),
    phone: text(body, 'phone', 40),
    linkedin: url(body, 'linkedin'),
    status: oneOf(body, 'status', CONTACT_STATUSES) ?? 'Ej kontaktad',
    channel: oneOf(body, 'channel', CHANNELS),
    lastContactedAt: isoDate(body, 'lastContactedAt'),
    nextAction: text(body, 'nextAction', 300),
    nextActionDue: isoDate(body, 'nextActionDue'),
    notes: text(body, 'notes', 2000),
  };
}

/**
 * Fälten som faktiskt skiljer sig, som `fält: före → efter`.
 * Långa värden kortas — loggraden ska gå att läsa, inte återskapa texten.
 */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const short = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—';
    const s = String(v);
    return s.length > 40 ? `${s.slice(0, 39)}…` : s;
  };
  return Object.keys(after)
    .filter(key => {
      const a = before[key] ?? null;
      const b = after[key] ?? null;
      return String(a) !== String(b);
    })
    .map(key => `${key}: ${short(before[key])} → ${short(after[key])}`);
}
