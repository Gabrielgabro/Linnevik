/**
 * Vad butiken skickar in, och vad som går att härleda ur begäran.
 *
 * Rent från databasen med flit: allt här inne är indata in och etiketter ut,
 * så reglerna går att testa utan att någon rad skrivs. Skrivningen ligger i
 * `analyticsDb.ts`.
 *
 * Två saker sparas aldrig: IP-adressen och user agent-strängen. Enheten och
 * webbläsaren räknas fram här och lagras som färdiga ord ("Mobil", "Safari"),
 * och platsen kommer från Vercels edge-huvuden och är grov till stadsnivå.
 */

/** Slumptal från webbläsaren: url-säkra tecken, aldrig något personligt. */
const ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_PATH = 512;
const MAX_REFERRER = 2048;

export type VisitInput = {
  eventId: string;
  visitorId: string;
  sessionId: string;
  path: string;
  locale: 'sv' | 'en';
  eventType: 'page_view' | 'product_view';
  productHandle: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
};

export type Acquisition = {
  category: 'direct' | 'search' | 'social' | 'email' | 'referral' | 'other';
  detail: string;
  referrerHost: string | null;
};

export type Technology = {
  device: string;
  browser: string;
  operatingSystem: string;
};

export type Geo = {
  countryCode: string | null;
  region: string | null;
  regionCode: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export class VisitInputError extends Error {}

const SOCIAL_SOURCES: Record<string, string> = {
  facebook: 'Facebook',
  fb: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  tiktok: 'TikTok',
  twitter: 'X / Twitter',
  x: 'X / Twitter',
  youtube: 'YouTube',
};

const SEARCH_SOURCES: Record<string, string> = {
  bing: 'Bing',
  duckduckgo: 'DuckDuckGo',
  ecosia: 'Ecosia',
  google: 'Google',
  yahoo: 'Yahoo',
  yandex: 'Yandex',
};

function requiredText(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new VisitInputError(`${key} saknas eller är för långt.`);
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: string, max: number): string {
  const value = record[key];
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > max) {
    throw new VisitInputError(`${key} är ogiltigt.`);
  }
  return value;
}

export function parseVisit(body: unknown): VisitInput {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const eventId = requiredText(record, 'eventId', 80);
  const visitorId = requiredText(record, 'visitorId', 80);
  const sessionId = requiredText(record, 'sessionId', 80);
  if (!ID_PATTERN.test(eventId) || !ID_PATTERN.test(visitorId) || !ID_PATTERN.test(sessionId)) {
    throw new VisitInputError('Identifierarna är ogiltiga.');
  }

  const path = requiredText(record, 'path', MAX_PATH);
  // `//evil.example` är en giltig URL för webbläsaren men inte en sökväg i
  // butiken. Bara en enkel snedstreck-inledning duger.
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new VisitInputError('path måste vara en sökväg i butiken.');
  }

  const eventType = record.eventType === 'product_view' ? 'product_view' : 'page_view';

  return {
    eventId,
    visitorId,
    sessionId,
    path,
    locale: optionalText(record, 'locale', 2) === 'en' ? 'en' : 'sv',
    eventType,
    productHandle: optionalText(record, 'productHandle', 200),
    referrer: optionalText(record, 'referrer', MAX_REFERRER),
    utmSource: optionalText(record, 'utmSource', 120),
    utmMedium: optionalText(record, 'utmMedium', 120),
  };
}

function sourceMatch(value: string, sources: Record<string, string>): string | null {
  const normalized = value.toLowerCase();
  for (const [needle, label] of Object.entries(sources)) {
    if (normalized === needle || normalized.includes(needle)) return label;
  }
  return null;
}

/**
 * Var besöket kom ifrån. UTM-taggarna går före referraren när båda finns:
 * en kampanjlänk vet bättre än webbläsarens `document.referrer`, som ofta är
 * tom eller pekar på en omdirigering på vägen.
 */
export function acquisitionOf(input: VisitInput, siteHost: string): Acquisition {
  const utmSource = input.utmSource.trim();
  const utmMedium = input.utmMedium.trim().toLowerCase();
  const socialUtm = sourceMatch(utmSource, SOCIAL_SOURCES);
  const searchUtm = sourceMatch(utmSource, SEARCH_SOURCES);

  if (socialUtm || /social/.test(utmMedium)) {
    return { category: 'social', detail: socialUtm ?? utmSource ?? 'Sociala medier', referrerHost: null };
  }
  if (searchUtm || /cpc|ppc|paidsearch|organic/.test(utmMedium)) {
    return { category: 'search', detail: searchUtm ?? utmSource ?? 'Sök', referrerHost: null };
  }
  if (/email|e-post|newsletter|nyhetsbrev/.test(utmMedium)) {
    return { category: 'email', detail: utmSource || 'E-post', referrerHost: null };
  }
  if (utmSource) return { category: 'other', detail: utmSource, referrerHost: null };

  if (!input.referrer) return { category: 'direct', detail: 'Direkt', referrerHost: null };
  let referrer: URL;
  try {
    referrer = new URL(input.referrer);
  } catch {
    return { category: 'other', detail: 'Övrigt', referrerHost: null };
  }

  const host = referrer.hostname.toLowerCase().replace(/^www\./, '');
  const own = siteHost.toLowerCase().replace(/^www\./, '');
  // Ett klick vidare inuti butiken är inte en ny källa.
  if (host === own) return { category: 'direct', detail: 'Direkt', referrerHost: null };

  const social = sourceMatch(host, SOCIAL_SOURCES);
  if (social) return { category: 'social', detail: social, referrerHost: host };
  const search = sourceMatch(host, SEARCH_SOURCES);
  if (search) return { category: 'search', detail: search, referrerHost: host };
  return { category: 'referral', detail: host, referrerHost: host };
}

/**
 * Enhet, webbläsare och operativsystem ur user agent och klienthintarna.
 * Strängen läses här och kastas — bara de tre orden når databasen.
 */
export function technologyOf(headers: Headers): Technology {
  const userAgent = headers.get('user-agent') ?? '';
  const mobileHint = headers.get('sec-ch-ua-mobile');
  const platformHint = (headers.get('sec-ch-ua-platform') ?? '').replaceAll('"', '');

  let device = 'Okänd';
  // Surfplatta först: en Android-platta säger "Android" utan "Mobile", och
  // testas den efter mobilen hamnar varenda iPad bland telefonerna.
  if (/iPad|Tablet|Silk/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) {
    device = 'Surfplatta';
  } else if (mobileHint === '?1' || /Mobi|iPhone|iPod|Android/i.test(userAgent)) {
    device = 'Mobil';
  } else if (mobileHint === '?0' || /Windows NT|Macintosh|X11|Linux|CrOS/i.test(userAgent)) {
    device = 'Dator';
  }

  // Ordningen är inte alfabetisk utan efter hur mycket varje webbläsare ljuger:
  // Edge och Opera säger båda "Chrome", och Chrome säger "Safari".
  let browser = 'Okänd';
  if (/Edg(?:A|iOS)?\//i.test(userAgent)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(userAgent)) browser = 'Opera';
  else if (/SamsungBrowser\//i.test(userAgent)) browser = 'Samsung Internet';
  else if (/FxiOS\/|Firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/CriOS\/|Chrome\//i.test(userAgent)) browser = 'Chrome';
  else if (/Version\/[^ ]+.*Safari\//i.test(userAgent)) browser = 'Safari';
  else if (userAgent) browser = 'Övrig';

  let operatingSystem = 'Okänd';
  if (/Android/i.test(platformHint) || /Android/i.test(userAgent)) operatingSystem = 'Android';
  else if (/iOS/i.test(platformHint) || /iPhone|iPad|iPod/i.test(userAgent)) operatingSystem = 'iOS';
  else if (/Windows/i.test(platformHint) || /Windows NT/i.test(userAgent)) operatingSystem = 'Windows';
  else if (/macOS/i.test(platformHint) || /Macintosh|Mac OS X/i.test(userAgent)) operatingSystem = 'macOS';
  else if (/Chrome OS/i.test(platformHint) || /CrOS/i.test(userAgent)) operatingSystem = 'Chrome OS';
  else if (/Linux/i.test(platformHint) || /Linux|X11/i.test(userAgent)) operatingSystem = 'Linux';
  else if (platformHint || userAgent) operatingSystem = 'Övrigt';

  return { device, browser, operatingSystem };
}

function headerText(value: string | null, max: number): string | null {
  if (!value) return null;
  // Vercel url-kodar stadsnamn med tecken utanför ASCII ("Malm%C3%B6").
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Trasig kodning: ta strängen som den är hellre än att tappa platsen.
  }
  const trimmed = decoded.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function coordinate(value: string | null, limit: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

/**
 * Platsen ur Vercels edge-huvuden. `x-vercel-ip-country-region` är ISO 3166-2
 * utan landsprefixet ("AB" för Stockholms län), vilket är precis vad kartans
 * regionfiler matchar på.
 */
export function geoOf(headers: Headers): Geo {
  const region = headerText(headers.get('x-vercel-ip-country-region'), 12);
  return {
    countryCode: headerText(headers.get('x-vercel-ip-country'), 2)?.toUpperCase() ?? null,
    // Vercel skickar bara koden, inte namnet. Kartan får koden i båda fälten
    // och matchar på den; namnet fylls i av regionfilen när den laddas.
    region,
    regionCode: region,
    city: headerText(headers.get('x-vercel-ip-city'), 120),
    timezone: headerText(headers.get('x-vercel-ip-timezone'), 80),
    latitude: coordinate(headers.get('x-vercel-ip-latitude'), 90),
    longitude: coordinate(headers.get('x-vercel-ip-longitude'), 180),
  };
}
