// Konkurrentpriser — handunderhållen fil. Inte genererad.
//
// Insamlad 2026-08-05 från publika prislistor. Alla belopp i SEK exklusive moms.
// Priser i EUR är omräknade till kurs 10,975 EUR/SEK (mittkurs 2026-08-05).
// B2C-priser är angivna inklusive moms hos handlaren och räknade om med /1,25.
//
// Uppdatera priserna manuellt och flytta fram `collectedAt` när du gör det.

export const collectedAt = '2026-08-05';
export const eurSek = 10.975;

export type Channel = 'b2b' | 'b2c';

export type Competitor = {
  vendor: string;
  product: string;
  /** Kort specifikation som gör jämförelsen granskningsbar. */
  spec: string;
  size: string;
  /** SEK exklusive moms, per styck. */
  priceSek: number;
  channel: Channel;
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
    suggestedSek: 1195,
    rationale:
      'Enda duntäcket i jämförelsen med 90 % dun — marknadens hotellduntäcken ligger på 50/50. Vi kan ta ett premiumpris och ändå underskrida referensen.',
    competitors: [
      {
        vendor: 'Bed & Bath',
        product: 'Down Duvet Grand Luxe 800 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '150 × 200',
        priceSek: 130 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/duvets/down-duvet-grand-luxe-150x200-cm-800-g/',
        primary: true,
        caveat: 'Lägre dunandel än vår (50/50 mot 90/10) — vår produkt är alltså den bättre av de två.',
      },
      {
        vendor: 'Värnamo of Sweden',
        product: 'Lilja duntäcke medium 600 g',
        spec: '90 % pyreneiskt anddun / 10 % fjäder, bomullscambric 280 TC',
        size: '150 × 210',
        priceSek: 1769 / 1.25,
        channel: 'b2c',
        url: 'https://varnamoofsweden.se/produkter/tacken/lilja-duntacke-medium-150x210-600-g',
        caveat: 'Konsumentpris, ordinarie. Närmast identisk fyllning som vår.',
      },
    ],
  },
  {
    skuPrefix: 'TAC-DAN',
    ourSpec: '3D-fiber 459 g/m², bomullssatin 300 TC',
    ourSize: '150 × 200',
    suggestedSek: 349,
    rationale:
      'Bomullssatin 300 TC är ett bättre yttertyg än marknadens polyestertwill. Vi lägger oss under premiumreferensen men klart över lågprisfibertäckena.',
    competitors: [
      {
        vendor: 'Bed & Bath',
        product: 'Duvet Surprise Premium 800 g',
        spec: 'Mikrofiber, OEKO-TEX',
        size: '150 × 200',
        priceSek: 50 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/duvets/',
        primary: true,
        caveat: 'Yttertyget är inte specificerat i prislistan.',
      },
      {
        vendor: 'Hotex',
        product: 'Hotelltäcke Twill 800 g',
        spec: '100 % polyestertwill, mikrofiberfyllning, OEKO-TEX',
        size: '150 × 200',
        priceSek: 298,
        channel: 'b2b',
        url: 'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/tacken/hotelltacke-twill-150x200-cm/',
        caveat: 'Polyesteryttertyg — enklare känsla än vår bomullssatin.',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Duvet Comfort 800 g',
        spec: 'Hålfiber',
        size: '150 × 200',
        priceSek: 22.5 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/duvets/',
        caveat: 'Marknadens golv. Hålfiber utan bomullstyg — inte en likvärdig produkt.',
      },
      {
        vendor: 'Hotellkompaniet',
        product: 'Hotelltäcke Classic 680 g',
        spec: 'Hålfiber, bomullscambric',
        size: '150 × 200',
        priceSek: 995 / 1.25,
        channel: 'b2c',
        url: 'https://hotellkompaniet.se/produkt/hotelltacke-classic-150x200cm/',
      },
    ],
  },
  {
    skuPrefix: 'MAD',
    ourSpec: 'Vadderat madrasskydd',
    ourSize: '160 × 200',
    suggestedSek: 199,
    rationale:
      'Den enda produkt där vi hamnar över den svenska B2B-referensen. Skillnaden är liten och volymen stor — priset tål att sättas ned om det behövs för att vinna avtal.',
    competitors: [
      {
        vendor: 'Hotellvaror',
        product: 'Madrasskydd med spärrskikt',
        spec: 'Vadderat, spärrskikt',
        size: '160 × 200',
        priceSek: 182,
        channel: 'b2b',
        url: 'https://hotellvaror.se/1210-madrasskydd',
        primary: true,
        caveat: 'Har spärrskikt, vilket vår specifikation inte anger.',
      },
      {
        vendor: 'Hotellvaror',
        product: 'Madrasskydd med spärrskikt',
        spec: 'Vadderat, spärrskikt',
        size: '200 × 200',
        priceSek: 288,
        channel: 'b2b',
        url: 'https://hotellvaror.se/1210-madrasskydd',
        caveat: 'Större storlek — visar prisstegen per bredd.',
      },
      {
        vendor: 'IKEA',
        product: 'LUDDROS',
        spec: 'Vadderat, polyester/bomull, 60 °C',
        size: '160 × 200',
        priceSek: 149 / 1.25,
        channel: 'b2c',
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
      'Samma logik som Sebastian: högre dunandel än referensen till lägre pris. Låg volym gör att marginalkronorna spelar mindre roll än signalvärdet.',
    competitors: [
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Grand Luxe 810 g',
        spec: '50/50 dun/fjäder, bomullscambric, OEKO-TEX',
        size: '50 × 70',
        priceSek: 80 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-grand-luxe-down-50x70-cm-700-g/',
        primary: true,
        caveat: 'Lägre dunandel än vår.',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Grand Luxe',
        spec: '50/50 dun/fjäder, bomullscambric',
        size: '50 × 60',
        priceSek: 75 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/pillows/',
      },
    ],
  },
  {
    skuPrefix: 'KUD-ERI',
    ourSpec: 'Polyesterfiber, bomulls-/mikrofibertyg',
    ourSize: '50 × 70',
    suggestedSek: 169,
    rationale:
      'Tätast befolkade segmentet — fyra jämförbara priser mellan 106 och 209 kr. Vi lägger oss strax under mitten eftersom produkten inte är differentierad.',
    competitors: [
      {
        vendor: 'Hotex',
        product: 'Hotellkudde Konstantin 1 050 g',
        spec: '100 % mikrofiber, bomullscambric, 60 °C',
        size: '50 × 70',
        priceSek: 199,
        channel: 'b2b',
        url: 'https://hotex.se/butik/evento/badosangtextilier/tacken-och-kuddar/kuddar/hotellkudde-konstantin-originalet-50x70-cm/',
        primary: true,
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Surprise Premium',
        spec: 'Mikrofiber, OEKO-TEX',
        size: '50 × 70',
        priceSek: 19 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/pillows/',
      },
      {
        vendor: 'Hygieniq of Scandinavia',
        product: 'Hotellkudde polyesterfyllning 950 g',
        spec: 'Mikrofiber + hålfiber, bomullscambric, OEKO-TEX',
        size: '50 × 70',
        priceSek: 149,
        channel: 'b2b',
        url: 'https://www.hygieniq.se/butik/bedding/kuddar-tacken/hotellkudde-med-polyesterfyllning-50x70-cm/',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow Comfort',
        spec: 'Bollfiber',
        size: '50 × 70',
        priceSek: 9.7 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/pillows/',
        caveat: 'Bollfiber är ett enklare utförande än vår fibervadd.',
      },
    ],
  },
  {
    skuPrefix: 'KSK',
    ourSpec: '80 % bomull / 20 % polyester stretchfrotté, dragkedja',
    ourSize: '50 × 70',
    suggestedSek: 39,
    rationale:
      'Svagast underbyggda förslaget. Den svenska B2B-referensen är en vattentät PU-jersey, inte stretchfrotté — samma funktion, annat material. Se noteringen under grafen.',
    competitors: [
      {
        vendor: 'Hotellvaror',
        product: 'Kuddskydd med dragkedja, vattentätt',
        spec: 'Jersey + polyuretanmembran',
        size: '50 × 60',
        priceSek: 23,
        channel: 'b2b',
        url: 'https://hotellvaror.se/1211-kuddskydd',
        primary: true,
        caveat: 'Vattentät PU-jersey, inte stretchfrotté. Närmaste storlek, men inte samma produkt.',
      },
      {
        vendor: 'Hotellvaror',
        product: 'Kuddskydd med dragkedja, vattentätt (holiTEX)',
        spec: 'Jersey + polyuretanmembran',
        size: '60 × 80',
        priceSek: 35,
        channel: 'b2b',
        url: 'https://hotellvaror.se/1211-kuddskydd',
      },
      {
        vendor: 'Bed & Bath',
        product: 'Pillow protector Grand Luxe',
        spec: 'Skyddsöverdrag',
        size: '50 × 70',
        priceSek: 5.6 * 10.975,
        channel: 'b2b',
        url: 'https://bed-bath.com/eu/bedroom/pillows/pillow-grand-luxe-down-50x70-cm-700-g/',
        caveat: 'Materialet framgår inte av prislistan.',
      },
    ],
  },
];

export const primaryOf = (p: CompetitorProduct) =>
  p.competitors.find(c => c.primary) ?? p.competitors[0];
