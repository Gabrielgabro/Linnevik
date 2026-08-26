// Konkurrentpriser på Franzén-sortimentet — handunderhållen fil. Inte genererad.
//
// Insamlad 2026-08-26, verifierad mot leverantörernas råa sidkällor: Tingstads
// data-analytics-attribut plus det utskrivna styckpriset på kortet, Livvs
// Medusa-payload (calculated_amount per variant), och JSON-LD Product/offers
// hos Sovtex, Bygghemma och Spis & Servis. Alla belopp i SEK per styck.
//
// Skillnaden mot competitorPrices.ts: den filen jämför våra *egna* produkter
// från Kina-sändningen mot marknaden. Den här jämför de produkter vi köper av
// Franzén — där konkurrenten ofta säljer *exakt samma artikel*. Fyra av
// raderna nedan är samma artikelnummer som vårt eget inköp (Nevada 50×70,
// satinrandspåslakanet 150×230, hotellmorgonrocken och våffelrocken), och det
// är den viktigaste informationen i filen: där konkurrerar vi inte med en
// likvärdig produkt, utan med samma vara.
//
// Momsbasen står per rad i `basis`, samma betydelse som i competitorPrices.ts:
//   'ex'  — leverantören anger uttryckligen exkl. moms. Gäller Tingstad
//           (skriver ut "exklusive moms" vid varje pris) och Livv (deras
//           storefront skickar is_calculated_price_tax_inclusive: false).
//   'b2c' — konsumentpris inkl. moms hos handlaren, här delat med 1,25.
//           Gäller Sovtex och Bygghemma, som båda säljer till slutkund.
//
// OM DE FEM LEVERANTÖRERNA
//
//   Livv          — B2B, hotellgrossist. Närmaste konkurrenten i kanal: samma
//                   kunder, samma sortimentslogik, priser exkl. moms.
//   Tingstad      — B2B, storköks- och hotellgrossist. Bredare men dyrare;
//                   samma referens som i vår egen prisanalys.
//   Sovtex        — B2C, webbhandel. Säljer Textilgruppens och Borganäs egna
//                   artiklar — alltså Franzéns varumärken — direkt till
//                   slutkund. Det är den rad som gör mest ont: en hotellägare
//                   kan köpa vår exakta artikel utan att gå via oss.
//   Bygghemma     — B2C, webbhandel. För Borganäs of Sweden som eget
//                   varumärke. Kortpriserna är frånpriser över färg/storlek,
//                   vilket står i `caveat` på de rader det gäller.
//   Spis & Servis — B2B, restauranggrossist. Står med i underlaget men har
//                   INGA rader nedan, och det är ett resultat, inte en lucka:
//                   deras textilsortiment slutar vid kökshanddukar och
//                   servetter (Gaby 50×70 för 29 kr, John, Billy — Fritz
//                   Magnus-artiklar ur samma katalog som vår). Bädd- och
//                   badtextil säljer de inte alls. Se `SPIS_SERVIS_NOTE`.
//
// `watch` sätts bara på källor vars parser läser ut priset på samma momsbas
// som `priceSek` anger — Tingstad och Livv. Sovtex och Bygghemma anger sitt
// JSON-LD-pris inklusive moms, och prisboten har ingen momsdelning, så de
// raderna kontrolleras för hand. Se /api/cron/price-watch.

import type { Basis, Channel, WatchSpec } from './competitorPrices';

export const franzenCollectedAt = '2026-08-26';

/**
 * Varför Spis & Servis inte har några rader. Visas i vyn — annars ser det ut
 * som att researchen är ofärdig.
 */
export const SPIS_SERVIS_NOTE =
  'Spis & Servis kontrollerades men har inga jämförbara artiklar: deras textil ' +
  'är kökshanddukar och servetter (Gaby, John, Billy — samma Fritz Magnus-katalog ' +
  'som Franzéns), inte bädd- och badtextil. De konkurrerar alltså inte med något ' +
  'vi säljer i dag.';

export type FranzenCompetitor = {
  vendor: string;
  product: string;
  /** Kort specifikation som gör jämförelsen granskningsbar. */
  spec: string;
  size: string;
  /** SEK per styck, på den bas som `basis` anger. */
  priceSek: number;
  channel: Channel;
  basis: Basis;
  url: string;
  /** 'approx' när storlek, färg eller kvalitet inte är exakt vår. */
  match: 'exact' | 'approx';
  /** Den rad vi mäter oss mot — indexet i vyn räknas mot den. */
  primary?: boolean;
  /**
   * Sant när leverantören säljer samma artikelnummer som vi köper av Franzén.
   * Ritas ut särskilt: det är inte en jämförbar produkt, det är vår produkt.
   */
  sameArticle?: boolean;
  caveat?: string;
  watch?: WatchSpec;
};

const b2c = (inclVat: number) => Math.round((inclVat / 1.25) * 100) / 100;

const LIVV_LAKAN = 'https://livv.se/se/textilier/lakan-orngott';
const LIVV_HANDDUKAR = 'https://livv.se/se/textilier/handdukar';
const LIVV_ROCKAR = 'https://livv.se/se/textilier/morgon-sparockar';
const LIVV_TOFFLOR = 'https://livv.se/se/textilier/tofflor';
const LIVV_PASLAKAN = 'https://livv.se/se/products/paslakan-satinrand-vit-150x230cm';
const TING_BADD = 'https://www.tingstad.com/se-sv/mobler-inredning/textilier/baddtextilier';
const TING_SANG = 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/sangklader';
const TING_HANDDUK = 'https://www.tingstad.com/se-sv/mobler-inredning/textilier/handdukar';
const TING_BADROCK = 'https://www.tingstad.com/se-sv/mobler-inredning/textilier/badrockar';
const SOVTEX_HR = 'https://sovtex.se/hotell-restaurang';

/**
 * Frottéhanddukarna 50×70 delar marknadsfält oavsett färg: Sovtex och
 * Bygghemma prissätter Nevada respektive Basic lika i alla färger, och Livvs
 * och Tingstads rader är vita.
 *
 * Det som INTE delas är `sameArticle`. Sovtex för Nevada i vitt, och bara i
 * vitt — vår grå, beige, bruna och gröna handduk är inte samma artikel som
 * någon annan säljer, även om priset är jämförbart. Se TOWEL_5070_VIT nedan.
 */
const TOWEL_5070: FranzenCompetitor[] = [
  {
    vendor: 'Sovtex',
    product: 'Nevada Frottéhandduk Vit 50x70 FP48',
    spec: '450 g/m², 100 % bomull — Textilgruppens artikel 2649301',
    size: '50 × 70',
    priceSek: b2c(31),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/nevada-frottehandduk-vit-50x70-cm-fp48',
    match: 'approx',
    primary: true,
    caveat: 'Samma modell och mått, men Sovtex för bara vitt — vår färg finns inte hos dem.',
  },
  {
    vendor: 'Bygghemma',
    product: 'Frotté Borganäs of Sweden Basic 50x70 cm',
    spec: '100 % bomull, vävda bårder',
    size: '50 × 70',
    priceSek: b2c(31),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/badrumstextilier/handdukar/frotte-borganas-of-sweden-basic-50x70-cm/p-847204',
    match: 'approx',
    caveat: 'Borganäs Basic, inte Nevada. Frånpris över färgerna.',
  },
  {
    vendor: 'Livv',
    product: 'Frotté vit 50x70 cm, 400 g/m² Sierra',
    spec: '400 g/m², 100 % bomull',
    size: '50 × 70',
    priceSek: 39,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_HANDDUKAR,
    match: 'approx',
    caveat: '400 g mot vår 450 g — tunnare kvalitet, men samma kanal och kundgrupp.',
    watch: { fetchUrl: LIVV_HANDDUKAR, parser: 'livv-variant', key: 'Frotté, vit, 50x70 cm, 400g/m2 Sierra' },
  },
  {
    vendor: 'Livv',
    product: 'Superior Handduk Korfu 550 g, frotté vit 50x70',
    spec: '550 g/m², 100 % bomull',
    size: '50 × 70',
    priceSek: 39,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_HANDDUKAR,
    match: 'approx',
    caveat: '550 g — tyngre än vår 450 g, till samma pris som deras 400-grams.',
    watch: { fetchUrl: LIVV_HANDDUKAR, parser: 'livv-variant', key: 'Superior Handduk Korfu 550g, frotté vit 50x70cm' },
  },
  {
    vendor: 'Tingstad',
    product: 'Frottéhandduk Lord Nelson Fairtrade 550 g',
    spec: '550 g/m², Fairtrade-märkt',
    size: '50 × 70',
    priceSek: 99,
    channel: 'b2b',
    basis: 'ex',
    url: TING_HANDDUK,
    match: 'approx',
    caveat: 'Fairtrade och 550 g — en annan produktklass, tas med som marknadens tak.',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'DJ41000418' },
  },
  {
    vendor: 'Tingstad',
    product: 'Frottéhandduk Kosta Linnewäfveri 600 g',
    spec: '600 g/m², svenskt varumärke',
    size: '50 × 70',
    priceSek: 145,
    channel: 'b2b',
    basis: 'ex',
    url: TING_HANDDUK,
    match: 'approx',
    caveat: 'Varumärkesprodukt i 600 g — inte en hotellhandduk, med som övre referens.',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'DJ41093418' },
  },
];

/** Vitt är den enda färgen där Sovtex säljer exakt vår artikel. */
const TOWEL_5070_VIT: FranzenCompetitor[] = TOWEL_5070.map(row =>
  row.vendor === 'Sovtex'
    ? {
        ...row,
        match: 'exact' as const,
        sameArticle: true,
        caveat:
          'Exakt vår artikel. Sovtex säljer den till slutkund för mindre än vi tar exkl. moms, ' +
          'i storpack om 48.',
      }
    : row
);

/** Badlakan 90×150. Bygghemmas Enzo är samma serie som vår, i samma mått. */
const TOWEL_90150: FranzenCompetitor[] = [
  {
    vendor: 'Bygghemma',
    product: 'Frotté Borganäs of Sweden Enzo 90x150 cm',
    spec: '100 % bomull, kontrastbård, hängare på kortsidorna',
    size: '90 × 150',
    priceSek: b2c(142),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/badlakan/frotte-borganas-of-sweden-enzo-90x150-cm/p-1799027',
    match: 'exact',
    primary: true,
    caveat: 'Samma Enzo-serie som vår handduk, i exakt vårt mått. Frånpris över färgerna.',
  },
  {
    vendor: 'Sovtex',
    product: 'Nevada Frottéhandduk Vit 100x150 FP12',
    spec: '450 g/m² — Textilgruppens artikel 2649501',
    size: '100 × 150',
    priceSek: b2c(111),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/nevada-frottehandduk-vit-100x150-cm-fp12',
    match: 'approx',
    caveat: '10 cm bredare än vår. Franzéns egen artikel — vi har bara inte den storleken.',
  },
  {
    vendor: 'Livv',
    product: 'Superior badlakan Korfu 550 g, frotté vit 100x150',
    spec: '550 g/m², 100 % bomull',
    size: '100 × 150',
    priceSek: 169,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_HANDDUKAR,
    match: 'approx',
    caveat: '10 cm bredare och 100 g tyngre.',
    watch: { fetchUrl: LIVV_HANDDUKAR, parser: 'livv-variant', key: 'Superior badlakan Korfu 550g, frotté vit 100x150cm' },
  },
  {
    vendor: 'Tingstad',
    product: 'Frottéhandduk Kosta Linnewäfveri 500 g',
    spec: '500 g/m², svenskt varumärke',
    size: '90 × 150',
    priceSek: 449,
    channel: 'b2b',
    basis: 'ex',
    url: TING_HANDDUK,
    match: 'approx',
    caveat: 'Varumärkesbadlakan — fyra gånger vårt pris, med som marknadens tak.',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'DJ41005970' },
  },
];

/** Morgonrockarna delar fält över färgerna — ingen leverantör tar färgtillägg. */
const ROBE_FROTTE: FranzenCompetitor[] = [
  {
    vendor: 'Sovtex',
    product: 'Hotell Morgonrock Vit',
    spec: '100 % bomullsfrotté, sjalkrage, två fickor, onesize — Textilgruppens artikel 2660001',
    size: 'One size',
    priceSek: b2c(311),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/hotell-morgonrock-vit',
    match: 'exact',
    primary: true,
    sameArticle: true,
    caveat:
      'Exakt vår artikel, samma beskrivning ord för ord. Sovtex tar 311 kr inkl. moms av ' +
      'slutkund — vi tar 420 kr exkl.',
  },
  {
    vendor: 'Livv',
    product: 'Frottérock One size',
    spec: 'Frotté, onesize, beige eller grå',
    size: 'One size',
    priceSek: 399,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_ROCKAR,
    match: 'approx',
    caveat: 'Livv för inte vit i den här modellen — beige/grå, i övrigt samma produktklass.',
    watch: { fetchUrl: LIVV_ROCKAR, parser: 'livv-variant', key: 'Frottérock Beige One size' },
  },
  {
    vendor: 'Livv',
    product: 'Elegance Morgonrock',
    spec: 'Frotté, onesize',
    size: 'One size',
    priceSek: 399,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_ROCKAR,
    match: 'approx',
    watch: { fetchUrl: LIVV_ROCKAR, parser: 'livv-variant', key: 'Elegance Morgonrock' },
  },
  {
    vendor: 'Tingstad',
    product: 'Badrock Grand Luxe Vit 420 g',
    spec: '420 g/m², vit',
    size: 'One size',
    priceSek: 450,
    channel: 'b2b',
    basis: 'ex',
    url: TING_BADROCK,
    match: 'approx',
    caveat: '420 g mot vår 360 g — tyngre rock, 30 kr dyrare än vårt pris.',
    watch: { fetchUrl: TING_BADROCK, parser: 'tingstad-analytics', key: 'BB25595095NAN0001' },
  },
  {
    vendor: 'Tingstad',
    product: 'Badrock Selected EKO Vit',
    spec: 'Ekologisk bomull, onesize',
    size: 'One size',
    priceSek: 465,
    channel: 'b2b',
    basis: 'ex',
    url: TING_BADROCK,
    match: 'approx',
    watch: { fetchUrl: TING_BADROCK, parser: 'tingstad-analytics', key: 'BB63' },
  },
  {
    vendor: 'Tingstad',
    product: 'Badrock GAP Fritz Magnus Vit',
    spec: 'Fritz Magnus, vit',
    size: 'One size',
    priceSek: 507,
    channel: 'b2b',
    basis: 'ex',
    url: TING_BADROCK,
    match: 'approx',
    caveat: 'Fritz Magnus är ett av Franzéns egna varumärken — men en dyrare modell än vår.',
    watch: { fetchUrl: TING_BADROCK, parser: 'tingstad-analytics', key: 'FM85790050' },
  },
  {
    vendor: 'Bygghemma',
    product: 'Badrock Svanefors Carlton',
    spec: 'Velour ute, frotté inne, sjalkrage, piping',
    size: 'One size',
    priceSek: b2c(1079),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/badrumstextilier/morgonrock-och-badrock/badrock-svanefors-carlton/p-1916908',
    match: 'approx',
    caveat:
      'Premium konsumentrock i velour — den rock den gamla Skönrock-texten beskrev, ' +
      'och prisläget den skulle ha krävt. Med som tak, inte som jämförelse.',
  },
];

const ROBE_VAFFEL: FranzenCompetitor[] = [
  {
    vendor: 'Sovtex',
    product: 'Våffla Morgonrock Vit',
    spec: 'Våffeltextur, sjalkrage, två fickor, onesize — Textilgruppens artikel 2662101',
    size: 'One size',
    priceSek: b2c(303),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/vaffla-morgonrock-vit',
    match: 'approx',
    primary: true,
    caveat: 'Samma modell, men Sovtex för bara vitt — Franzén har heller ingen annan färg.',
  },
  {
    vendor: 'Sovtex',
    product: 'Hotell Morgonrock Våfflad Vit (Fritz Magnus)',
    spec: 'Våffelkvalitet med satinpasspoal, onesize',
    size: 'One size',
    priceSek: b2c(679),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/hotell-morgonrock-vafflad-vit',
    match: 'approx',
    caveat: 'Fritz Magnus dyrare våffelrock — samma butik, dubbla priset. Visar spannet.',
  },
  {
    vendor: 'Livv',
    product: 'Frotté/Velour Rock One Size',
    spec: 'Frotté/velour, onesize',
    size: 'One size',
    priceSek: 489,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_ROCKAR,
    match: 'approx',
    caveat: 'Livv för ingen våffelrock — det här är deras närmaste rock i prisklassen ovanför.',
    watch: { fetchUrl: LIVV_ROCKAR, parser: 'livv-variant', key: 'Frotté/Velour Rock One Size' },
  },
  {
    vendor: 'Tingstad',
    product: 'Badrock Fritz Magnus Gossip Vit',
    spec: 'Fritz Magnus, vit',
    size: 'One size',
    priceSek: 476,
    channel: 'b2b',
    basis: 'ex',
    url: TING_BADROCK,
    match: 'approx',
    watch: { fetchUrl: TING_BADROCK, parser: 'tingstad-analytics', key: 'FM8579008' },
  },
];

/**
 * Vit våffelrock är den enda av de fyra färgerna som alls finns hos Franzén —
 * de andra tre är obelagda (se prouct_list.md) och därför inte heller någon
 * annans artikel.
 */
const ROBE_VAFFEL_VIT: FranzenCompetitor[] = ROBE_VAFFEL.map(row =>
  row.product === 'Våffla Morgonrock Vit'
    ? {
        ...row,
        match: 'exact' as const,
        sameArticle: true,
        caveat: 'Exakt vår artikel, till slutkund inkl. moms för under vad vi tar exkl.',
      }
    : row
);

const PILLOWCASE_WIDE: FranzenCompetitor[] = [
  {
    vendor: 'Livv',
    product: 'Örngott naturvit/vit rand 55x75',
    spec: 'Bomull/polyester, randvävd',
    size: '55 × 75',
    priceSek: 29,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_LAKAN,
    match: 'approx',
    primary: true,
    caveat: '55 × 75 — marknadens hotellstorlek. Vår 50 × 70 finns inte hos någon av de fem.',
    watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Örngott naturvit/vit rand 55x75' },
  },
  {
    vendor: 'Sovtex',
    product: 'Satinrand Örngott Vit 55x75',
    spec: '230 TC satinrand — Textilgruppens artikel 2669301',
    size: '55 × 75',
    priceSek: b2c(39),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/paslakan/satinrand-orngott-vit-55x75',
    match: 'approx',
    caveat:
      'Franzéns eget örngott i 55 × 75 — den artikel vi skulle behöva ta in för att alls ' +
      'kunna belägga örngottet. Se prouct_list.md.',
  },
  {
    vendor: 'Bygghemma',
    product: 'Örngott Borganäs of Sweden',
    spec: 'Bomull, kuvertöppning',
    size: 'flera',
    priceSek: b2c(59),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/sangklader/orngott/orngott-borganas-of-sweden/p-1914175',
    match: 'approx',
    caveat: 'Frånpris över storlekar och färger.',
  },
];

/**
 * Marknadens rader per vår variant-SKU. Samma nyckel som `product_variants.sku`
 * i databasen. En SKU som saknas här har ingen ärlig motsvarighet hos någon av
 * de fem — se kommentarerna i slutet av filen.
 */
export const franzenVariantCompetitors: Record<string, FranzenCompetitor[]> = {
  'LAK-150280': [
    {
      vendor: 'Livv',
      product: 'Lakan 150x280, grön märktråd',
      spec: 'Hotellakan, bomull/polyester',
      size: '150 × 280',
      priceSek: 125,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_LAKAN,
      match: 'exact',
      primary: true,
      caveat: 'Exakt vårt mått, samma kanal. 5 kr över vårt pris.',
      watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Lakan 150x280, grön märktråd' },
    },
    {
      vendor: 'Sovtex',
      product: 'Hotellakan Bomull/Polyester Vit 150x275 FP8',
      spec: 'Bomull/polyester — Textilgruppens artikel',
      size: '150 × 275',
      priceSek: b2c(95),
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://sovtex.se/hotell-restaurang/hotellakan-bomull/polyester-vit-150x275-storpack-fp8',
      match: 'approx',
      caveat: '5 cm kortare. Franzéns eget lakanssortiment, sålt till slutkund i 8-pack.',
    },
    {
      vendor: 'Tingstad',
      product: 'Lakan Fritz Magnus Glory Vit 150x270cm',
      spec: 'Fritz Magnus, vit',
      size: '150 × 270',
      priceSek: 71,
      channel: 'b2b',
      basis: 'ex',
      url: TING_BADD,
      match: 'approx',
      caveat: '10 cm kortare — och 49 kr under vårt pris, i samma B2B-kanal.',
      watch: { fetchUrl: TING_BADD, parser: 'tingstad-analytics', key: 'FM8557001' },
    },
    {
      vendor: 'Bygghemma',
      product: 'Underlakan Borganäs of Sweden',
      spec: 'Bomull',
      size: 'flera',
      priceSek: b2c(103),
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/sangklader/lakan-och-underlakan/underlakan-borganas-of-sweden/p-1799120',
      match: 'approx',
      caveat: 'Frånpris över storlekar.',
    },
  ],

  'LAK-240280': [
    {
      vendor: 'Livv',
      product: 'Lakan 240x280',
      spec: 'Hotellakan, bomull/polyester',
      size: '240 × 280',
      priceSek: 150,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_LAKAN,
      match: 'exact',
      primary: true,
      caveat: 'Exakt vårt mått. Vi ligger 55 kr över — 37 % dyrare i samma kanal.',
      watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Lakan 240x280' },
    },
    {
      vendor: 'Sovtex',
      product: 'Hotellakan Bomull/Polyester Vit 240x275 FP5',
      spec: 'Bomull/polyester — Textilgruppens artikel',
      size: '240 × 275',
      priceSek: b2c(143),
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://sovtex.se/hotell-restaurang/hotellakan-bomull/polyester-vit-240x275-storpack-fp5',
      match: 'approx',
      caveat: '5 cm kortare, sålt till slutkund i 5-pack.',
    },
  ],

  'PAS-150230': [
    {
      vendor: 'Livv',
      product: 'Påslakan satinrand vit 150x230cm',
      spec: 'Satinrand, bomull/polyester',
      size: '150 × 230',
      priceSek: 289,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_PASLAKAN,
      match: 'exact',
      primary: true,
      caveat:
        'Samma produkt, samma mått, samma kanal — och 289 mot våra 290 kr. Den enda rad i ' +
        'hela underlaget där vi redan står exakt rätt.',
      watch: { fetchUrl: LIVV_PASLAKAN, parser: 'livv-card', key: 'Påslakan satinrand vit 150x230cm' },
    },
    {
      vendor: 'Sovtex',
      product: 'Satinrand Påslakan Vit 150x230',
      spec: 'Satinrand 22 mm — Textilgruppens artikel 2669101',
      size: '150 × 230',
      priceSek: b2c(255),
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://sovtex.se/paslakan/satinrand-paslakan-vit-150x230',
      match: 'exact',
      sameArticle: true,
      caveat: 'Exakt vår artikel, styckvis till slutkund.',
    },
    {
      vendor: 'Sovtex',
      product: 'Hotellpåslakan Satinrand Bred Vit FP5',
      spec: 'Samma artikel i 5-pack',
      size: '150 × 230',
      priceSek: b2c(223),
      channel: 'b2c',
      basis: 'b2c',
      url: `${SOVTEX_HR}/hotellpaslakan-satinrand-bred-vit-storpack-fp5`,
      match: 'exact',
      sameArticle: true,
      caveat: 'Storpackspriset — vad en hotellägare faktiskt betalar utan att gå via oss.',
    },
    {
      vendor: 'Tingstad',
      product: 'Påslakan Bed & Bath Grand Luxe Vit',
      spec: 'Grand Luxe, vit',
      size: '150 × 220',
      priceSek: 185,
      channel: 'b2b',
      basis: 'ex',
      url: TING_SANG,
      match: 'approx',
      caveat: '10 cm kortare. Marknadens golv i B2B-kanalen.',
      watch: { fetchUrl: TING_SANG, parser: 'tingstad-analytics', key: 'BB012' },
    },
  ],

  'ORN-5060': [
    {
      vendor: 'Livv',
      product: 'Örngott 50X60cm helvit',
      spec: 'Helvit bomull/polyester',
      size: '50 × 60',
      priceSek: 59,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_LAKAN,
      match: 'exact',
      primary: true,
      watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Örngott 50X60cm helvit' },
    },
    {
      vendor: 'Livv',
      product: 'Örngott satinrand 28 mm, vinge 50X60cm',
      spec: 'Satinrand 28 mm, vinge',
      size: '50 × 60',
      priceSek: 89,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_LAKAN,
      match: 'exact',
      caveat: 'Vingmodell med satinrand — den dyrare halvan av marknaden i vårt mått.',
      watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Örngott satinrand 28mm, vinge 50X60cm' },
    },
    {
      vendor: 'Tingstad',
      product: 'Örngott Mirage Satin 50x60cm',
      spec: 'Satin, Redlunds',
      size: '50 × 60',
      priceSek: 65,
      channel: 'b2b',
      basis: 'ex',
      url: TING_SANG,
      match: 'exact',
      watch: { fetchUrl: TING_SANG, parser: 'tingstad-analytics', key: '220RE' },
    },
    {
      vendor: 'Sovtex',
      product: 'Satinrand Påslakan Vinge 50x60',
      spec: 'Satinrand med vinge — Textilgruppens artikel',
      size: '50 × 60',
      priceSek: b2c(79),
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://sovtex.se/paslakan/satinrand-paslakan-vinge-50x60',
      match: 'exact',
    },
    ...PILLOWCASE_WIDE.filter(c => c.vendor === 'Bygghemma'),
  ],

  'ORN-5070': PILLOWCASE_WIDE,

  'ORN-6080': [
    {
      vendor: 'Livv',
      product: 'Örngott 50x90, Helvit',
      spec: 'Helvit bomull/polyester',
      size: '50 × 90',
      priceSek: 99,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_LAKAN,
      match: 'approx',
      primary: true,
      caveat: 'Ingen av de fem för 60 × 80. 50 × 90 är närmaste yta — smalare och längre.',
      watch: { fetchUrl: LIVV_LAKAN, parser: 'livv-variant', key: 'Örngott 50x90, Helvit' },
    },
    {
      vendor: 'Tingstad',
      product: 'Örngott Elton 50x90cm',
      spec: 'Elton, mörkgrå',
      size: '50 × 90',
      priceSek: 109,
      channel: 'b2b',
      basis: 'ex',
      url: TING_SANG,
      match: 'approx',
      caveat: 'Samma storleksavvikelse som Livvs rad ovanför.',
      watch: { fetchUrl: TING_SANG, parser: 'tingstad-analytics', key: '238RE' },
    },
  ],

  'HAN-ENZ-VIT-5070': TOWEL_5070_VIT,
  'HAN-ENZ-GRA-5070': TOWEL_5070,
  'HAN-ENZ-BEI-5070': TOWEL_5070,
  'HAN-ENZ-BRU-5070': TOWEL_5070,
  'HAN-ENZ-GRO-5070': TOWEL_5070,

  'HAN-ENZ-VIT-90150': TOWEL_90150,
  'HAN-ENZ-GRA-90150': TOWEL_90150,
  'HAN-ENZ-BEI-90150': TOWEL_90150,
  'HAN-ENZ-BRU-90150': TOWEL_90150,
  'HAN-ENZ-GRO-90150': TOWEL_90150,

  'MOR-SKO-STD': ROBE_FROTTE,
  'MOR-SKO-LUV': ROBE_FROTTE,

  'MOR-VAF-VIT': ROBE_VAFFEL_VIT,
  'MOR-VAF-BEI': ROBE_VAFFEL,
  'MOR-VAF-BRU': ROBE_VAFFEL,
  'MOR-VAF-GRA': ROBE_VAFFEL,

  'TOF-STD': [
    {
      vendor: 'Livv',
      product: 'Comfort frottétoffla vit, öppen tå, 3 mm sula',
      spec: 'Frotté, öppen tå, 3 mm sula',
      size: 'One size',
      priceSek: 8.95,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_TOFFLOR,
      match: 'exact',
      primary: true,
      caveat: 'Marknadens instegstoffla, under vårt pris redan innan moms.',
      watch: { fetchUrl: LIVV_TOFFLOR, parser: 'livv-variant', key: 'Comfort frotté toffla vit, öppen tå, 3mm sula' },
    },
    {
      vendor: 'Livv',
      product: 'Superior Comfort frottétoffla, öppen tå',
      spec: 'Frotté, öppen tå',
      size: 'One size',
      priceSek: 9.95,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_TOFFLOR,
      match: 'exact',
      watch: { fetchUrl: LIVV_TOFFLOR, parser: 'livv-variant', key: 'Superior Comfort, Frottétoffla med öppen tå' },
    },
    {
      vendor: 'Livv',
      product: 'Velour comfort toffla vit, öppen tå, 5 mm sula',
      spec: 'Velour, 5 mm sula, 29 cm',
      size: '29 cm',
      priceSek: 14.95,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_TOFFLOR,
      match: 'approx',
      caveat: 'Tjockare sula och velour — vad ett steg upp i kvalitet kostar.',
    },
    {
      vendor: 'Livv',
      product: 'Balnea Spatofflor',
      spec: 'Spatoffla, flera storlekar',
      size: 'S–XL',
      priceSek: 39,
      channel: 'b2b',
      basis: 'ex',
      url: LIVV_TOFFLOR,
      match: 'approx',
      caveat: 'Spatoffla i en annan klass — marknadens tak, fyra gånger instegspriset.',
    },
  ],

  // Medvetet tomma, inte oavslutade:
  //
  // PAS-220230 (påslakan 220 × 230) — Tingstad för Grand Luxe upp till
  //   200 × 230 men publicerar inget styckpris per storlek utan att man öppnar
  //   varianten i deras eget gränssnitt, och varken Livv, Sovtex eller
  //   Bygghemma för måttet. Franzén har det inte heller (se prouct_list.md),
  //   så varianten är obelagd i båda ändar — den ska prissättas mot sin syster
  //   150 × 230, inte mot en gissad marknad.
  //
  // TVA-HAV / TVA-MOR / TVA-SKO (handtvål) — ingen av de fem säljer handtvål,
  //   och produkten har ingen Franzén-artikel alls. Den hör inte hemma i den
  //   här jämförelsen förrän den har en leverantör.
};

/** Alla leverantörer som förekommer, i den ordning vyn presenterar dem. */
export const FRANZEN_VENDORS = ['Livv', 'Tingstad', 'Sovtex', 'Bygghemma', 'Spis & Servis'] as const;
