// Konkurrentpriser — handunderhållen fil. Inte genererad.
//
// Insamlad 2026-08-05 från publika prislistor. Alla belopp i SEK per styck.
// Priser i EUR är omräknade till kurs 10,975 EUR/SEK (mittkurs 2026-08-05).
//
// Momsbasen skiljer sig mellan källorna och står utskriven per rad i `basis`:
//   'ex'       — leverantören anger uttryckligen exkl. moms.
//   'ex-antag' — B2B-grossist som inte anger momsstatus. Vi räknar priset som
//                exkl. moms. Gäller Livv och Mandales. Se noten i grafen.
//   'b2c'      — konsumentpris inkl. moms hos handlaren, här delat med 1,25.
//
// Uppdatera priserna manuellt och flytta fram `collectedAt` när du gör det.

export const collectedAt = '2026-08-05';
export const eurSek = 10.975;

export type Channel = 'b2b' | 'b2c';
export type Basis = 'ex' | 'ex-antag' | 'b2c';

export const BASIS_LABEL: Record<Basis, string> = {
  ex: 'exkl. moms enligt leverantören',
  'ex-antag': 'momsstatus ej angiven — antaget exkl. moms',
  b2c: 'konsumentpris inkl. moms, omräknat med /1,25',
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
};

export type CompetitorProduct = {
  skuPrefix: string;
  /** Vår specifikation, i samma format som konkurrenternas. */
  ourSpec: string;
  ourSize: string;
  /** Föreslaget listpris B2B, SEK exklusive moms. */
  suggestedSek: number;
  /** Kort motivering till förslaget. */
  rationale: string;
  competitors: Competitor[];
};

export const competitorProducts: CompetitorProduct[] = [
  {
    skuPrefix: 'TAC-SEB',
    ourSpec: '90 % dun / 10 % småfjäder, kassettsytt, bomullscambric 233 TC',
    ourSize: '150 × 200',
    suggestedSek: 1095,
    rationale:
      'Marknadens hotellduntäcken ligger på 1 199–1 427 kr och är alla dun/fjäder-blandningar. Vår 90/10 är en bättre produkt — 1 095 underskrider hela fältet utan att signalera billigt.',
    competitors: [
      {
        vendor: 'Tingstad',
        product: 'Duntäcke Grand Luxe',
        spec: '50/50 dun/fjäder, bomullscambric, 800 g',
        size: '150 × 200',
        priceSek: 1390,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar',
        primary: true,
        caveat: 'Halva dunandelen mot vår (50/50 mot 90/10) — vår produkt är den bättre av de två.',
      },
      {
        vendor: 'Livv',
        product: 'Täcke Ripa Dun/Fjäder',
        spec: 'Dun/fjäder, andel ej angiven',
        size: '150 × 200',
        priceSek: 1199,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/tacken',
        caveat: 'Billigaste duntäcket i underlaget — det är den här prispunkten vi konkurrerar mot.',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Down Duvet Grand Luxe 800 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '150 × 200',
        priceSek: 130 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://bed-bath.com/eu/bedroom/duvets/down-duvet-grand-luxe-150x200-cm-800-g/',
        caveat: 'Samma produkt som Tingstad säljer, köpt direkt i EUR. Tingstad är billigare.',
      },
      {
        vendor: 'Värnamo of Sweden',
        product: 'Lilja duntäcke medium 600 g',
        spec: '90 % pyreneiskt anddun / 10 % fjäder, bomullscambric 280 TC',
        size: '150 × 210',
        priceSek: 1769 / 1.25,
        channel: 'b2c',
        basis: 'b2c',
        url: 'https://varnamoofsweden.se/produkter/tacken/lilja-duntacke-medium-150x210-600-g',
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
        product: 'Täcke Juleboda 800 g',
        spec: 'Mikrofiber, bomullscambric',
        size: '150 × 200',
        priceSek: 429,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/tacken',
        primary: true,
        caveat: 'Bomullscambric — närmaste yttertygsnivå till vår bomullssatin.',
      },
      {
        vendor: 'Livv',
        product: 'Täcke Konstantin 800 g',
        spec: 'Mikrofiber',
        size: '150 × 200',
        priceSek: 595,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/tacken',
      },
      {
        vendor: 'Livv',
        product: 'Täcke Twill 800 g',
        spec: '100 % polyestertwill, mikrofiber',
        size: '150 × 200',
        priceSek: 319,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/tacken',
        caveat: 'Samma produkt som Hotex säljer för 298 kr — Livv lägger ca 7 % på.',
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
      },
      {
        vendor: 'Tingstad',
        product: 'Täcke Bed & Bath Comfort',
        spec: 'Hålfiber',
        size: '150 × 200',
        priceSek: 245,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar',
      },
      {
        vendor: 'Mandales',
        product: 'Duvet Envious Julie 800 g',
        spec: 'Fibertäcke',
        size: '150 × 210',
        priceSek: 190,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/cat/bedroom/duvets/',
        caveat: 'Marknadens golv. Något större format (150 × 210) och lägre utförande, men samma användning.',
      },
      {
        vendor: 'Mandales',
        product: 'Duvet Grey Elkh 800 g',
        spec: 'Fibertäcke',
        size: '150 × 210',
        priceSek: 510,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/cat/bedroom/duvets/',
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
    suggestedSek: 169,
    rationale:
      'Tre B2B-priser inom 159–199 kr gör segmentet nästan helt prisstyrt. 169 kr ligger i mitten; det finns inget utrymme att ta mer utan en egenskap ingen annan har.',
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
        caveat: 'Exakt storlek och produkttyp. Har spärrskikt, vilket vår specifikation inte anger.',
      },
      {
        vendor: 'Livv',
        product: 'Bäddmadrasskydd Standard',
        spec: 'Bäddmadrasskydd',
        size: 'Flera storlekar',
        priceSek: 159,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/madrasskydd',
        caveat: 'Marknadens golv. Vilken storlek priset avser framgår inte av listningen.',
      },
      {
        vendor: 'Livv',
        product: 'Stretchöverdrag',
        spec: 'Stretchöverdrag',
        size: '160 × 200',
        priceSek: 199,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/madrasskydd',
        caveat: 'Stretchöverdrag, inte vadderat skydd — angränsande produkt.',
      },
      {
        vendor: 'Livv',
        product: 'Bäddmadrasskydd Secura',
        spec: 'Bäddmadrasskydd, högre utförande',
        size: 'Flera storlekar',
        priceSek: 239,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/madrasskydd',
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
    suggestedSek: 749,
    rationale:
      'Dunkuddefältet är tätt och högt: 825–878 kr, alla 50/50. 749 kr underskrider hela fältet med en bättre fyllning. Låg volym gör att marginalkronorna spelar mindre roll än signalvärdet.',
    competitors: [
      {
        vendor: 'Tingstad',
        product: 'Kudde Grand Luxe',
        spec: '50/50 dun/fjäder, bomullscambric',
        size: '50 × 70',
        priceSek: 875,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar',
        primary: true,
        caveat: 'Exakt storlek. Halva dunandelen mot vår.',
      },
      {
        vendor: 'Livv',
        product: 'Kudde Ripa 600 g',
        spec: '50/50 dun/fjäder',
        size: '50 × 60',
        priceSek: 849,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/kuddar',
        caveat: 'Mindre format (50 × 60).',
      },
      {
        vendor: 'Tingstad',
        product: 'Dunkudde vit',
        spec: 'Dun',
        size: '50 × 60',
        priceSek: 825,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar',
        caveat: 'Marknadens golv i dunsegmentet, men mindre format.',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Grand Luxe 810 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '50 × 70',
        priceSek: 80 * 10.975,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-grand-luxe-down-50x70-cm-700-g/',
        caveat: 'Samma produkt som Tingstads, direktpris i EUR.',
      },
    ],
  },
  {
    skuPrefix: 'KUD-ERI',
    ourSpec: 'Polyesterfiber, bomulls-/mikrofibertyg',
    ourSize: '50 × 70',
    suggestedSek: 159,
    rationale:
      'Sju jämförbara priser mellan 85 och 199 kr och ingenting som skiljer vår produkt från fältet. 159 kr är strax under mitten — det här är den produkt där vi minst har råd att ligga högt.',
    competitors: [
      {
        vendor: 'Mandales',
        product: 'Pillow Grey Elkh 800 g',
        spec: 'Fiberkudde',
        size: '50 × 70',
        priceSek: 185,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/cat/bedroom/pillows/',
        primary: true,
        caveat: 'Exakt storlek och jämförbar fyllnadsvikt.',
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
      },
      {
        vendor: 'Livv',
        product: 'Kudde Konstantin 850 g',
        spec: 'Mikrofiber',
        size: '50 × 60',
        priceSek: 179,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/kuddar',
        caveat: 'Samma modell som Hotex 50 × 70, mindre format.',
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
      },
      {
        vendor: 'Livv',
        product: 'Kudde Juleboda 750 g',
        spec: 'Mikrofiber',
        size: '50 × 60',
        priceSek: 149,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/kuddar',
      },
      {
        vendor: 'Livv',
        product: 'Kudde Jesper 450 g',
        spec: 'Bollfiber',
        size: '50 × 60',
        priceSek: 95,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://livv.se/se/textilier/kuddar',
        caveat: 'Bollfiber, enklare utförande.',
      },
      {
        vendor: 'Tingstad',
        product: 'Kudde Bed & Bath Comfort 450 g',
        spec: 'Bollfiber',
        size: '50 × 70',
        priceSek: 85,
        channel: 'b2b',
        basis: 'ex',
        url: 'https://www.tingstad.com/se-sv/hotell-konferens/textilier/tacken-kuddar',
        caveat: 'Marknadens golv, i exakt vår storlek. Enklare fyllning men samma hylla.',
      },
    ],
  },
  {
    skuPrefix: 'KSK',
    ourSpec: '80 % bomull / 20 % polyester stretchfrotté, dragkedja',
    ourSize: '50 × 70',
    suggestedSek: 49,
    rationale:
      'Fältet spänner 23–95 kr för samma funktion. Mandales tar 95 kr för exakt vår storlek. 49 kr ligger tryggt i nedre halvan och ger ändå högsta marginalen i sortimentet.',
    competitors: [
      {
        vendor: 'Mandales',
        product: 'Pillow Protector',
        spec: 'Kuddskydd',
        size: '50 × 70',
        priceSek: 95,
        channel: 'b2b',
        basis: 'ex-antag',
        url: 'https://www.mandales.com/cat/bedroom/pillows/',
        primary: true,
        caveat: 'Exakt vår storlek. Materialet framgår inte av listningen.',
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
        url: 'https://www.mandales.com/cat/bedroom/pillows/',
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
        caveat: 'Marknadens golv. Vattentät PU-jersey, inte stretchfrotté.',
      },
    ],
  },
];

export const primaryOf = (p: CompetitorProduct) =>
  p.competitors.find(c => c.primary) ?? p.competitors[0];

/** Billigaste B2B-alternativet i underlaget — den prispunkt en inköpare faktiskt kan välja i stället. */
export const floorOf = (p: CompetitorProduct) =>
  p.competitors
    .filter(c => c.channel === 'b2b')
    .reduce((lo, c) => (c.priceSek < lo.priceSek ? c : lo), p.competitors.filter(c => c.channel === 'b2b')[0]);
