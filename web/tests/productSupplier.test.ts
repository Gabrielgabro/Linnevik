import { describe, expect, it } from 'vitest';
import { parseProductInput } from '@/lib/productsInput';

describe('supplier input', () => {
  it('leaves the supplier untouched when the field is absent', () => {
    expect(parseProductInput({ title: 'Lakan' })).not.toHaveProperty('supplier');
  });

  it('keeps a named supplier', () => {
    expect(parseProductInput({ title: 'Lakan', supplier: '  Linnevik ' }).supplier).toBe('Linnevik');
  });

  // Kolumnen är NOT NULL: den som tömmer fältet menar "vi vet inte", och det
  // svaret måste gå att spara.
  it('turns a cleared field into unknown rather than null', () => {
    expect(parseProductInput({ title: 'Lakan', supplier: '' }).supplier).toBe('unknown');
    expect(parseProductInput({ title: 'Lakan', supplier: '   ' }).supplier).toBe('unknown');
  });
});
