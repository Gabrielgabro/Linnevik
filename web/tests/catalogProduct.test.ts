import { describe, expect, it } from 'vitest';
import { deriveOptions, strictestRule } from '@/lib/catalogDb';

/**
 * Produktsidan läser numera varianterna ur vår egen tabell i stället för ur
 * Shopify. Optionslistan som variantväljaren renderar finns inte lagrad någon
 * stans — den härleds ur varianternas `option_values`, och `ProductForm` letar
 * sedan upp den valda varianten genom att matcha varje `selectedOptions` mot
 * valen. Går härledningen fel går det inte att lägga något i korgen.
 */
describe('deriveOptions', () => {
  const variant = (pairs: Array<[string, string]>) => ({
    option_values: pairs.map(([name, value]) => ({ name, value })),
  });

  it('behåller optionernas ordning och samlar värdena under rätt namn', () => {
    expect(
      deriveOptions([
        variant([
          ['storlek', '150 x 200'],
          ['Fyllning', 'Gåsdun'],
        ]),
        variant([
          ['storlek', '150 x 200'],
          ['Fyllning', 'Anddun'],
        ]),
        variant([
          ['storlek', '220 x 200'],
          ['Fyllning', 'Gåsdun'],
        ]),
      ] as never)
    ).toEqual([
      { name: 'storlek', values: ['150 x 200', '220 x 200'] },
      { name: 'Fyllning', values: ['Gåsdun', 'Anddun'] },
    ]);
  });

  it('tar värdena i den ordning de först dyker upp, utan dubbletter', () => {
    expect(
      deriveOptions([
        variant([['Färg', 'Grått']]),
        variant([['Färg', 'Beige']]),
        variant([['Färg', 'Grått']]),
      ] as never)
    ).toEqual([{ name: 'Färg', values: ['Grått', 'Beige'] }]);
  });

  /**
   * Importen skrev bara optionsnamnen på produktens första variant; resten fick
   * tomt namn (se scripts/repair-variant-options.mjs). Ett tomt namn får aldrig
   * bli en egen valbar option — då renderas en namnlös knappgrupp som ingen
   * variant kan matcha mot.
   */
  it('hoppar över namnlösa optioner i stället för att skapa en tom grupp', () => {
    expect(
      deriveOptions([
        variant([['storlek', '50 x 70']]),
        variant([['', '60 x 80']]),
      ] as never)
    ).toEqual([{ name: 'storlek', values: ['50 x 70'] }]);
  });

  it('svarar med en tom lista när varianten saknar option_values', () => {
    expect(deriveOptions([{ option_values: null }] as never)).toEqual([]);
  });
});

/**
 * MOQ och kartongsteg låg förr i Shopify-metafälten `b2b.moq` och
 * `b2b.pack_size`, som var tomma på samtliga produkter — sidan fick null och
 * visade ingen kvantitetsregel. Kolumnerna hos oss är NOT NULL med 1 som
 * standard, så 1 måste betyda samma sak som det frånvarande metafältet gjorde.
 */
describe('strictestRule', () => {
  it('svarar null när regeln är 1, alltså ingen regel', () => {
    expect(strictestRule([1, 1, 1])).toBeNull();
  });

  it('svarar null för en produkt utan säljbara varianter', () => {
    expect(strictestRule([])).toBeNull();
  });

  it('väljer den strängaste regeln, så att sidan aldrig lovar mindre än kassan kräver', () => {
    expect(strictestRule([1, 12, 6])).toBe(12);
  });
});
