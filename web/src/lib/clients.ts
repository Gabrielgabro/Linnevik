/**
 * Säljregistret: kunder och deras kontaktpersoner.
 *
 * Uppdelningen speglar verkligheten — ett hotell har en inköpare, en
 * husfru och kanske en vd, och de svarar olika. Statusen sitter därför på
 * personen, inte på företaget. Kundens egen status är var *affären* står.
 *
 * Värdelistorna nedan är samma som i sales/kunder_tvätteriet.xlsx. Håll dem
 * i takt om den filen ändras; det är den som används innan en kund är inlagd.
 */

import type { ClientRow } from '@/lib/db/schema';

export const CONTACT_STATUSES = [
  'Ej kontaktad',
  'Kontaktad',
  'Svarat',
  'Möte bokat',
  'Offert skickad',
  'Vunnen',
  'Ej intresserad',
  'Fel person',
  'Ingen kontakt möjlig',
] as const;

export const CLIENT_STATUSES = [
  'Prospekt',
  'Pågående dialog',
  'Aktiv kund',
  'Tidigare kund',
  'Vilande',
  'Ej aktuell',
] as const;

export const CHANNELS = ['Telefon', 'Mejl', 'LinkedIn', 'Besök', 'Mässa', 'Referens'] as const;
export const PRIORITIES = ['Hög', 'Medel', 'Låg'] as const;
export const SEGMENTS = [
  'Hotell',
  'Restaurang',
  'Event/Arena',
  'Kultur',
  'Offentlig',
  'Övrigt',
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** En person räknas som bearbetad så fort någon har hört av sig. */
const UNWORKED: readonly string[] = ['Ej kontaktad'];

export function isWorked(status: string): boolean {
  return !UNWORKED.includes(status);
}

/** Statusar som förtjänar en färg i listan. Övriga får normal text. */
export function statusTone(status: string): 'good' | 'flag' | 'muted' | 'none' {
  if (status === 'Vunnen' || status === 'Aktiv kund') return 'good';
  if (status === 'Ej intresserad' || status === 'Ej aktuell') return 'flag';
  if (status === 'Ej kontaktad' || status === 'Ingen kontakt möjlig') return 'muted';
  return 'none';
}

export type ClientWithCounts = ClientRow & {
  contactCount: number;
  workedCount: number;
  lastContactedAt: string | null;
};

export function contactName(contact: { firstName: string; lastName: string | null }): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}
