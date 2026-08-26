// Konkurrentpriser — handunderhållen fil. Inte genererad.
//
// Insamlad 2026-08-05, verifierad mot leverantörernas råa sidkällor (JSON-LD,
// WooCommerce-variantpayloads, Tingstads data-analytics-attribut och Livvs
// Medusa-payload). Alla belopp i SEK per styck.
// Priser i EUR är omräknade till kurs 10,975 EUR/SEK (mittkurs 2026-08-05).
//
// VIKTIGT om storlekar: flera leverantörer visar ett "från"-pris på kategori-
// sidan som avser den minsta varianten. Priserna här är per exakt variant,
// hämtade ur variantdatan — inte kortets frånpris. Det var källan till tre fel
// i den första versionen av den här filen.
//
// Momsbasen står per rad i `basis`:
//   'ex'       — leverantören anger uttryckligen exkl. moms. Gäller även Livv:
//                deras storefront skickar is_calculated_price_tax_inclusive:
//                false på varje pris.
//   'ex-antag' — B2B-leverantör som inte skriver ut momsstatus. Gäller Mandales.
//   'b2c'      — konsumentpris inkl. moms hos handlaren, här delat med 1,25.
//
// `watch` beskriver hur prisboten hämtar om priset. Rader utan watch måste
// kontrolleras för hand — se /api/cron/price-watch.

export const collectedAt = '2026-08-05';
export const eurSek = 10.975;

export type Channel = 'b2b' | 'b2c';
export type Basis = 'ex' | 'ex-antag' | 'b2c';

export const BASIS_LABEL: Record<Basis, string> = {
  ex: 'exkl. moms enligt leverantören',
  'ex-antag': 'momsstatus ej angiven — antaget exkl. moms',
  b2c: 'konsumentpris inkl. moms, omräknat med /1,25',
};

/** Hur boten läser ut priset ur sidan. En parser per butiksplattform. */
export type Parser =
  | 'jsonld-offer' // WooCommerce/Yoast: @graph → Product.offers.price
  | 'woo-variations' // WooCommerce: data-product_variations, matchas på SKU
  | 'tingstad-analytics' // Tingstad: data-analytics-price, matchas på item_id + variant
  | 'livv-variant' // Livv/Medusa: variantens title + calculated_amount
  | 'livv-card' // Livv: kortets rubrik + pris, för produkter vars variant heter "Default"
  | 'bedbath-card'; // Bed & Bath: kortets rubrik + class="price"

export type WatchSpec = {
  /** Sidan som hämtas — ofta produktsidan, inte kategorisidan i `url`. */
  fetchUrl: string;
  parser: Parser;
  /** Pekar ut rätt post på en sida med flera produkter/varianter. */
  key?: string;
  /** Multiplikator till SEK. Sätts för källor som prissätter i EUR. */
  fx?: number;
};

export type Competitor = {
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
  /** Den produkt vi anser vara närmast likvärdig — indexet räknas mot den. */
  primary?: boolean;
  /** Varför matchningen inte är exakt. */
  caveat?: string;
  watch?: WatchSpec;
};

export type CompetitorProduct = {
  skuPrefix: string;
  ourSpec: string;
  ourSize: string;
  /** Föreslaget listpris B2B, SEK exklusive moms. */
  suggestedSek: number;
  rationale: string;
  competitors: Competitor[];
};

const TINGSTAD_BADD = 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar';
const TINGSTAD_KUDDOVERDRAG =
  'https://www.tingstad.com/se-sv/mobler-inredning/textilier/baddtextilier/kuddoverdrag-bed-bath-10bb37010902';
const LIVV_TACKEN = 'https://livv.se/se/textilier/tacken';
const LIVV_KUDDAR = 'https://livv.se/se/textilier/kuddar';
const LIVV_MADRASS = 'https://livv.se/se/textilier/madrasskydd';
const BB_PILLOWS = 'https://bed-bath.com/eu/bedroom/pillows/';
const BB_DUVETS = 'https://bed-bath.com/eu/bedroom/duvets/';

export const competitorProducts: CompetitorProduct[] = [
  {
    skuPrefix: 'TAC-SEB',
    ourSpec: '90 % dun / 10 % småfjäder, kassettsytt, bomullscambric 233 TC',
    ourSize: '150 × 200',
    // Omprissatt 2026-08-26: Jakob (60/40, samma duntäcke-familj) visade sig
    // aldrig ha fått ett riktigt pris — bara en platshållare nästan i nivå
    // med fibertäcket Daniel. I stället för en tredje prisnivå mitt emellan
    // arkiverades Jakob, och Sebastian flyttades upp mot Tingstads 1 390 kr
    // (marknadens facto-tak — Bed & Bath säljer samma vara direkt i EUR för
    // ett par kronor mer, men Tingstad är den som faktiskt köps av). Samma
    // pris som den bästa 50/50-konkurrenten, men med 90/10 — enklare att
    // sälja in än "lite dyrare men bättre", och marginalen bär det (~70 %
    // mot 421 kr landad kostnad, se CostCharts).
    suggestedSek: 1390,
    rationale:
      'Marknadens hotellduntäcken ligger på 1 199–1 427 kr och är alla 50/50 dun/fjäder. Vår 90/10 möter Tingstads 1 390 kr rakt av i stället för att underskrida fältet — samma pris, bättre fyllning.',
    competitors: [
      {
        vendor: 'Tingstad',
        product: 'Duntäcke grand luxe 150x200cm',
        spec: '50/50 dun/fjäder, bomullscambric, 800 g',
        size: '150 × 200',
        priceSek: 1390,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_BADD,
        primary: true,
        caveat: 'Halva dunandelen mot vår (50/50 mot 90/10) — vår produkt är den bättre av de två.',
        watch: { fetchUrl: TINGSTAD_BADD, parser: 'tingstad-analytics', key: 'BB46060300' },
      },
      {
        vendor: 'Livv',
        product: 'Täcke Ripa Dun/Fjäder',
        spec: 'Dun/fjäder, andel ej angiven',
        size: '150 × 200',
        priceSek: 1199,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_TACKEN,
        caveat: 'Billigaste duntäcket i underlaget — det är den här prispunkten vi konkurrerar mot.',
        watch: { fetchUrl: LIVV_TACKEN, parser: 'livv-card', key: 'Täcke Ripa Dun/Fjäder' },
      },
      {
        vendor: 'Bed & Bath',
        product: 'Down Duvet Grand Luxe 800 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '150 × 200',
        priceSek: 130 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: BB_DUVETS,
        caveat: 'Samma produkt som Tingstad säljer, köpt direkt i EUR. Tingstad är billigare.',
        watch: {
          fetchUrl: BB_DUVETS,
          parser: 'bedbath-card',
          key: 'Down Duvet Grand Luxe 150x200 cm, 800 g',
          fx: 10.975,
        },
      },
      {
        vendor: 'Värnamo of Sweden',
        product: 'Lilja duntäcke medium 600 g',
        spec: '90 % pyreneiskt anddun / 10 % fjäder, bomullscambric 280 TC',
        size: '150 × 210',
        priceSek: 3629 / 1.25,
        channel: 'b2c',
        basis: 'b2c',
        url: 'https://varnamoofsweden.se/produkter/tacken/lilja-duntacke-medium-150x210-600-g',
        // Omkontrollerad 2026-08-26: priset låg på 1 769 kr vid den ursprungliga
        // insamlingen (2026-08-05), nu 3 629 kr på samma sida — mer än
        // fördubblat på tre veckor. Kan inte avgöra om det är en genuin
        // prishöjning eller en felaktig ursprunglig avläsning; värt att hålla
        // ett extra öga på nästa gång boten går förbi den här sidan.
        caveat: 'Närmast identisk fyllning som vår. Ordinarie konsumentpris.',
      },
    ],
  },
  {
    skuPrefix: 'TAC-DAN',
    ourSpec: '3D-fiber 459 g/m², bomullssatin 300 TC',
    ourSize: '150 × 200',
    suggestedSek: 329,
    rationale:
      'Hårdast konkurrensutsatta produkten. Fältet spänner 190–595 kr. Vi lägger oss strax över polyestertwill-nivån, motiverat av bomullssatinen, men under bomullscambric-täckena.',
    competitors: [
      {
        vendor: 'Livv',
        product: 'Täcke Juleboda 150x200cm, 800 g',
        spec: 'Mikrofiber, bomullscambric',
        size: '150 × 200',
        priceSek: 429,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_TACKEN,
        primary: true,
        caveat: 'Bomullscambric — närmaste yttertygsnivå till vår bomullssatin.',
        watch: { fetchUrl: LIVV_TACKEN, parser: 'livv-card', key: 'Täcke Juleboda 150x200cm, 800g stoppning' },
      },
      {
        vendor: 'Livv',
        product: 'Täcke Konstantin',
        spec: 'Mikrofiber',
        size: '150 × 200',
        priceSek: 595,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_TACKEN,
        watch: { fetchUrl: LIVV_TACKEN, parser: 'livv-card', key: 'Täcke Konstantin' },
      },
      {
        vendor: 'Mandales',
        product: 'Duvet Grey Elkh 800 g',
        spec: 'Fibertäcke',
        size: '150 × 210',
        priceSek: 510,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/duvet-grey-elkh/',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/duvet-grey-elkh/',
          parser: 'woo-variations',
          key: '2010210202/100',
        },
      },
      {
        vendor: 'Livv',
        product: 'Täcke Twill 150x200cm, 800 g',
        spec: '100 % polyestertwill, mikrofiber',
        size: '150 × 200',
        priceSek: 319,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_TACKEN,
        caveat: 'Samma produkt som Hotex säljer för 298 kr — Livv lägger ca 7 % på.',
        watch: { fetchUrl: LIVV_TACKEN, parser: 'livv-card', key: 'Täcke Twill 150X200cm, 800g' },
      },
      {
        vendor: 'Hotex',
        product: 'Hotelltäcke Twill 800 g',
        spec: '100 % polyestertwill, mikrofiber, OEKO-TEX',
        size: '150 × 200',
        priceSek: 298,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/tacken/hotelltacke-twill-150x200-cm/',
        watch: {
          fetchUrl:
            'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/tacken/hotelltacke-twill-150x200-cm/',
          parser: 'jsonld-offer',
        },
      },
      {
        vendor: 'Tingstad',
        product: 'Täcke Bed & Bath Comfort',
        spec: 'Hålfiber',
        size: '150 × 200',
        priceSek: 298,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_BADD,
        caveat: 'Priset avser varianten 150 × 200. Kategorisidans frånpris gäller en mindre storlek.',
        watch: { fetchUrl: TINGSTAD_BADD, parser: 'tingstad-analytics', key: 'BB16' },
      },
      {
        vendor: 'Mandales',
        product: 'Duvet Pink Martha 800 g',
        spec: 'Fibertäcke',
        size: '150 × 210',
        priceSek: 285,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/duvet-pink-martha/',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/duvet-pink-martha/',
          parser: 'woo-variations',
          key: '2010210215/100',
        },
      },
      {
        vendor: 'Mandales',
        product: 'Duvet Envious Julie 800 g',
        spec: 'Fibertäcke',
        size: '150 × 210',
        priceSek: 190,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/duvet-envious-julie/',
        caveat: 'Marknadens golv. Något större format (150 × 210) och enklare utförande, men samma användning.',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/duvet-envious-julie/',
          parser: 'woo-variations',
          key: '2010210208/100',
        },
      },
      {
        vendor: 'Hotellkompaniet',
        product: 'Hotelltäcke Classic 680 g',
        spec: 'Hålfiber, bomullscambric',
        size: '150 × 200',
        priceSek: 995 / 1.25,
        channel: 'b2c',
        basis: 'b2c',
        url: 'https://hotellkompaniet.se/produkt/hotelltacke-classic-150x200cm/',
      },
    ],
  },
  {
    skuPrefix: 'MAD',
    ourSpec: 'Vadderat madrasskydd',
    ourSize: '160 × 200',
    suggestedSek: 179,
    rationale:
      'I exakt 160 × 200 spänner fältet 182–459 kr. Vi lägger oss strax under Hotellvaror och långt under Livv. Marginalen blir låg, men produkten är odifferentierad och volymen är näst störst i sändningen.',
    competitors: [
      {
        vendor: 'Hotellvaror',
        product: 'Madrasskydd med spärrskikt',
        spec: 'Vadderat, spärrskikt',
        size: '160 × 200',
        priceSek: 182,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://hotellvaror.se/1210-madrasskydd',
        primary: true,
        caveat:
          'Exakt storlek och produkttyp. Har spärrskikt, vilket vår specifikation inte anger. Sidan exponerar inget maskinläsbart pris — måste kontrolleras för hand.',
      },
      {
        vendor: 'Livv',
        product: 'Stretchöverdrag',
        spec: 'Stretchöverdrag',
        size: '160 × 200',
        priceSek: 199,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_MADRASS,
        caveat: 'Stretchöverdrag, inte vadderat skydd — angränsande produkt.',
        watch: { fetchUrl: LIVV_MADRASS, parser: 'livv-variant', key: 'Stretchöverdrag 160X200cm' },
      },
      {
        vendor: 'Livv',
        product: 'Bäddmadrasskydd Standard',
        spec: 'Bäddmadrasskydd',
        size: '160 × 200',
        priceSek: 279,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_MADRASS,
        caveat: 'Kategorisidans 159 kr avser 80 × 200. Priset för vår storlek är 279 kr.',
        watch: { fetchUrl: LIVV_MADRASS, parser: 'livv-variant', key: 'Bäddmadrasskydd Standard 160x200cm' },
      },
      {
        vendor: 'Mandales',
        product: 'Mattress Cover Pink Martha',
        spec: 'Madrassöverdrag',
        size: '120 × 200',
        priceSek: 335,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/cat/bedroom/all-beds/mattress-protector/',
        caveat: 'Närmaste listade storlek är 120 × 200 — Mandales listar inte 160 × 200.',
      },
      {
        vendor: 'Livv',
        product: 'Bäddmadrasskydd Secura',
        spec: 'Bäddmadrasskydd, högre utförande',
        size: '160 × 200',
        priceSek: 459,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_MADRASS,
        watch: { fetchUrl: LIVV_MADRASS, parser: 'livv-variant', key: 'Bäddmadrasskydd - Secura 160x200cm' },
      },
      {
        vendor: 'IKEA',
        product: 'LUDDROS',
        spec: 'Vadderat, polyester/bomull, 60 °C',
        size: '160 × 200',
        priceSek: 149 / 1.25,
        channel: 'b2c',
        basis: 'b2c',
        url: 'https://www.ikea.com/se/sv/p/luddros-madrasskydd-50461635/',
        caveat: 'Marknadsförs uttryckligen mot mindre hotell och B&B — reell konkurrent, inte bara referens.',
      },
    ],
  },
  {
    skuPrefix: 'KUD-SIG',
    ourSpec: '90 % gåsdun / 10 % småfjäder, bomullscambric 233 TC',
    ourSize: '50 × 70',
    // Omprissatt 2026-08-26, samma beslut som Sebastian: Alva (60/40) hade
    // aldrig ett riktigt pris och arkiverades i stället för att fylla ett
    // mellanläge. Sigrid matchar nu Tingstads 875 kr — marknadens facto-tak
    // i det här fältet — i stället för att underskrida det. Marginalen
    // klarar det galant (~60 % mot 344 kr landad kostnad).
    suggestedSek: 875,
    rationale:
      'Dunkuddefältet är tätt och högt: 825–878 kr, alla 50/50. Vår 90/10 möter Tingstads 875 kr rakt av i stället för att underskrida fältet — samma pris, bättre fyllning.',
    competitors: [
      {
        vendor: 'Tingstad',
        product: 'Kudde grand luxe 50x70 cm',
        spec: '50/50 dun/fjäder, bomullscambric',
        size: '50 × 70',
        priceSek: 875,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_BADD,
        primary: true,
        caveat: 'Exakt storlek. Halva dunandelen mot vår.',
        watch: { fetchUrl: TINGSTAD_BADD, parser: 'tingstad-analytics', key: 'BB37010303' },
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Grand Luxe down 700 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '50 × 70',
        priceSek: 80 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: BB_PILLOWS,
        caveat: 'Samma produkt som Tingstads, direktpris i EUR.',
        watch: {
          fetchUrl: BB_PILLOWS,
          parser: 'bedbath-card',
          key: 'Pillow Grand Luxe down 50x70 cm, 700 g',
          fx: 10.975,
        },
      },
      {
        vendor: 'Livv',
        product: 'Kudde Ripa 700 g',
        spec: '50/50 dun/fjäder',
        size: '50 × 70',
        priceSek: 849,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://livv.se/se/textilier/kuddar/kudde-ripa-50x60cm-600g-anddun-fjader-50-50',
        // Omkontrollerad 2026-08-26: sidan sålde tidigare bara 50×60/600g —
        // nu är det enda alternativet 50×70/700g, samma pris. Exakt storlek
        // mot vår nu, inte "mindre format" längre.
        caveat: 'Exakt storlek mot vår (bytt från 50×60/600g sedan förra kontrollen).',
        watch: { fetchUrl: LIVV_KUDDAR, parser: 'livv-variant', key: 'Kudde Ripa' },
      },
      {
        vendor: 'Tingstad',
        product: 'Dunkudde vit 50x60cm',
        spec: 'Dun',
        size: '50 × 60',
        priceSek: 825,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_BADD,
        caveat: 'Marknadens golv i dunsegmentet, men mindre format.',
        watch: { fetchUrl: TINGSTAD_BADD, parser: 'tingstad-analytics', key: 'BB37010302' },
      },
    ],
  },
  {
    skuPrefix: 'KUD-ERI',
    ourSpec: 'Polyesterfiber, bomulls-/mikrofibertyg',
    ourSize: '50 × 70',
    suggestedSek: 159,
    rationale:
      'Åtta jämförbara priser mellan 95 och 229 kr och ingenting som skiljer vår produkt från fältet. 159 kr ligger strax under mitten — det här är den produkt där vi minst har råd att ligga högt.',
    competitors: [
      {
        vendor: 'Livv',
        product: 'Kudde Konstantin 1 050 g',
        spec: 'Mikrofiber',
        size: '50 × 70',
        priceSek: 229,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_KUDDAR,
        caveat: 'Kategorisidans 179 kr avser 50 × 60. Priset i vår storlek är 229 kr.',
        watch: { fetchUrl: LIVV_KUDDAR, parser: 'livv-variant', key: 'Kudde Konstantin 50x70cm, 1050g Fyllning' },
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Surprise Premium 800 g',
        spec: 'Mikrofiber, OEKO-TEX',
        size: '50 × 70',
        priceSek: 19 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: BB_PILLOWS,
        watch: {
          fetchUrl: BB_PILLOWS,
          parser: 'bedbath-card',
          key: 'Pillow Surprise Premium 50x70 cm, 800 g',
          fx: 10.975,
        },
      },
      {
        vendor: 'Hotex',
        product: 'Hotellkudde Konstantin 1 050 g',
        spec: '100 % mikrofiber, bomullscambric, 60 °C',
        size: '50 × 70',
        priceSek: 199,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/kuddar/hotellkudde-konstantin-originalet-50x70-cm/',
        watch: {
          fetchUrl:
            'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/kuddar/hotellkudde-konstantin-originalet-50x70-cm/',
          parser: 'jsonld-offer',
        },
      },
      {
        vendor: 'Mandales',
        product: 'Pillow Grey Elkh 800 g',
        spec: 'Fiberkudde',
        size: '50 × 70',
        priceSek: 185,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/pillow-grey-elkhs-head/',
        primary: true,
        caveat: 'Exakt storlek och jämförbar fyllnadsvikt.',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/pillow-grey-elkhs-head/',
          parser: 'woo-variations',
          key: '2010510202/101',
        },
      },
      {
        vendor: 'Tingstad',
        product: 'Kudde Bed & Bath Comfort 450 g',
        spec: 'Bollfiber',
        size: '50 × 70',
        priceSek: 183,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_BADD,
        caveat: 'Priset avser varianten 50 × 70. Kategorisidans frånpris gäller en mindre storlek.',
        watch: { fetchUrl: TINGSTAD_BADD, parser: 'tingstad-analytics', key: 'BB07' },
      },
      {
        vendor: 'Hygieniq of Scandinavia',
        product: 'Hotellkudde polyesterfyllning 950 g',
        spec: 'Mikrofiber + hålfiber, bomullscambric, OEKO-TEX',
        size: '50 × 70',
        priceSek: 149,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.hygieniq.se/butik/bedding/kuddar-tacken/hotellkudde-med-polyesterfyllning-50x70-cm/',
        watch: {
          fetchUrl:
            'https://www.hygieniq.se/butik/bedding/kuddar-tacken/hotellkudde-med-polyesterfyllning-50x70-cm/',
          parser: 'jsonld-offer',
        },
      },
      {
        vendor: 'Livv',
        product: 'Kudde Juleboda 750 g',
        spec: 'Mikrofiber',
        size: '50 × 60',
        priceSek: 149,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_KUDDAR,
        watch: { fetchUrl: LIVV_KUDDAR, parser: 'livv-variant', key: 'Kudde Juleboda 50x60 750g' },
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Comfort 550 g',
        spec: 'Bollfiber',
        size: '50 × 70',
        priceSek: 9.7 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: BB_PILLOWS,
        caveat: 'Billigast i exakt vår storlek. Enklare fyllning, men samma hylla.',
        watch: { fetchUrl: BB_PILLOWS, parser: 'bedbath-card', key: 'Pillow Comfort 50x70 cm, 550 g', fx: 10.975 },
      },
      {
        vendor: 'Livv',
        product: 'Kudde Jesper 450 g',
        spec: 'Bollfiber',
        size: '50 × 60',
        priceSek: 95,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_KUDDAR,
        caveat: 'Marknadens golv. Bollfiber i mindre format — enklaste hyllan.',
        watch: { fetchUrl: LIVV_KUDDAR, parser: 'livv-variant', key: 'Kudde Jesper 50x60cm, 450g bollfiber' },
      },
    ],
  },
  {
    skuPrefix: 'KSK',
    ourSpec: '80 % bomull / 20 % polyester stretchfrotté, dragkedja',
    ourSize: '50 × 70',
    suggestedSek: 44,
    rationale:
      'Livv säljer ett kuddskydd i exakt 50 × 70 för 45 kr. Det är referensen. 44 kr lägger oss precis under den och ger ändå högsta marginalen i sortimentet.',
    competitors: [
      {
        vendor: 'Tingstad',
        product: 'Kuddöverdrag Bed & Bath',
        spec: 'Kuddöverdrag',
        size: '50 × 70',
        priceSek: 154,
        channel: 'b2b',
        basis: 'ex',
        url: TINGSTAD_KUDDOVERDRAG,
        caveat: 'Exakt vår storlek, men klart högre prisläge än övriga.',
        watch: { fetchUrl: TINGSTAD_KUDDOVERDRAG, parser: 'tingstad-analytics', key: 'BB009' },
      },
      {
        vendor: 'Mandales',
        product: 'Pillow Protector',
        spec: 'Kuddskydd',
        size: '50 × 70',
        priceSek: 95,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/pillow-protector/',
        caveat: 'Exakt vår storlek. Materialet framgår inte av listningen.',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/pillow-protector/',
          parser: 'woo-variations',
          key: '2010110102/102',
        },
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow protector Grand Luxe',
        spec: 'Skyddsöverdrag',
        size: '50 × 70',
        priceSek: 5.6 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-grand-luxe-down-50x70-cm-700-g/',
        caveat: 'Materialet framgår inte av prislistan.',
      },
      {
        vendor: 'Mandales',
        product: 'Pillow Protector',
        spec: 'Kuddskydd',
        size: '50 × 60',
        priceSek: 50,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/products/pillow-protector/',
        watch: {
          fetchUrl: 'https://www.mandales.com/products/pillow-protector/',
          parser: 'woo-variations',
          key: '2010110102/100',
        },
      },
      {
        vendor: 'Livv',
        product: 'Kuddskydd',
        spec: 'Kuddskydd',
        size: '50 × 70',
        priceSek: 45,
        channel: 'b2b',
        basis: 'ex',
        url: LIVV_KUDDAR,
        primary: true,
        caveat: 'Exakt vår storlek och produkttyp. Den prispunkt vi faktiskt konkurrerar mot.',
        watch: { fetchUrl: LIVV_KUDDAR, parser: 'livv-variant', key: 'Kuddskydd 50x70cm' },
      },
      {
        vendor: 'Hotellvaror',
        product: 'Kuddskydd med dragkedja (holiTEX)',
        spec: 'Jersey + polyuretanmembran, vattentätt',
        size: '60 × 80',
        priceSek: 35,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://hotellvaror.se/1211-kuddskydd',
      },
      {
        vendor: 'Hotellvaror',
        product: 'Kuddskydd med dragkedja',
        spec: 'Jersey + polyuretanmembran, vattentätt',
        size: '50 × 60',
        priceSek: 23,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://hotellvaror.se/1211-kuddskydd',
        caveat: 'Marknadens golv. Vattentät PU-jersey, inte stretchfrotté, och mindre format.',
      },
    ],
  },
];

export const primaryOf = (p: CompetitorProduct) =>
  p.competitors.find(c => c.primary) ?? p.competitors[0];

/** Billigaste B2B-alternativet i underlaget — den prispunkt en inköpare faktiskt kan välja i stället. */
export const floorOf = (p: CompetitorProduct) => {
  const b2b = p.competitors.filter(c => c.channel === 'b2b');
  return b2b.reduce((lo, c) => (c.priceSek < lo.priceSek ? c : lo), b2b[0]);
};

/** Platt lista över allt boten kan hämta om, med koppling tillbaka till vår produkt. */
export type WatchTarget = {
  id: string;
  skuPrefix: string;
  vendor: string;
  product: string;
  size: string;
  baselineSek: number;
  watch: WatchSpec;
};

export const watchTargets: WatchTarget[] = competitorProducts.flatMap(p =>
  p.competitors
    .filter((c): c is Competitor & { watch: WatchSpec } => Boolean(c.watch))
    .map(c => ({
      id: `${p.skuPrefix}::${c.vendor}::${c.product}::${c.size}`,
      skuPrefix: p.skuPrefix,
      vendor: c.vendor,
      product: c.product,
      size: c.size,
      baselineSek: c.priceSek,
      watch: c.watch,
    }))
);

// ---------------------------------------------------------------------------
// Per-variant konkurrentpriser
//
// Allt ovanför gäller PRODUKTEN som helhet, jämförd vid en enda representativ
// storlek. Egna produkter med flera varianter (se VariantPricing.tsx) behöver
// en jämförelse per storlek/fyllning, inte en delad siffra för alla.
//
// Research 2026-08-26: gick igenom samma leverantörer som ovan (Tingstad,
// Livv, Bed & Bath, Mandales, Hotex, Hotellvaror, Hotellkompaniet, IKEA) för
// varje ytterligare storlek vi säljer i. Marknaden saknar helt enkelt vissa
// storlekar — inget duntäcke säljs i 220×200 hos någon av leverantörerna, och
// ingen dunkudde säljs i 60×90 (varken and- eller gåsdun). Se SIZE_EQUIVALENCE
// nedan för de fall där en näraliggande storlek användes i stället.
// ---------------------------------------------------------------------------

/**
 * Storlekar som räknas som likvärdiga när marknaden saknar en exakt träff.
 * Skillnaden är för liten för att motivera ett eget prisläge, men den ska
 * synas — varje `VariantCompetitor` som använder en av dessa par är taggad
 * `match: 'approx'`, och gränssnittet visar då en kort förklaring.
 */
export const SIZE_EQUIVALENCE: { a: string; b: string; note: string }[] = [
  { a: '50 x 90', b: '60 x 90', note: '10 cm smalare, samma fyllnadsklass' },
  { a: '220 x 220', b: '220 x 200', note: '20 cm längre' },
];

export type VariantCompetitor = {
  vendor: string;
  product: string;
  size: string;
  priceSek: number;
  channel: Channel;
  basis: Basis;
  url: string;
  /** Flera rader kan finnas per variant — den här väljs som referenslinjen. */
  primary?: boolean;
  /** 'approx' när träffen bygger på ett par ur SIZE_EQUIVALENCE, inte en exakt storlek. */
  match: 'exact' | 'approx';
  caveat?: string;
};

/**
 * Konkurrentpriser per egen variant-SKU (samma sträng som
 * `product_variants.sku` i databasen) — till skillnad från
 * `competitorProducts`, som har en jämförelse per produkt.
 *
 * En SKU som saknas här har antingen (a) samma storlek som produktens
 * `ourSize` ovan — då används den produktens `primaryOf`-träff rakt av, se
 * `VariantPricing.tsx` — eller (b) ingen marknadsträff alls, exakt eller
 * likvärdig. Det senare gäller Kudde Sigrids 60×90-varianter: ingen av
 * leverantörerna säljer en dunkudde i den storleken, and- eller gåsdun.
 */
export const variantCompetitors: Record<string, VariantCompetitor[]> = {
  'KUD-ERI-6080': [
    {
      vendor: 'Tingstad',
      product: 'Kudde Bed & Bath Premium Vit',
      size: '60 × 80',
      priceSek: 205,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://www.tingstad.com/se-sv/mobler-inredning/textilier/baddtextilier/kudde-bed-bath-premium-10bb37070151?size=sBOB%7C6080&color=cBOB%7C0113',
      primary: true,
      match: 'exact',
    },
    {
      vendor: 'Bed & Bath',
      product: 'Pillow Surprise Premium 1300 g',
      size: '60 × 80',
      priceSek: 26 * eurSek,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-surprise-premium-60x80-cm-1300-g/',
      match: 'exact',
    },
    {
      vendor: 'Hotex',
      product: 'Hotellkudde Juleboda',
      size: '60 × 80',
      priceSek: 219,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/kuddar/hotellkudde-juleboda-60x80-cm/',
      match: 'exact',
    },
    {
      vendor: 'Hotellvaror',
      product: 'Kudde 60×80 cm (BP2)',
      size: '60 × 80',
      priceSek: 118,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://hotellvaror.se/kuddar/464-kudde-6080-cm.html',
      match: 'exact',
      caveat: 'Marknadens golv i den här storleken.',
    },
    {
      vendor: 'Hotellkompaniet',
      product: 'Hotellkudde 60x80cm',
      size: '60 × 80',
      priceSek: 599,
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://hotellkompaniet.se/produkt/hotellkudde-60x80cm/',
      match: 'exact',
    },
  ],

  'MAD-80200': [
    {
      vendor: 'Livv',
      product: 'Bäddmadrasskydd Standard',
      size: '80 × 200',
      priceSek: 159,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://livv.se/se/textilier/madrasskydd/baddmadrasskydd-standard-flera-storlekar',
      primary: true,
      match: 'exact',
    },
    {
      vendor: 'Livv',
      product: 'Bäddmadrasskydd Secura',
      size: '80 × 200',
      priceSek: 239,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://livv.se/se/textilier/madrasskydd/baddmadrasskydd-secura-finns-i-flera-storlekar',
      match: 'exact',
    },
    {
      vendor: 'Mandales',
      product: 'Mattress Cover Pink Martha',
      size: '80 × 200',
      priceSek: 245,
      channel: 'b2b',
      basis: 'ex-antag',
      url: 'https://www.mandales.com/cat/bedroom/all-beds/mattress-protector/',
      match: 'exact',
    },
    {
      vendor: 'IKEA',
      product: 'LUDDROS madrasskydd',
      size: '80 × 200',
      priceSek: 63.2,
      channel: 'b2c',
      basis: 'ex',
      url: 'https://www.ikea.com/se/sv/p/luddros-madrasskydd-30461641/',
      match: 'exact',
      caveat: 'Sidan anger uttryckligen 63,20 kr exkl. moms bredvid 79 kr-priset.',
    },
    {
      vendor: 'Bed & Bath',
      product: 'Mattress protector Grand Luxe',
      size: '80 × 200',
      priceSek: 16 * eurSek,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://bed-bath.com/eu/bedroom/mattress-protectors/mattress-protector-grand-luxe-80x200-cm/',
      match: 'exact',
    },
  ],

  'MAD-200200': [
    {
      vendor: 'Hotellvaror',
      product: 'Madrasskydd med spärrskikt',
      size: '200 × 200',
      priceSek: 288,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://hotellvaror.se/1210-madrasskydd',
      primary: true,
      match: 'exact',
      caveat: 'Samma leverantör som produktens 160×200-jämförelse.',
    },
    {
      vendor: 'Bed & Bath',
      product: 'Mattress protector Grand Luxe',
      size: '200 × 200',
      priceSek: 36 * eurSek,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://bed-bath.com/eu/bedroom/mattress-protectors/mattress-protector-grand-luxe-200x200-cm/',
      match: 'exact',
    },
  ],

  // Täcke Jakob (60 % dun / 40 % fjäder) har ingen egen produktrad ovan — det
  // är en ny produkt utan sändningsdata. 150×200 ligger närmast 50/50-fältet
  // som redan används för Sebastian/Daniel, så samma leverantörer återanvänds.
  'TAC-JAK-150200-AND': [
    {
      vendor: 'Tingstad',
      product: 'Duntäcke grand luxe',
      size: '150 × 200',
      priceSek: 1390,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://www.tingstad.com/se-sv/mobler-inredning/textilier/baddtextilier/duntacke-grand-luxe-150x200cm-bb46060300',
      primary: true,
      match: 'exact',
      caveat: '50/50 dun/fjäder — Jakobs 60/40 ligger mellan detta och Sebastians 90/10.',
    },
    {
      vendor: 'Livv',
      product: 'Täcke Ripa Dun/Fjäder',
      size: '150 × 200',
      priceSek: 1199,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://livv.se/se/textilier/tacken/ripa-tacke-dun-fjader',
      match: 'exact',
    },
    {
      vendor: 'Bed & Bath',
      product: 'Down Duvet Grand Luxe 800 g',
      size: '150 × 200',
      priceSek: 130 * eurSek,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://bed-bath.com/eu/bedroom/duvets/down-duvet-grand-luxe-150x200-cm-800-g/',
      match: 'exact',
    },
  ],

  // Marknaden skiljer inte på and- och gåsdun i pris (ingen leverantör
  // erbjuder båda till olika pris), så AND- och GAS-varianterna delar samma
  // jämförelse rakt av — se caveat.
  'TAC-JAK-220200-AND': [
    {
      vendor: 'Värnamo of Sweden',
      product: 'Lilja duntäcke medium',
      size: '220 × 220',
      priceSek: 6889 / 1.25,
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://varnamoofsweden.se/tacken/lilja-duntacke-medium-220x220',
      primary: true,
      match: 'approx',
      caveat: 'Inget duntäcke i exakt 220×200 hittades hos någon leverantör — det här är närmaste storlek.',
    },
  ],
  'TAC-SEB-220200-AND': [
    {
      vendor: 'Värnamo of Sweden',
      product: 'Lilja duntäcke medium',
      size: '220 × 220',
      priceSek: 6889 / 1.25,
      channel: 'b2c',
      basis: 'b2c',
      url: 'https://varnamoofsweden.se/tacken/lilja-duntacke-medium-220x220',
      primary: true,
      match: 'approx',
      caveat: 'Inget duntäcke i exakt 220×200 hittades hos någon leverantör — det här är närmaste storlek.',
    },
  ],

  'KSK-6090X': [
    {
      vendor: 'Livv',
      product: 'Kuddskydd',
      size: '50 × 90',
      priceSek: 49,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://livv.se/se/textilier/kuddar/kuddskydd-kuddvar-50x60cm',
      primary: true,
      match: 'approx',
      caveat: 'Inget kuddskydd i exakt 60×90 hittades — det här är närmaste storlek, samma leverantör som 50×70-jämförelsen.',
    },
    {
      vendor: 'Bed & Bath',
      product: 'Pillow protective cover',
      size: '50 × 90',
      priceSek: 6 * eurSek,
      channel: 'b2b',
      basis: 'ex',
      url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-protective-cover-50x90-cm/',
      match: 'approx',
      caveat: 'Inget kuddskydd i exakt 60×90 hittades — det här är närmaste storlek.',
    },
  ],

  // Kudde Sigrids KUD-SIG-AND-6090 och KUD-SIG-GAS-6090 saknas medvetet här:
  // ingen av leverantörerna (Tingstad, Livv, Bed & Bath, Mandales, Hotex,
  // Hygieniq, IKEA) säljer en dunkudde i 60×90 eller ens i den närliggande
  // 50×90 — marknadens dunkuddar tar slut vid 50×70/50×90 i syntetiskt
  // utförande, inte dun. Ingen leverantör skiljer heller på and- och gåsdun i
  // pris. Det finns alltså ingen ärlig jämförelse att visa för de här två
  // varianterna, inte ens en approximativ.
};

// Samma skäl som ovan: marknaden prisar inte and- och gåsdun olika, så
// gåsdun-varianten pekar på exakt samma jämförelse som anddun-varianten
// i stället för att dubblera datan (och riskera att den glider isär).
variantCompetitors['TAC-JAK-150200-GAS'] = variantCompetitors['TAC-JAK-150200-AND'];
variantCompetitors['TAC-JAK-220200-GAS'] = variantCompetitors['TAC-JAK-220200-AND'];
variantCompetitors['TAC-SEB-220200-GAS'] = variantCompetitors['TAC-SEB-220200-AND'];
