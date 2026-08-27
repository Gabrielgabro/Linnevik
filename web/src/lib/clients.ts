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
import {
  addressIsComplete,
  formatAddressLines,
  isInvoiceCountry,
  normalizeAddress,
  type PostalAddress,
} from '@/lib/companyProfile';
import { isValidCompanyRegistrationNumber } from '@/lib/companyRegistration';

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
  'Tvätterikund',
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

export type StatusTone = 'good' | 'linen' | 'warm' | 'info' | 'flag' | 'muted';

/**
 * Färgen på en status. Tanken är att man ska kunna skumma listan: grönt är
 * i hamn, orange är igång och kräver något av oss, blått är påbörjat,
 * rött är avfärdat och grått är orört.
 */
export function statusTone(status: string): StatusTone {
  if (status === 'Vunnen' || status === 'Aktiv kund') return 'good';
  // Tvätterikund känner redan tvätteriet — därför grön, men en egen grön, så
  // att den inte förväxlas med en affär vi själva vunnit.
  if (status === 'Tvätterikund') return 'linen';
  if (
    status === 'Svarat' ||
    status === 'Möte bokat' ||
    status === 'Offert skickad' ||
    status === 'Pågående dialog'
  ) {
    return 'warm';
  }
  if (status === 'Ej intresserad' || status === 'Ej aktuell' || status === 'Fel person') {
    return 'flag';
  }
  if (status === 'Ej kontaktad' || status === 'Ingen kontakt möjlig' || status === 'Vilande') {
    return 'muted';
  }
  return 'info';
}

/** Tonens färgvariabel. Delas av prickar, etiketter och listan. */
export const TONE_COLOR: Record<StatusTone, string> = {
  good: 'var(--viz-s3)',
  linen: 'var(--viz-s4)',
  warm: 'var(--viz-s2)',
  info: 'var(--viz-s1)',
  flag: 'var(--viz-flag)',
  muted: 'var(--viz-ink-3)',
};

/** Färg + tonad platta, för statusetiketter som ska synas utan att skrika. */
export function toneStyle(status: string): { color: string; background: string; border: string } {
  const color = TONE_COLOR[statusTone(status)];
  return {
    color,
    background: `color-mix(in srgb, ${color} 11%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
  };
}

export type ClientWithCounts = ClientRow & {
  contactCount: number;
  workedCount: number;
  commerceCustomerCount: number;
  orderCount: number;
  lastContactedAt: string | null;
};

export function contactName(contact: { firstName: string; lastName: string | null }): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}


/** Kundens fakturaadress i den form resten av systemet läser den. */
export function clientAddress(client: ClientRow): PostalAddress | null {
  return normalizeAddress({
    line1: client.addressLine1,
    line2: client.addressLine2,
    postal_code: client.postalCode,
    city: client.city,
    country: client.country,
  });
}

/** Adressen som rader, tom lista när kunden inte har någon. */
export function clientAddressLines(client: ClientRow): string[] {
  const address = clientAddress(client);
  return address ? formatAddressLines(address) : [];
}

/**
 * Vad som fattas innan kunden kan faktureras, eller null när allt finns.
 *
 * Samma krav som kassan ställer, så att en kund som ser komplett ut i admin
 * också går igenom där. Ordningen är den man rimligen fyller i fälten.
 */
export function clientInvoiceGap(client: ClientRow): 'orgNumber' | 'address' | 'country' | null {
  if (!client.orgNumber || !isValidCompanyRegistrationNumber(client.orgNumber)) return 'orgNumber';
  const address = clientAddress(client);
  if (!addressIsComplete(address)) return 'address';
  if (!isInvoiceCountry(address.country)) return 'country';
  return null;
}
