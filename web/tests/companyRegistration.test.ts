import { describe, expect, it } from 'vitest';
import {
  isValidCompanyRegistrationNumber,
  normalizeCompanyRegistrationNumber,
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
});
