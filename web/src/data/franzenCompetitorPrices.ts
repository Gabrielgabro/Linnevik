// Konkurrentpriser på Franzén-sortimentet — handunderhållen fil. Inte genererad.
//
// Insamlad 2026-08-26, verifierad mot leverantörernas råa sidkällor: Tingstads
// data-analytics-attribut plus det utskrivna styckpriset på kortet, Livvs
// Medusa-payload (calculated_amount per variant), och JSON-LD Product/offers
// hos Sovtex, Bygghemma och Spis & Servis. Alla belopp i SEK per styck.
//
// Skillnaden mot competitorPrices.ts: den filen jämför våra *egna* produkter
// från Kina-sändningen mot marknaden. Den här jämför de produkter vi köper av
// Franzén — där konkurrenten ofta säljer *exakt samma artikel*. Åtta av
// raderna nedan bär samma artikelnummer som vårt eget inköp (Nevada i alla
// tre storlekarna, satinrandspåslakanet 150×230 i två förpackningar,
// satinrandsörngottet 55×75, hotellmorgonrocken och våffelrocken), och det
// är den viktigaste informationen i filen: där konkurrerar vi inte med en
// likvärdig produkt, utan med samma vara. Samtliga är Sovtex, som säljer
// Textilgruppens och Borganäs artiklar direkt till slutkund.
//
// `sameArticle` sätts bara på den färg och storlek leverantören faktiskt för.
// Sovtex säljer Nevada i vitt, inte i mörkgrått, så gråvarianterna får samma
// prisrad men utan flaggan — se TOWEL_5070 mot TOWEL_5070_VIT.
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

/**
 * Mellanhandduken 70 × 140. Sovtex säljer exakt vår artikel (2649401) — se
 * TOWEL_70140_VIT för den raden; här är den nedtonad till "samma modell", för
 * Sovtex för Nevada bara i vitt.
 */
const TOWEL_70140: FranzenCompetitor[] = [
  {
    vendor: 'Sovtex',
    product: 'Nevada Frottéhandduk Vit 70x140 FP16',
    spec: '450 g/m², 100 % bomull — Textilgruppens artikel 2649401',
    size: '70 × 140',
    priceSek: b2c(79),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/nevada-frottehandduk-vit-70x140-cm-fp16',
    match: 'approx',
    primary: true,
    caveat: 'Samma modell och mått, men Sovtex för bara vitt — vår färg finns inte hos dem.',
  },
  {
    vendor: 'Bygghemma',
    product: 'Frotté Borganäs of Sweden Basic 65x130 cm',
    spec: '100 % bomull, vävda bårder',
    size: '65 × 130',
    priceSek: b2c(69),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/badrumstextilier/handdukar/frotte-borganas-of-sweden-basic-65x130-cm/p-847215',
    match: 'approx',
    caveat: 'Borganäs Basic i 65 × 130 — en aning mindre. Frånpris över färgerna.',
  },
  {
    vendor: 'Livv',
    product: 'Frotté vit 70x140 cm, 400 g/m² Sierra',
    spec: '400 g/m², 100 % bomull',
    size: '70 × 140',
    priceSek: 99,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_HANDDUKAR,
    match: 'approx',
    caveat: '400 g mot vår 450 g — tunnare kvalitet, samma kanal.',
    watch: { fetchUrl: LIVV_HANDDUKAR, parser: 'livv-variant', key: 'Frotté, vit, 70x140 cm, 400g/m2 Sierra' },
  },
  {
    vendor: 'Livv',
    product: 'Superior Handduk Korfu 550 g, frotté vit 70x140',
    spec: '550 g/m², 100 % bomull',
    size: '70 × 140',
    priceSek: 119,
    channel: 'b2b',
    basis: 'ex',
    url: LIVV_HANDDUKAR,
    match: 'approx',
    caveat: '100 g tyngre än vår.',
    watch: { fetchUrl: LIVV_HANDDUKAR, parser: 'livv-variant', key: 'Superior handduk Korfu 550g, frotté vit 70x140cm' },
  },
  {
    vendor: 'Tingstad',
    product: 'Badlakan Classic 70x140cm Vit',
    spec: 'Vit, one size',
    size: '70 × 140',
    priceSek: 203,
    channel: 'b2b',
    basis: 'ex',
    url: TING_HANDDUK,
    match: 'exact',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'ZD143' },
  },
  {
    vendor: 'Tingstad',
    product: 'Frottéhandduk Lord Nelson Fairtrade 550 g',
    spec: '550 g/m², Fairtrade-märkt',
    size: '70 × 130',
    priceSek: 219,
    channel: 'b2b',
    basis: 'ex',
    url: TING_HANDDUK,
    match: 'approx',
    caveat: '10 cm kortare, Fairtrade och 550 g — marknadens tak.',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'DJ41000426' },
  },
];

/** Vitt är den enda färgen där Sovtex säljer exakt vår artikel. */
const TOWEL_70140_VIT: FranzenCompetitor[] = TOWEL_70140.map(row =>
  row.vendor === 'Sovtex'
    ? {
        ...row,
        match: 'exact' as const,
        sameArticle: true,
        caveat: 'Exakt vår artikel, till slutkund i storpack om 16.',
      }
    : row
);

/**
 * Badlakanet 100 × 150. Bygghemmas Enzo 90 × 150 låg förr som exakt träff här,
 * eftersom vi själva sålde en 90 × 150 som Franzén aldrig har haft. Nu när
 * storleken är rättad till Franzéns 100 × 150 är Enzo den ungefärliga och
 * Sovtex den exakta.
 */
const TOWEL_100150: FranzenCompetitor[] = [
  {
    vendor: 'Sovtex',
    product: 'Nevada Frottéhandduk Vit 100x150 FP12',
    spec: '450 g/m², 100 % bomull — Textilgruppens artikel 2649501',
    size: '100 × 150',
    priceSek: b2c(111),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://sovtex.se/hotell-restaurang/nevada-frottehandduk-vit-100x150-cm-fp12',
    match: 'approx',
    primary: true,
    caveat: 'Samma modell och mått, men Sovtex för bara vitt — vår färg finns inte hos dem.',
  },
  {
    vendor: 'Bygghemma',
    product: 'Frotté Borganäs of Sweden Enzo 90x150 cm',
    spec: '100 % bomull, kontrastbård, hängare på kortsidorna',
    size: '90 × 150',
    priceSek: b2c(142),
    channel: 'b2c',
    basis: 'b2c',
    url: 'https://www.bygghemma.se/inredning-och-belysning/hemtextilier/badrumstextilier/badlakan/frotte-borganas-of-sweden-enzo-90x150-cm/p-1799027',
    match: 'approx',
    caveat: '10 cm smalare, och Enzo i stället för Nevada. Frånpris över färgerna.',
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
    match: 'exact',
    caveat: '100 g tyngre än vår, samma mått.',
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
    caveat: 'Varumärkesbadlakan, 10 cm smalare — nästan tre gånger vårt pris.',
    watch: { fetchUrl: TING_HANDDUK, parser: 'tingstad-analytics', key: 'DJ41005970' },
  },
];

/** Vitt är den enda färgen där Sovtex säljer exakt vår artikel. */
const TOWEL_100150_VIT: FranzenCompetitor[] = TOWEL_100150.map(row =>
  row.vendor === 'Sovtex'
    ? {
        ...row,
        match: 'exact' as const,
        sameArticle: true,
        caveat: 'Exakt vår artikel, till slutkund i storpack om 12.',
      }
    : row
);

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
    caveat: 'Slätvävd 55 × 75, samma mått och konstruktionsklass som vårt bomull/polyester-örngott.',
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
    caveat: 'Franzéns eget satinrandsörngott, sålt till slutkund i 30-pack.',
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
 * Örngottet i satinrand (artikel 2669301). Sovtex säljer exakt den artikeln,
 * så raden lyfts från "närmaste motsvarighet" till samma vara.
 */
const PILLOWCASE_WIDE_SATIN: FranzenCompetitor[] = PILLOWCASE_WIDE.map(row =>
  row.vendor === 'Sovtex'
    ? {
        ...row,
        match: 'exact' as const,
        sameArticle: true,
        caveat: 'Exakt vår artikel, till slutkund i storpack om 30.',
      }
    : row
);

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

  'ORN-SAT-5575': PILLOWCASE_WIDE_SATIN,
  'ORN-BP-5575': PILLOWCASE_WIDE,

  'HAN-NEV-VIT-5070': TOWEL_5070_VIT,
  'HAN-NEV-GRA-5070': TOWEL_5070,

  'HAN-NEV-VIT-70140': TOWEL_70140_VIT,
  'HAN-NEV-GRA-70140': TOWEL_70140,

  'HAN-NEV-VIT-100150': TOWEL_100150_VIT,
  'HAN-NEV-GRA-100150': TOWEL_100150,

  'MOR-FRO-STD': ROBE_FROTTE,
  'MOR-FRO-BRO': ROBE_FROTTE,

  'MOR-VAF-VIT': ROBE_VAFFEL_VIT,

  // Varje variant i katalogen har numera en rad här. Det gick inte förrän
  // 0033 rättade sortimentet mot Franzéns artikelfil: de storlekar och färger
  // som saknade marknadsdata (påslakan 220 × 230, örngott 50 × 60/50 × 70/
  // 60 × 80, handduk 90 × 150, våffelrock i beige/brun/grå) saknade den för
  // att de inte fanns hos Franzén heller, och är nu borta ur katalogen.
  //
  // Tofflor och handtvål står inte här längre: de är avkopplade från Franzén
  // och har ingen leverantör alls.
};

/** Alla leverantörer som förekommer, i den ordning vyn presenterar dem. */
export const FRANZEN_VENDORS = ['Livv', 'Tingstad', 'Sovtex', 'Bygghemma', 'Spis & Servis'] as const;
