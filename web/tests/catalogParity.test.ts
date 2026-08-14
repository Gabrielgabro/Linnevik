import { describe, expect, it } from 'vitest';
import { InputError, parseCollectionInput } from '@/lib/productsInput';

describe('collection content input', () => {
  it('keeps bilingual description and SEO content', () => {
    expect(
      parseCollectionInput({
        titleSv: 'Täcken',
        titleEn: 'Duvets',
        descriptionHtml: '  <p>Varmt</p>  ',
        descriptionHtmlEn: '<p>Warm</p>',
        seoTitle: 'Hotelltäcken',
        seoTitleEn: 'Hotel duvets',
        seoDescription: 'Täcken för hotell',
        seoDescriptionEn: 'Duvets for hotels',
      })
    ).toMatchObject({
      descriptionHtml: '<p>Varmt</p>',
      descriptionHtmlEn: '<p>Warm</p>',
      seoTitle: 'Hotelltäcken',
      seoTitleEn: 'Hotel duvets',
      seoDescription: 'Täcken för hotell',
      seoDescriptionEn: 'Duvets for hotels',
    });
  });

  it('turns cleared optional content into null', () => {
    expect(
      parseCollectionInput({ descriptionHtml: ' ', seoDescriptionEn: '' }, { partial: true })
    ).toEqual({ descriptionHtml: null, seoDescriptionEn: null });
  });

  it('rejects content beyond the backend limit', () => {
    expect(() =>
      parseCollectionInput({ descriptionHtml: 'x'.repeat(20_001) }, { partial: true })
    ).toThrow(InputError);
  });
});
