'use client';

/**
 * Besöksmätaren i butiken.
 *
 * Skickar en rad per sidvisning till /api/analytics/visit — men bara när
 * besökaren tackat ja till analyskakor, och bara med värden webbläsaren själv
 * skapat. Ingen IP och ingen user agent skickas härifrån; det som går att
 * härleda ur begäran härleds på servern och sparas som färdiga etiketter.
 *
 * Tre identifierare, tre livslängder:
 *   besökare  localStorage, ett år  — "har den här personen varit här förr?"
 *   session   sessionStorage        — "hur många sidor tittade de på nu?"
 *   händelse  per anrop             — nyckeln som gör en omsändning ofarlig
 *
 * Tackar besökaren nej, eller ändrar sig, raderas alla tre.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_KEY = 'linnevik:analytics-visitor';
const SESSION_KEY = 'linnevik:analytics-session';
const ACQUISITION_KEY = 'linnevik:analytics-acquisition';
const CONSENT_KEY = 'linnevik:cookie-consent';
const VISITOR_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

type Acquisition = { referrer: string; utmSource: string; utmMedium: string };

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function analyticsAllowed(): boolean {
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    return saved ? Boolean(JSON.parse(saved)?.analytics) : false;
  } catch {
    return false;
  }
}

/**
 * Besökarens id, med en utgångstid sparad bredvid.
 *
 * `localStorage` har ingen egen utgång, så ett id som skrivits en gång hade
 * legat kvar för alltid. Tiden ligger därför i värdet och läses vid varje
 * besök: ett år efter första besöket börjar personen om som ny.
 */
function visitorId(): string {
  try {
    const raw = window.localStorage.getItem(VISITOR_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        if (saved?.id && Number(saved.expiresAt) > Date.now()) return String(saved.id);
      } catch {
        // Ett id sparat i det gamla, oförpackade formatet: behåll personen och
        // ge id:t en utgångstid i stället för att räkna dem som ny.
        if (ID_PATTERN.test(raw)) {
          window.localStorage.setItem(
            VISITOR_KEY,
            JSON.stringify({ id: raw, expiresAt: Date.now() + VISITOR_TTL_MS })
          );
          return raw;
        }
      }
    }
    const id = randomId();
    window.localStorage.setItem(VISITOR_KEY, JSON.stringify({ id, expiresAt: Date.now() + VISITOR_TTL_MS }));
    return id;
  } catch {
    // Lagringen kan vara avstängd. Besöket räknas då, men personen blir ny.
    return randomId();
  }
}

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = randomId();
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/**
 * Varifrån besöket kom, sparat en gång per session.
 *
 * Måste sparas: `document.referrer` är Google på första sidan och butiken
 * själv på alla följande, så utan det här hade varenda session sett ut som
 * "direkt" så fort någon klickade vidare.
 */
function acquisition(): Acquisition {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(ACQUISITION_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved as Acquisition;
  } catch {
    // Trasigt värde: läs om från den här sidan i stället.
  }
  const params = new URLSearchParams(window.location.search);
  const value: Acquisition = {
    referrer: document.referrer || '',
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
  };
  try {
    window.sessionStorage.setItem(ACQUISITION_KEY, JSON.stringify(value));
  } catch {
    // Går det inte att spara får varje sida läsa om — sämre, men inte trasigt.
  }
  return value;
}

function forget() {
  try {
    window.localStorage.removeItem(VISITOR_KEY);
  } catch {
    /* lagringen är avstängd */
  }
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(ACQUISITION_KEY);
  } catch {
    /* lagringen är avstängd */
  }
}

/** `/sv/products/badrock` respektive `/en/products/badrock`. */
const PRODUCT_PATH = /^\/(?:sv|en)\/products\/([^/]+)\/?$/;

function send(path: string) {
  const product = PRODUCT_PATH.exec(path);
  const source = acquisition();
  const payload = {
    eventId: randomId(),
    visitorId: visitorId(),
    sessionId: sessionId(),
    path,
    locale: document.documentElement.lang === 'en' ? 'en' : 'sv',
    eventType: product ? 'product_view' : 'page_view',
    productHandle: product ? product[1] : '',
    referrer: source.referrer,
    utmSource: source.utmSource,
    utmMedium: source.utmMedium,
  };

  // `keepalive` så att besöket hinner iväg även om klicket som utlöste det
  // också navigerar bort från sidan.
  fetch('/api/analytics/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Statistik får aldrig märkas i butiken: ett tappat besök är ett tappat
    // besök, inget att visa besökaren och inget att försöka om.
  });
}

export default function VisitLogger() {
  const pathname = usePathname();
  // Vilken sökväg som redan räknats. App Router kör effekten på nytt vid varje
  // navigering, och i utvecklingsläge dessutom två gånger per montering.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const track = () => {
      if (!analyticsAllowed() || sent.current === pathname) return;
      sent.current = pathname;
      send(pathname);
    };

    track();

    // Den som tackar ja i rutan ska räknas för sidan de står på, inte först
    // vid nästa klick. Den som tackar nej ska sluta räknas direkt.
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.analytics) track();
      else {
        sent.current = null;
        forget();
      }
    };
    window.addEventListener('linnevik:consent', onConsent);
    return () => window.removeEventListener('linnevik:consent', onConsent);
  }, [pathname]);

  return null;
}
