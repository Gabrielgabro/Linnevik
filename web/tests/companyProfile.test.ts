import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addressIsComplete,
  formatAddressLines,
  isValidCompanyName,
  normalizeAddress,
  normalizeCompanyName,
  normalizeCountry,
  normalizePostalCode,
  resolveCompanyProfile,
  stripeAddress,
} from '@/lib/companyProfile';

const ADDRESS = {
  line1: 'Storgatan 1',
  line2: 'Plan 3',
  postalCode: '12345',
  city: 'Stockholm',
};

describe('postal address normalization', () => {
  it('writes Swedish postal codes in one form regardless of how they were typed', () => {
    for (const written of ['12345', '123 45', '123-45', ' SE-123 45 ', 'se12345']) {
      expect(normalizePostalCode(written)).toBe('123 45');
    }
  });

  it('leaves an untypeable postal code alone so the form can echo it back', () => {
    expect(normalizePostalCode('abc')).toBe('ABC');
    expect(normalizePostalCode('123')).toBe('123');
  });

  it('does not impose the Swedish shape on other countries', () => {
    expect(normalizePostalCode('SW1A 1AA', 'GB')).toBe('SW1A 1AA');
  });

  it('reads both the form and the database spelling of the postal code key', () => {
    expect(normalizeAddress({ ...ADDRESS })?.postal_code).toBe('123 45');
    expect(
      normalizeAddress({ line1: 'Storgatan 1', postal_code: '12345', city: 'Stockholm' })
        ?.postal_code
    ).toBe('123 45');
  });

  it('collapses stray whitespace so the same address compares equal', () => {
    const spaced = normalizeAddress({ ...ADDRESS, line1: '  Storgatan   1 ', city: ' Stockholm ' });
    expect(spaced).toEqual(normalizeAddress(ADDRESS));
  });

  it('defaults the country to Sweden and normalizes what it is given', () => {
    expect(normalizeAddress(ADDRESS)?.country).toBe('SE');
    expect(normalizeAddress({ ...ADDRESS, country: 'no' })?.country).toBe('NO');
    expect(normalizeCountry('Sverige')).toBe('');
  });

  it('treats an empty form as no address rather than as a blank one', () => {
    expect(normalizeAddress({ line1: '', city: '', postalCode: '' })).toBeNull();
    expect(normalizeAddress(null)).toBeNull();
    expect(normalizeAddress('Storgatan 1')).toBeNull();
  });

  it('requires street, city and a well-formed postal code to be complete', () => {
    expect(addressIsComplete(normalizeAddress(ADDRESS))).toBe(true);
    expect(addressIsComplete(normalizeAddress({ ...ADDRESS, city: '' }))).toBe(false);
    expect(addressIsComplete(normalizeAddress({ ...ADDRESS, postalCode: '123' }))).toBe(false);
    expect(addressIsComplete(normalizeAddress({ ...ADDRESS, line1: '' }))).toBe(false);
    expect(addressIsComplete(null)).toBe(false);
  });

  it('formats the address as the lines an invoice prints', () => {
    expect(formatAddressLines(normalizeAddress(ADDRESS)!)).toEqual([
      'Storgatan 1',
      'Plan 3',
      '123 45 Stockholm',
    ]);
  });

  it('names the country only when it is not the one we invoice from', () => {
    const foreign = normalizeAddress({ ...ADDRESS, postalCode: '0150', country: 'NO' })!;
    expect(formatAddressLines(foreign)).toContain('NO');
  });

  it('hands Stripe undefined where we store null', () => {
    const address = normalizeAddress({ ...ADDRESS, line2: '' })!;
    expect(address.line2).toBeNull();
    expect(stripeAddress(address).line2).toBeUndefined();
    expect(stripeAddress(address).state).toBeUndefined();
  });
});

describe('company name normalization', () => {
  it('collapses whitespace so one company is one name', () => {
    expect(normalizeCompanyName('  Hotell   Linné  AB ')).toBe('Hotell Linné AB');
  });

  it('rejects a name too short to be a company or too long to store', () => {
    expect(isValidCompanyName('A')).toBe(false);
    expect(isValidCompanyName('AB')).toBe(true);
    expect(isValidCompanyName('x'.repeat(121))).toBe(false);
  });
});

describe('invoice profile', () => {
  const valid = {
    email: 'inkop@hotell.se',
    companyName: 'Hotell Linné AB',
    organizationNumber: '556016-0680',
    address: ADDRESS,
  };

  it('accepts a complete profile and returns it normalized', () => {
    const result = resolveCompanyProfile(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Organisationsnumret lagras i sin momsnummerform, adressen i sin.
    expect(result.profile.organizationNumber).toBe('SE556016068001');
    expect(result.profile.address.postal_code).toBe('123 45');
    expect(result.profile.email).toBe('inkop@hotell.se');
  });

  it('lowercases the e-mail so one account is not two', () => {
    const result = resolveCompanyProfile({ ...valid, email: 'Inkop@Hotell.SE' });
    expect(result.ok && result.profile.email).toBe('inkop@hotell.se');
  });

  it('names the field that is missing rather than failing generically', () => {
    expect(resolveCompanyProfile({ ...valid, email: 'nope' })).toEqual({ ok: false, missing: 'email' });
    expect(resolveCompanyProfile({ ...valid, companyName: '' })).toEqual({
      ok: false,
      missing: 'companyName',
    });
    expect(resolveCompanyProfile({ ...valid, organizationNumber: '123' })).toEqual({
      ok: false,
      missing: 'organizationNumber',
    });
    expect(resolveCompanyProfile({ ...valid, address: { ...ADDRESS, city: '' } })).toEqual({
      ok: false,
      missing: 'address',
    });
  });

  it('separates "not a valid address" from "an address we cannot invoice"', () => {
    const foreign = { ...valid, address: { ...ADDRESS, postalCode: '0150', country: 'NO' } };
    expect(resolveCompanyProfile(foreign)).toEqual({ ok: false, missing: 'country' });
    expect(resolveCompanyProfile({ ...foreign, requireInvoiceCountry: false }).ok).toBe(true);
  });
});

describe('one set of rules for the whole invoice identity', () => {
  const account = readFileSync(resolve('app/[locale]/account/actions.ts'), 'utf8');
  const invoice = readFileSync(resolve('app/api/invoice/route.ts'), 'utf8');
  const register = readFileSync(resolve('app/[locale]/login/actions.ts'), 'utf8');
  const operations = readFileSync(resolve('src/lib/commerceOperations.ts'), 'utf8');

  it('validates the account form with the same call the invoice route makes', () => {
    // Medan kontosidan hade egna regler kunde den spara uppgifter som kassan
    // sedan avvisade — och kontosidan är enda stället de går att rätta på.
    expect(account).toContain('resolveCompanyProfile');
    expect(invoice).toContain('resolveCompanyProfile');
  });

  it('collects company name and address at registration', () => {
    expect(register).toContain('addressIsComplete');
    expect(register).toContain('isValidCompanyName');
    expect(register).toContain('companyName,\n            address,');
  });

  it('writes every stored address through the normalizer', () => {
    expect(operations).toContain('const shippingAddress = normalizeAddress(input.shippingAddress)');
    expect(operations).toContain('const billingAddress = normalizeAddress(input.billingAddress)');
  });

  it('matches a second employee of the same company to the same customer record', () => {
    expect(operations).toContain('eq(clients.orgNumber, input.orgNumber)');
  });

  it('never overwrites a curated customer record from a checkout form', () => {
    expect(operations).toContain('fillClientProfileGaps');
    expect(operations).toContain('if (!client.orgNumber && columns.orgNumber)');
  });

  it('registers the VAT number with Stripe as a tax id, not only as a custom field', () => {
    expect(invoice).toContain('customers.createTaxId');
    expect(invoice).toContain('STRIPE_TAX_ID_TYPE');
  });
});
