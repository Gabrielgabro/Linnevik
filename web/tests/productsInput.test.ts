import { describe, expect, it } from 'vitest';
import { InputError, parseIdList, parsePrimaryCollectionId, parseProductInput } from '@/lib/productsInput';

describe('parseProductInput', () => {
  // Regressionen som gjorde att kategoripanelen tömde produkten den sparade:
  // panelen skickar bara sina kategori-id:n, och parsern svarade null för
  // varje fält den inte såg. Drizzle skriver null, hoppar över undefined —
  // så påslakan förlorade engelsk titel, båda beskrivningarna och varumärket.
  it('lämnar fält som inte skickades med orörda', () => {
    const input = parseProductInput({ collectionIds: [5], primaryCollectionId: 5 }, { partial: true });

    expect(input).toEqual({});
    for (const key of [
      'titleEn',
      'descriptionHtml',
      'descriptionHtmlEn',
      'productType',
      'vendor',
      'seoTitle',
      'seoDescription',
      'seoTitleEn',
      'seoDescriptionEn',
    ]) {
      expect(input).not.toHaveProperty(key);
    }
  });

  it('nollar ett fält som skickades tomt', () => {
    const input = parseProductInput({ titleEn: '  ' }, { partial: true });
    expect(input.titleEn).toBeNull();
  });

  it('behåller ett fält som skickades med innehåll', () => {
    const input = parseProductInput({ titleEn: ' Duvet cover ' }, { partial: true });
    expect(input.titleEn).toBe('Duvet cover');
  });

  it('tar emot de engelska SEO-fälten', () => {
    const input = parseProductInput(
      { seoTitleEn: 'Bed linen', seoDescriptionEn: 'Hotel bed linen' },
      { partial: true }
    );
    expect(input.seoTitleEn).toBe('Bed linen');
    expect(input.seoDescriptionEn).toBe('Hotel bed linen');
  });

  // Handlen är NOT NULL. En tomrensad handle betyder "behåll", inte "ta bort".
  it('rör inte handlen när den skickas tom', () => {
    expect(parseProductInput({ handle: '' }, { partial: true })).not.toHaveProperty('handle');
  });

  it('kräver en titel när anropet inte är partiellt', () => {
    expect(() => parseProductInput({})).toThrow(InputError);
  });

  it('tomrensad leverantör blir unknown, aldrig null', () => {
    expect(parseProductInput({ supplier: '' }, { partial: true }).supplier).toBe('unknown');
  });
});

describe('parsePrimaryCollectionId', () => {
  // Utan primär finns ingen brödsmula på produktsidan. Att tyst släppa den var
  // det som gjorde felet osynligt tills någon tittade på sajten.
  it('kräver en primär när kategorier valts', () => {
    expect(() => parsePrimaryCollectionId({ collectionIds: [5] }, [5])).toThrow(InputError);
  });

  it('vägrar en primär som inte är bland de valda', () => {
    expect(() => parsePrimaryCollectionId({ primaryCollectionId: 9 }, [5])).toThrow(InputError);
  });

  it('vägrar ett ogiltigt id', () => {
    expect(() => parsePrimaryCollectionId({ primaryCollectionId: 'nej' }, [5])).toThrow(InputError);
  });

  it('släpper igenom en primär bland de valda', () => {
    expect(parsePrimaryCollectionId({ primaryCollectionId: 5 }, [5, 7])).toBe(5);
  });

  it('tomt urval ger ingen primär', () => {
    expect(parsePrimaryCollectionId({}, [])).toBeNull();
  });
});

describe('parseIdList', () => {
  it('saknad nyckel ger tom lista', () => {
    expect(parseIdList({}, 'collectionIds')).toEqual([]);
  });

  it('vägrar något som inte är en lista', () => {
    expect(() => parseIdList({ collectionIds: 5 }, 'collectionIds')).toThrow(InputError);
  });

  it('vägrar ett ogiltigt id i listan', () => {
    expect(() => parseIdList({ collectionIds: [1, 0] }, 'collectionIds')).toThrow(InputError);
  });
});
