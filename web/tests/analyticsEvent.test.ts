import { describe, expect, it } from 'vitest';
import {
  acquisitionOf,
  geoOf,
  parseVisit,
  technologyOf,
  VisitInputError,
  type VisitInput,
} from '@/lib/analyticsEvent';

const base = {
  eventId: 'aaaaaaaaaaaaaaaa',
  visitorId: 'bbbbbbbbbbbbbbbb',
  sessionId: 'cccccccccccccccc',
  path: '/sv',
};

const visit = (overrides: Partial<VisitInput> = {}): VisitInput =>
  parseVisit({ ...base, ...overrides });

describe('parseVisit', () => {
  it('tar emot en giltig kropp', () => {
    const parsed = visit({ eventType: 'product_view', productHandle: 'badrock', locale: 'en' });
    expect(parsed.eventType).toBe('product_view');
    expect(parsed.productHandle).toBe('badrock');
    expect(parsed.locale).toBe('en');
  });

  it('kastar en protokollrelativ sökväg', () => {
    // `//evil.example` är en giltig URL för webbläsaren men ingen sökväg här.
    expect(() => parseVisit({ ...base, path: '//evil.example' })).toThrow(VisitInputError);
    expect(() => parseVisit({ ...base, path: 'https://evil.example' })).toThrow(VisitInputError);
  });

  it('kastar identifierare som inte är slumptal', () => {
    expect(() => parseVisit({ ...base, visitorId: 'gabriel@linnevik.se' })).toThrow(VisitInputError);
    expect(() => parseVisit({ ...base, visitorId: 'kort' })).toThrow(VisitInputError);
  });

  it('faller tillbaka på svenska och sidvisning vid skräp i valfria fält', () => {
    const parsed = parseVisit({ ...base, locale: 'zz', eventType: 'köp' });
    expect(parsed.locale).toBe('sv');
    expect(parsed.eventType).toBe('page_view');
  });
});

describe('acquisitionOf', () => {
  const host = 'linnevik.se';

  it('läser sökmotorn ur referraren', () => {
    expect(acquisitionOf(visit({ referrer: 'https://www.google.com/search?q=x' }), host)).toEqual({
      category: 'search',
      detail: 'Google',
      referrerHost: 'google.com',
    });
  });

  it('räknar ett klick inuti butiken som direkt, inte som hänvisning', () => {
    expect(acquisitionOf(visit({ referrer: 'https://www.linnevik.se/sv' }), host).category).toBe('direct');
  });

  it('låter UTM gå före referraren', () => {
    const result = acquisitionOf(
      visit({ referrer: 'https://t.co/abc', utmSource: 'nyhetsbrev', utmMedium: 'email' }),
      host
    );
    expect(result.category).toBe('email');
    // Ingen referrerHost när källan kommer ur taggen: värden ska inte blandas.
    expect(result.referrerHost).toBeNull();
  });

  it('behåller okända hänvisare med sitt värdnamn', () => {
    expect(acquisitionOf(visit({ referrer: 'https://hotellrevyn.se/artikel' }), host)).toEqual({
      category: 'referral',
      detail: 'hotellrevyn.se',
      referrerHost: 'hotellrevyn.se',
    });
  });

  it('är direkt utan referrare och tål en trasig sådan', () => {
    expect(acquisitionOf(visit(), host).category).toBe('direct');
    expect(acquisitionOf(visit({ referrer: 'inte-en-url' }), host).category).toBe('other');
  });
});

describe('technologyOf', () => {
  const of = (userAgent: string, extra: Record<string, string> = {}) =>
    technologyOf(new Headers({ 'user-agent': userAgent, ...extra }));

  it('skiljer surfplatta från mobil', () => {
    // En Androidplatta säger "Android" utan "Mobile" och blir annars en telefon.
    expect(of('Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/120 Safari/537.36').device).toBe('Surfplatta');
    expect(of('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1').device).toBe('Mobil');
    expect(of('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36').device).toBe('Dator');
  });

  it('ser igenom webbläsare som utger sig för att vara Chrome eller Safari', () => {
    expect(of('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120').browser).toBe('Edge');
    expect(of('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 OPR/106').browser).toBe('Opera');
    expect(of('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15').browser).toBe('Safari');
  });

  it('litar på klienthinten före strängen', () => {
    const result = of('', { 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' });
    expect(result.device).toBe('Mobil');
    expect(result.operatingSystem).toBe('Android');
  });

  it('svarar Okänd i stället för att gissa på ingenting', () => {
    expect(technologyOf(new Headers())).toEqual({
      device: 'Okänd',
      browser: 'Okänd',
      operatingSystem: 'Okänd',
    });
  });
});

describe('geoOf', () => {
  it('avkodar stadsnamn och läser koordinater', () => {
    const geo = geoOf(
      new Headers({
        'x-vercel-ip-country': 'se',
        'x-vercel-ip-country-region': 'M',
        'x-vercel-ip-city': 'Malm%C3%B6',
        'x-vercel-ip-latitude': '55.6050',
        'x-vercel-ip-longitude': '13.0038',
      })
    );
    expect(geo).toMatchObject({
      countryCode: 'SE',
      regionCode: 'M',
      city: 'Malmö',
      latitude: 55.605,
      longitude: 13.0038,
    });
  });

  it('kastar koordinater utanför jordklotet', () => {
    const geo = geoOf(new Headers({ 'x-vercel-ip-latitude': '999', 'x-vercel-ip-longitude': 'abc' }));
    expect(geo.latitude).toBeNull();
    expect(geo.longitude).toBeNull();
  });

  it('ger null när huvudena saknas helt', () => {
    expect(geoOf(new Headers()).countryCode).toBeNull();
  });
});
