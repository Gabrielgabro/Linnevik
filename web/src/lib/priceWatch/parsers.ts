/**
 * Prisutläsare, en per butiksplattform.
 *
 * Alla returnerar `null` när priset inte gick att hitta. Det är avsiktligt:
 * ett tyst noll-värde skulle se ut som ett prisras och trigga larm. Uteblivna
 * träffar rapporteras som fel i stället, så att man ser när en sida har byggts
 * om i stället för att tro att konkurrenten sänkt priset.
 *
 * Varje parser läser en struktur som butiken själv använder — JSON-LD,
 * WooCommerce variantpayload, Tingstads analytics-attribut, Livvs Medusa-data.
 * De är alltså inte beroende av CSS-klasser eller layout.
 */

import type { Parser, WatchSpec } from '@/data/competitorPrices';

export type ParseResult = { priceSek: number } | { error: string };

const num = (raw: string): number | null => {
  // "1 390,50" / "1390.50" / "9,5" → 1390.5 / 9.5
  const cleaned = raw.replace(/\s| /g, '').replace(/,/g, '.');
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

/** Normaliserar för nyckeljämförelse: gemener, ihopdragna blanksteg, × → x. */
const norm = (s: string) => s.toLowerCase().replace(/[×]/g, 'x').replace(/\s+/g, ' ').trim();

/** WooCommerce/Yoast: @graph → Product.offers.price. Används av Hotex och Hygieniq. */
function jsonLdOffer(html: string): ParseResult {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes: unknown[] = [];
    const push = (v: unknown) => {
      if (Array.isArray(v)) nodes.push(...v);
      else if (v) nodes.push(v);
    };
    push(data);
    for (const n of [...nodes]) {
      if (n && typeof n === 'object' && '@graph' in n) push((n as { '@graph': unknown })['@graph']);
    }
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const offers = (node as { offers?: unknown }).offers;
      const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
      for (const offer of list) {
        if (!offer || typeof offer !== 'object') continue;
        const o = offer as { price?: unknown; lowPrice?: unknown; priceCurrency?: unknown };
        const currency = String(o.priceCurrency ?? 'SEK').toUpperCase();
        if (currency !== 'SEK') return { error: `oväntad valuta ${currency}` };
        const raw = o.price ?? o.lowPrice;
        if (raw == null) continue;
        const value = num(String(raw));
        if (value != null) return { priceSek: value };
      }
    }
  }
  return { error: 'inget Offer-pris i JSON-LD' };
}

/** WooCommerce: data-product_variations. Matchas på variantens SKU. Används av Mandales. */
function wooVariations(html: string, key: string | undefined): ParseResult {
  if (!key) return { error: 'watch.key (SKU) saknas' };
  const m = html.match(/data-product_variations="([^"]+)"/);
  if (!m) return { error: 'ingen variantpayload på sidan' };
  let variations: unknown;
  try {
    variations = JSON.parse(decode(m[1]));
  } catch {
    return { error: 'variantpayloaden gick inte att tolka' };
  }
  if (!Array.isArray(variations)) return { error: 'variantpayloaden är inte en lista' };
  for (const v of variations) {
    if (!v || typeof v !== 'object') continue;
    const row = v as { sku?: unknown; display_price?: unknown };
    if (String(row.sku ?? '') !== key) continue;
    const value = num(String(row.display_price ?? ''));
    return value != null ? { priceSek: value } : { error: `varianten ${key} saknar pris` };
  }
  return { error: `ingen variant med SKU ${key}` };
}

/**
 * Tingstad: data-analytics-price bredvid data-analytics-item_id.
 * Nyckeln är artikelnumret, så priset följer rätt variant även om sidan byggs om.
 */
function tingstadAnalytics(html: string, key: string | undefined): ParseResult {
  if (!key) return { error: 'watch.key (artikelnummer) saknas' };
  const re = new RegExp(
    `data-analytics-item_id="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"([\\s\\S]{0,1200}?)data-analytics-price="([^"]*)"`
  );
  const m = html.match(re);
  if (!m) return { error: `hittade inte artikel ${key}` };
  const value = num(m[2]);
  return value != null ? { priceSek: value } : { error: `otolkbart pris för ${key}: ${m[2]}` };
}

/**
 * Livv (Medusa): variantens title följt av calculated_amount i den inbäddade
 * payloaden. Vi matchar på varianttiteln, inte på kortets frånpris — kortet
 * visar den minsta storleken och har lurat oss förut.
 */
function livvVariant(html: string, key: string | undefined): ParseResult {
  if (!key) return { error: 'watch.key (varianttitel) saknas' };
  const flat = html.replace(/\\"/g, '"');
  const wanted = norm(key);
  const re = /"title":"([^"]{2,90})"[\s\S]{0,4000}?"calculated_amount":([0-9.]+)/g;
  const hits: number[] = [];
  for (const m of flat.matchAll(re)) {
    if (norm(decode(m[1])) !== wanted) continue;
    const value = num(m[2]);
    if (value != null) hits.push(value);
  }
  if (hits.length === 0) return { error: `ingen variant med titeln "${key}"` };
  // Flera träffar på samma titel: ta den lägsta, det är den vi larmar på.
  return { priceSek: Math.min(...hits) };
}

/**
 * Livv, kortvarianten. Vissa av Livvs produkter har varianttiteln "Default" i
 * payloaden — namnet finns bara i det renderade kortet. För dem matchar vi
 * kortets rubrik mot priset intill.
 *
 * OBS: kortpriset är ett *frånpris*. För produkter med flera storlekar avser
 * det den billigaste varianten. Använd 'livv-variant' när storleken spelar
 * roll; den här bara när varianttiteln saknas.
 */
function livvCard(html: string, key: string | undefined): ParseResult {
  if (!key) return { error: 'watch.key (kortrubrik) saknas' };
  const wanted = norm(key);
  const re = /([\d\s ]{2,9}),00\s*kr/g;
  for (const m of html.matchAll(re)) {
    const before = html.slice(Math.max(0, m.index - 1000), m.index);
    const names = [...before.matchAll(/>([A-ZÅÄÖ][^<>]{4,70}?)</g)].map(x => decode(x[1]).trim());
    const last = names.length ? names[names.length - 1] : '';
    if (norm(last) !== wanted) continue;
    const value = num(m[1]);
    if (value != null) return { priceSek: value };
  }
  return { error: `hittade inget kort med rubriken "${key}"` };
}

/** Bed & Bath: kortets produktnamn följt av class="price"> € N. */
function bedbathCard(html: string, key: string | undefined, fx: number | undefined): ParseResult {
  if (!key) return { error: 'watch.key (produktnamn) saknas' };
  if (!fx) return { error: 'watch.fx saknas — priset är i EUR' };
  const wanted = norm(key);
  const re = /class="price">\s*(?:€|&euro;)\s*([\d.,]+)/g;
  for (const m of html.matchAll(re)) {
    const before = html.slice(Math.max(0, m.index - 1600), m.index);
    const names = [...before.matchAll(/>([^<>{}]{6,90}?)</g)].map(x => decode(x[1]).trim());
    if (!names.some(n => norm(n) === wanted)) continue;
    const eur = num(m[1]);
    if (eur != null) return { priceSek: eur * fx };
  }
  return { error: `hittade inget pris för "${key}"` };
}

export function parsePrice(html: string, spec: WatchSpec): ParseResult {
  const table: Record<Parser, () => ParseResult> = {
    'jsonld-offer': () => jsonLdOffer(html),
    'woo-variations': () => wooVariations(html, spec.key),
    'tingstad-analytics': () => tingstadAnalytics(html, spec.key),
    'livv-variant': () => livvVariant(html, spec.key),
    'livv-card': () => livvCard(html, spec.key),
    'bedbath-card': () => bedbathCard(html, spec.key, spec.fx),
  };
  return table[spec.parser]();
}
