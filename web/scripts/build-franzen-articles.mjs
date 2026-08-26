/**
 * Genererar src/data/franzenArticles.ts ur Franzéns artikelfil.
 *
 * Källa: catalog/external_suppliers/franzen/franzén_products_2026/163455-product-data.xlsx
 * — leverantörens egen export, mottagen 2026-08-26. Den är underlaget för
 * specifikationerna på produktsidorna: material, konstruktion, tvättråd,
 * certifiering, EAN och inköpspris.
 *
 * Kör detta skript när Franzén skickar en ny fil:
 *
 *   node scripts/build-franzen-articles.mjs
 *
 * xlsx läses här utan beroende. Filen är en zip med två delar vi bryr oss om:
 * xl/sharedStrings.xml (alla textvärden, celler pekar in i den med index) och
 * xl/worksheets/sheet1.xml (cellerna). Zip-posterna är deflate, som zlib kan
 * packa upp direkt — det är billigare än att dra in ett xlsx-bibliotek för en
 * fil vi läser en gång i halvåret.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const XLSX = resolve(
  here,
  '../../catalog/external_suppliers/franzen/franzén_products_2026/163455-product-data.xlsx'
);
const OUT = resolve(here, '../src/data/franzenArticles.ts');

/** Läser zip-posterna via den centrala katalogen i slutet av filen. */
function readZip(buf) {
  const eocd = (() => {
    for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) return i;
    throw new Error('xlsx: hittade inte zip-slutet');
  })();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const local = buf.readUInt32LE(p + 42);
    // Den lokala headern har egna längder för namn och extra — inte samma som
    // den centrala katalogens, och att återanvända dem läser fel offset.
    const localNameLen = buf.readUInt16LE(local + 26);
    const localExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** Texten i ett element och alla dess barn, med entiteterna avkodade. */
function textOf(xml) {
  return decodeEntities(xml.replace(/<[^>]*>/g, ''));
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const zip = readZip(readFileSync(XLSX));
const sharedStrings = [...zip.get('xl/sharedStrings.xml').toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
  m => textOf(m[1])
);

const sheet = zip.get('xl/worksheets/sheet1.xml').toString('utf8');
const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(rowMatch => {
  const cells = {};
  for (const cell of rowMatch[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const [, column, attrs, body] = cell;
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (value == null) {
      // Inline string — <is><t>…</t></is> i stället för en delad sträng.
      cells[column] = textOf(body);
    } else if (/t="s"/.test(attrs)) {
      cells[column] = sharedStrings[Number(value)] ?? '';
    } else {
      cells[column] = decodeEntities(value);
    }
  }
  return cells;
});

const header = rows[0];
const records = rows.slice(1).map(row =>
  Object.fromEntries(Object.entries(header).map(([column, name]) => [name, row[column] ?? '']))
);

/**
 * Priskolumnerna kommer i två format i samma fil: Grundpris och Rek utpris som
 * råa tal ("129.0"), customerPrice som svensk text ("85,00"). Båda ska bli tal.
 */
const price = value => {
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  return cleaned === '' ? null : Number(cleaned);
};

const articles = records
  .filter(r => r['Artikelkod'])
  .map(r => ({
    artikelkod: r['Artikelkod'],
    benämning: r['Benämning'],
    status: r['Status'],
    ean: r['EAN-kod'],
    varumärke: r['Varumärke'],
    serie: r['Serie'],
    material: r['Material info'],
    mått: r['Mått'],
    konstruktion: r['Konstruktion'],
    tvättråd: r['Tvättråd'],
    certifiering: r['Certifiering'],
    certifikatnummer: r['Certifikatnummer'],
    // Beskrivningskolumnerna är entity-kodade en gång till inne i själva
    // strängen ("gr&#246;n"), till skillnad från övriga fält. En andra
    // avkodning bara här, och inte generellt, så att ett ampersand i ett
    // materialnamn inte tolkas som början på en entitet.
    beskrivning: decodeEntities(r['E-handel beskrivning'] || r['Beskrivning']),
    färg: r['Färg'],
    produktionsland: r['Produktionsland Text'],
    antalPerFörp: price(r['Antal/förp']),
    viktKg: price(r['Vikt/st']),
    /** Franzéns listpris, SEK/st. */
    grundpris: price(r['Grundpris']),
    /** Franzéns rekommenderade utpris, SEK/st. */
    rekUtpris: price(r['Rek utpris']),
    /** Vad vi betalar, SEK/st. */
    inköpspris: price(r['customerPrice']),
  }))
  .sort((a, b) => a.artikelkod.localeCompare(b.artikelkod));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `// GENERERAD FIL — redigera inte för hand.
// Källa: catalog/external_suppliers/franzen/franzén_products_2026/163455-product-data.xlsx
// Kör: node scripts/build-franzen-articles.mjs

export type FranzenArticle = {
  artikelkod: string;
  benämning: string;
  status: string;
  ean: string;
  varumärke: string;
  serie: string;
  material: string;
  mått: string;
  konstruktion: string;
  tvättråd: string;
  certifiering: string;
  certifikatnummer: string;
  beskrivning: string;
  färg: string;
  produktionsland: string;
  antalPerFörp: number | null;
  viktKg: number | null;
  /** Franzéns listpris, SEK/st. */
  grundpris: number | null;
  /** Franzéns rekommenderade utpris, SEK/st. */
  rekUtpris: number | null;
  /** Vad vi betalar, SEK/st. */
  inköpspris: number | null;
};

export const articles: FranzenArticle[] = ${JSON.stringify(articles, null, 2)};

/**
 * Våra varianter som är belagda mot en Franzén-artikel. Bara raderna där
 * artikeln och varianten är samma produkt i samma storlek — se
 * catalog/external_suppliers/franzen/prouct_list.md för de varianter som
 * saknar motsvarighet hos Franzén och därför inte står här.
 */
export const skuToArtikelkod: Record<string, string> = {
  'LAK-150280': '2676101',
  'LAK-240280': '2676301',
  'PAS-150230': '2669101',
  'HAN-ENZ-VIT-5070': '2649301',
  'HAN-ENZ-GRA-5070': '2649343',
  'MOR-SKO-STD': '2660001',
  'MOR-SKO-LUV': '2660001',
  'MOR-VAF-VIT': '2662101',
};

export const articleByKod = new Map(articles.map(a => [a.artikelkod, a]));

export function articleForSku(sku: string): FranzenArticle | null {
  const kod = skuToArtikelkod[sku];
  return kod ? (articleByKod.get(kod) ?? null) : null;
}
`
);

console.log(`Skrev ${OUT} — ${articles.length} artiklar`);
