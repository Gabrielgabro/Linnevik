import { describe, expect, it } from 'vitest';
import {
  isValidCompanyRegistrationNumber,
  normalizeCompanyRegistrationNumber,
  swedishOrganizationNumber,
} from '@/lib/companyRegistration';

describe('company registration numbers', () => {
  it('accepts and canonicalizes a valid Swedish organization number', () => {
    const normalized = normalizeCompanyRegistrationNumber('556016-0680');
    expect(normalized).toBe('SE556016068001');
    expect(isValidCompanyRegistrationNumber(normalized)).toBe(true);
  });

  it('rejects Swedish numbers with a bad checksum or a wrong length', () => {
    expect(isValidCompanyRegistrationNumber('SE556016068101')).toBe(false);
    expect(isValidCompanyRegistrationNumber('SE5560160680')).toBe(false);
    expect(isValidCompanyRegistrationNumber('SE55601606800101')).toBe(false);
  });

  it('collapses every written form of one company onto a single key', () => {
    // Nyckeln till hela kontoträdet. Alla varianter nedan står på samma
    // företag, och två av dem avvisades förut som ogiltiga.
    for (const written of [
      '556016-0680',
      '5560160680',
      '556016 0680',
      'SE5560160680',
      'SE556016-0680',
      'se556016-0680',
      'SE 556016-0680 01',
      'SE556016068001',
    ]) {
      expect(normalizeCompanyRegistrationNumber(written)).toBe('SE556016068001');
    }
  });

  it('rejects a twelve-digit number written without a country prefix', () => {
    // "16" + organisationsnummer är Bolagsverkets och SIE-filernas form, men
    // den går inte att skilja från ett momsnummer utan SE: var tionde sådan
    // sträng är giltig som båda. En gissning som slår fel lägger företaget
    // under en egen förälder, så den formen avvisas i stället.
    expect(isValidCompanyRegistrationNumber(normalizeCompanyRegistrationNumber('16556016-0680'))).toBe(
      false
    );
    expect(isValidCompanyRegistrationNumber(normalizeCompanyRegistrationNumber('165560160680'))).toBe(
      false
    );
  });

  it('accepts a VAT group or branch sequence number other than 01', () => {
    // Only `01` used to pass, which locked every group registration out.
    expect(isValidCompanyRegistrationNumber('SE556016068002')).toBe(true);
    expect(isValidCompanyRegistrationNumber('SE556016068017')).toBe(true);
  });

  it('accepts supported EU prefixes and normalizes the Greek prefix', () => {
    expect(isValidCompanyRegistrationNumber('DE123456789')).toBe(true);
    expect(normalizeCompanyRegistrationNumber('GR 123456789')).toBe('EL123456789');
    expect(isValidCompanyRegistrationNumber('EL123456789')).toBe(true);
  });

  it('rejects invented country prefixes and punctuation-only input', () => {
    expect(isValidCompanyRegistrationNumber('ZZ123456789')).toBe(false);
    expect(normalizeCompanyRegistrationNumber('---')).toBe('');
  });

  it('derives the printed organisation number from a Swedish VAT number', () => {
    // Fakturan skrev ut momsnumret under rubriken "Organisationsnummer".
    // Det vi lagrar är momsnumret; organisationsnumret är de tio siffrorna
    // i mitten, skrivna med bindestreck.
    expect(swedishOrganizationNumber('SE556481331801')).toBe('556481-3318');
    expect(swedishOrganizationNumber('SE556016068002')).toBe('556016-0680');
  });

  it('has no organisation number to print for a non-Swedish registration', () => {
    expect(swedishOrganizationNumber('DE123456789')).toBeNull();
    expect(swedishOrganizationNumber('556481-3318')).toBeNull();
    expect(swedishOrganizationNumber('')).toBeNull();
  });
});
