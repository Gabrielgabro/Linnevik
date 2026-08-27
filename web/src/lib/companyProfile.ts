/**
 * Fakturaidentiteten för ett företag: namn, organisationsnummer och postadress.
 *
 * Den bor på tre ställen — registreringen, kontosidan och admin — och läses av
 * ett fjärde, fakturarutten. Utan en gemensam normalisering blir "123 45",
 * "12345" och "SE-123 45" tre olika postnummer, och en faktura som avvisas i
 * kassan för att adressen sparades i fel form. Allt som skrivs ned går därför
 * genom `normalizeAddress` först, och allt som ska bli en faktura genom
 * `resolveCompanyProfile`.
 *
 * Organisationsnumret normaliseras av companyRegistration.ts — samma regler
 * som registreringen alltid har använt.
 */

import {
  isValidCompanyRegistrationNumber,
  normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';

/**
 * Fakturering sker tills vidare bara mot svenska adresser: frakt- och
 * momsreglerna i kassan är byggda för det. Landet lagras ändå per adress, så
 * att en utvidgning blir en ändring här och inte i databasen.
 */
export const INVOICE_COUNTRY = 'SE';
const INVOICE_COUNTRIES: readonly string[] = [INVOICE_COUNTRY];

export function isInvoiceCountry(country: string): boolean {
  return INVOICE_COUNTRIES.includes(country);
}

/**
 * Nycklarna är snake_case därför att det är formen som redan ligger i
 * `customers.default_billing_address` och samtidigt den Stripe vill ha på
 * `customer.address`. Att byta hade krävt en översättning i varje ände.
 */
export type PostalAddress = {
  line1: string;
  line2: string | null;
  city: string;
  postal_code: string;
  state: string | null;
  country: string;
};

export const COMPANY_NAME_MIN = 2;
export const COMPANY_NAME_MAX = 120;
export const ADDRESS_FIELD_MAX = 120;

/** Trim plus hopslagna mellanslag: "AB  Linne \n Väveri" och "AB Linne Väveri" är samma namn. */
function collapse(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function normalizeCompanyName(input: unknown): string {
  return collapse(input);
}

export function isValidCompanyName(name: string): boolean {
  return name.length >= COMPANY_NAME_MIN && name.length <= COMPANY_NAME_MAX;
}

/** ISO-3166-1 alpha-2, versaler. Tom sträng betyder "gick inte att tyda". */
export function normalizeCountry(input: unknown): string {
  const value = collapse(input).toUpperCase().replace(/[^A-Z]/g, '');
  return /^[A-Z]{2}$/.test(value) ? value : '';
}

/**
 * Svenska postnummer skrivs "NNN NN". Kunder skriver dem på alla andra sätt
 * också, och Stripe bryr sig inte — men fakturan ska se likadan ut varje gång,
 * och en jämförelse mellan två sparade adresser ska inte falla på ett mellanslag.
 *
 * Otydbar indata lämnas orörd i stället för att kastas: `isValidPostalCode`
 * fäller den, och formuläret kan visa tillbaka vad kunden faktiskt skrev.
 */
export function normalizePostalCode(input: unknown, country: string = INVOICE_COUNTRY): string {
  const raw = collapse(input).toUpperCase();
  if (country !== 'SE') return raw;
  const digits = raw.replace(/^SE[-\s]?/, '').replace(/[\s-]/g, '');
  if (!/^\d{5}$/.test(digits)) return raw;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

export function isValidPostalCode(value: string, country: string = INVOICE_COUNTRY): boolean {
  if (country === 'SE') return /^\d{3} \d{2}$/.test(value);
  return value.length >= 3 && value.length <= 16;
}

type AddressLike = {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  postalCode?: unknown;
  postal_code?: unknown;
  state?: unknown;
  country?: unknown;
};

/**
 * Läser en adress från ett formulär, ett API-anrop eller en sparad jsonb-post.
 * Både `postalCode` och `postal_code` accepteras — formulären skickar det ena,
 * databasen och Stripe det andra.
 *
 * Returnerar null när ingenting av substans angavs, så att ett tomt formulär
 * inte skriver över en sparad adress med tomma strängar.
 */
export function normalizeAddress(input: unknown): PostalAddress | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as AddressLike;
  const country = normalizeCountry(source.country) || INVOICE_COUNTRY;
  const address: PostalAddress = {
    line1: collapse(source.line1),
    line2: collapse(source.line2) || null,
    city: collapse(source.city),
    postal_code: normalizePostalCode(source.postalCode ?? source.postal_code, country),
    state: collapse(source.state) || null,
    country,
  };
  if (!address.line1 && !address.city && !address.postal_code) return null;
  return address;
}

/** Allt en faktura behöver: gatuadress, ort, ett postnummer i landets form. */
export function addressIsComplete(address: PostalAddress | null | undefined): address is PostalAddress {
  if (!address) return false;
  if (!address.line1 || address.line1.length > ADDRESS_FIELD_MAX) return false;
  if (!address.city || address.city.length > ADDRESS_FIELD_MAX) return false;
  if (address.line2 && address.line2.length > ADDRESS_FIELD_MAX) return false;
  if (!normalizeCountry(address.country)) return false;
  return isValidPostalCode(address.postal_code, address.country);
}

/** Adressen som rader, i den ordning de ska stå på ett kuvert eller en faktura. */
export function formatAddressLines(address: PostalAddress): string[] {
  return [
    address.line1,
    address.line2,
    [address.postal_code, address.city].filter(Boolean).join(' '),
    isInvoiceCountry(address.country) ? null : address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

export type CompanyProfile = {
  email: string;
  companyName: string;
  organizationNumber: string;
  address: PostalAddress;
};

/** Vilken bit som saknas, så att felmeddelandet kan peka på rätt fält. */
export type CompanyProfileGap = 'email' | 'companyName' | 'organizationNumber' | 'address' | 'country';

export type CompanyProfileResult =
  | { ok: true; profile: CompanyProfile }
  | { ok: false; missing: CompanyProfileGap };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sätter ihop och kontrollerar en fakturaidentitet i ett svep. Anroparen ger
 * fälten i fallande förtroendeordning (t.ex. det kunden fyllde i för just den
 * här fakturan före det som ligger sparat) och får antingen en färdig profil
 * eller namnet på det som fattas.
 */
export function resolveCompanyProfile(input: {
  email?: unknown;
  companyName?: unknown;
  organizationNumber?: unknown;
  address?: unknown;
  requireInvoiceCountry?: boolean;
}): CompanyProfileResult {
  const email = collapse(input.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { ok: false, missing: 'email' };

  const companyName = normalizeCompanyName(input.companyName);
  if (!isValidCompanyName(companyName)) return { ok: false, missing: 'companyName' };

  const organizationNumber = normalizeCompanyRegistrationNumber(input.organizationNumber);
  if (!isValidCompanyRegistrationNumber(organizationNumber)) {
    return { ok: false, missing: 'organizationNumber' };
  }

  const address = normalizeAddress(input.address);
  if (!addressIsComplete(address)) return { ok: false, missing: 'address' };
  if (input.requireInvoiceCountry !== false && !isInvoiceCountry(address.country)) {
    return { ok: false, missing: 'country' };
  }

  return { ok: true, profile: { email, companyName, organizationNumber, address } };
}

/**
 * Stripes typ för ett EU-momsnummer. `normalizeCompanyRegistrationNumber` ger
 * alltid VAT-formen (SE + tolv siffror för svenska bolag), så det är den typen
 * som gäller — inte `se_org` eller något eget.
 */
export const STRIPE_TAX_ID_TYPE = 'eu_vat' as const;

/**
 * Adressen i den form Stripe tar emot. Skillnaden är bara att Stripe vill ha
 * `undefined` där vi lagrar `null` — ett null på `line2` avvisas av deras typer.
 */
export function stripeAddress(address: PostalAddress) {
  return {
    line1: address.line1,
    line2: address.line2 ?? undefined,
    city: address.city,
    postal_code: address.postal_code,
    state: address.state ?? undefined,
    country: address.country,
  };
}
