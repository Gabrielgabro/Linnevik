import { describe, expect, it } from 'vitest';
import { isPlausibleEmail, normalizeEmail } from '@/lib/magicLink';

describe('normalizeEmail', () => {
  it('trims whitespace and lowercases so lookups match regardless of how the address was typed', () => {
    expect(normalizeEmail('  Anna@Linnevik.SE  ')).toBe('anna@linnevik.se');
  });
});

describe('isPlausibleEmail', () => {
  it('accepts an ordinary address', () => {
    expect(isPlausibleEmail('anna@linnevik.se')).toBe(true);
  });

  it('rejects input with no @ or no domain', () => {
    expect(isPlausibleEmail('not-an-email')).toBe(false);
    expect(isPlausibleEmail('anna@')).toBe(false);
    expect(isPlausibleEmail('@linnevik.se')).toBe(false);
  });

  it('rejects addresses over the RFC 5321 length limit', () => {
    const tooLong = `${'a'.repeat(250)}@x.se`;
    expect(isPlausibleEmail(tooLong)).toBe(false);
  });

  it('rejects whitespace inside the address', () => {
    expect(isPlausibleEmail('anna @linnevik.se')).toBe(false);
  });
});
