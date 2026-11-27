/**
 * Fakturan och kreditfakturan som pdf (source_of_truth §9.2, §9.8).
 *
 * En ren funktion från fakturans ögonblicksbild till pdf-bytes. Samma rad ger
 * alltid samma faktura, så pdf:en kan ritas om om den någon gång saknas, utan
 * att något på den ändras.
 *
 * Typsnittet är Helvetica, som finns i varje pdf-läsare och inte behöver
 * bäddas in. Det täcker svenska tecken, men inte allt Intl skriver ut (till
 * exempel smalt mellanslag och minustecken), så all text går genom `clean`.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { InvoiceBuyer, InvoiceLineSnapshot, InvoiceSeller } from '@/lib/db/schema';

export type InvoiceDocument = {
  kind: 'invoice' | 'credit';
  number: number;
  issuedOn: string;
  dueOn: string | null;
  /** Fakturans nummer när det här är en kreditfaktura. */
  creditsNumber: number | null;
  orderId: number;
  currency: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: InvoiceLineSnapshot[];
  goodsMinor: number;
  discountMinor: number;
  shippingMinor: number;
  netMinor: number;
  vatBps: number;
  taxMinor: number;
  totalMinor: number;
  ocr: string | null;
  memo: string | null;
  /** Dagar mellan fakturadatum och förfallodag, för villkorstexten (A19). */
  dueDays: number | null;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const RIGHT = A4[0] - MARGIN;
const INK = rgb(0.1, 0.12, 0.13);
const INK_2 = rgb(0.36, 0.39, 0.41);
const BRAND = rgb(0.043, 0.239, 0.18);
const RULE = rgb(0.84, 0.86, 0.87);
const PANEL = rgb(0.95, 0.96, 0.95);

// WinAnsi: Latin-1 plus det Windows-1252 lägger till i 0x80–0x9F.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Text som Helvetica kan skriva. Okända tecken blir "?" i stället för ett fel. */
export function clean(text: string): string {
  let out = '';
  for (const char of text.replace(/[   ]/g, ' ').replace(/−/g, '-')) {
    const code = char.codePointAt(0)!;
    const ok =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRA.has(char);
    out += ok ? char : char === '\n' ? ' ' : '?';
  }
  return out;
}

/** 123456 → "1 234,56". Alltid två decimaler, som på en svensk faktura. */
export function money(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const kronor = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const ore = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${kronor},${ore}`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

type Fonts = { regular: PDFFont; bold: PDFFont };

class Writer {
  page: PDFPage;
  y: number;
  private readonly doc: PDFDocument;
  private readonly fonts: Fonts;
  private readonly footer: (page: PDFPage) => void;

  constructor(doc: PDFDocument, fonts: Fonts, footer: (page: PDFPage) => void) {
    this.doc = doc;
    this.fonts = fonts;
    this.footer = footer;
    this.page = this.addPage();
    this.y = A4[1] - MARGIN;
  }

  private addPage(): PDFPage {
    const page = this.doc.addPage(A4);
    this.footer(page);
    return page;
  }

  /** Ny sida om det inte får plats `height` till. Svarar sant när en sida lades till. */
  ensure(height: number): boolean {
    if (this.y - height >= 120) return false;
    this.page = this.addPage();
    this.y = A4[1] - MARGIN;
    return true;
  }

  text(
    value: string,
    x: number,
    options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right'; y?: number } = {}
  ) {
    const size = options.size ?? 9;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const content = clean(value);
    const width = font.widthOfTextAtSize(content, size);
    this.page.drawText(content, {
      x: options.align === 'right' ? x - width : x,
      y: options.y ?? this.y,
      size,
      font,
      color: options.color ?? INK,
    });
  }

  rule(y = this.y, from = MARGIN, to = RIGHT) {
    this.page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness: 0.6, color: RULE });
  }
}

function addressLines(party: { address: InvoiceSeller['address'] }): string[] {
  const a = party.address;
  return [a.line1, a.line2 ?? '', `${a.postalCode} ${a.city}`, a.country !== 'SE' ? a.country : ''].filter(Boolean);
}

export async function renderInvoicePdf(invoice: InvoiceDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const credit = invoice.kind === 'credit';
  const title = credit ? 'Kreditfaktura' : 'Faktura';
  doc.setTitle(`${title} ${invoice.number} – ${invoice.seller.name}`);
  doc.setAuthor(invoice.seller.name);
  doc.setSubject(`${title} ${invoice.number}, order ${invoice.orderId}`);
  doc.setCreator('Linnevik');
  doc.setProducer('Linnevik');
  // Fast datum, så att samma faktura ger samma bytes vid omritning.
  const issued = new Date(`${invoice.issuedOn}T12:00:00Z`);
  doc.setCreationDate(issued);
  doc.setModificationDate(issued);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const sign = credit ? -1 : 1;
  const seller = invoice.seller;

  // Foten på varje sida: säljarens identitet, som en svensk faktura ska bära.
  const footer = (page: PDFPage) => {
    const size = 7.5;
    const columns: string[][] = [
      [seller.name, ...addressLines(seller)],
      [
        seller.orgNumber ? `Org.nr ${seller.orgNumber}` : '',
        seller.vatNumber ? `Momsreg.nr ${seller.vatNumber}` : '',
        seller.fTax ? 'Godkänd för F-skatt' : '',
        seller.seat ? `Styrelsens säte: ${seller.seat}` : '',
      ].filter(Boolean),
      [
        seller.bankgiro ? `Bankgiro ${seller.bankgiro}` : '',
        seller.bankAccount ? `Bankkonto ${seller.bankAccount}` : '',
        seller.contactEmail ?? '',
      ].filter(Boolean),
    ];
    page.drawLine({ start: { x: MARGIN, y: 78 }, end: { x: RIGHT, y: 78 }, thickness: 0.6, color: RULE });
    const width = (RIGHT - MARGIN) / columns.length;
    columns.forEach((lines, column) => {
      lines.forEach((line, row) => {
        page.drawText(clean(line), {
          x: MARGIN + column * width,
          y: 64 - row * 10,
          size,
          font: fonts.regular,
          color: INK_2,
        });
      });
    });
  };

  const w = new Writer(doc, fonts, footer);

  // ── Huvud ──
  w.text('LINNEVIK', MARGIN, { size: 20, bold: true, color: BRAND });
  w.text(title.toUpperCase(), RIGHT, { size: 16, bold: true, align: 'right' });
  w.y -= 30;

  const facts: Array<[string, string]> = [
    [credit ? 'Kreditfakturanummer' : 'Fakturanummer', String(invoice.number)],
    [credit ? 'Datum' : 'Fakturadatum', invoice.issuedOn],
    ...(credit && invoice.creditsNumber ? [['Krediterar faktura', String(invoice.creditsNumber)] as [string, string]] : []),
    ...(!credit && invoice.dueOn ? [['Förfallodag', invoice.dueOn] as [string, string]] : []),
    ...(!credit && invoice.ocr ? [['OCR-nummer', invoice.ocr] as [string, string]] : []),
  ];
  const factsTop = w.y;
  facts.forEach(([label, value], index) => {
    const y = factsTop - index * 13;
    w.text(label, RIGHT - 110, { y, color: INK_2, align: 'right' });
    w.text(value, RIGHT, { y, bold: true, align: 'right' });
  });

  // ── Köparen ──
  const buyer = invoice.buyer;
  w.text(credit ? 'Krediteras' : 'Faktureras till', MARGIN, { y: factsTop, color: INK_2, size: 8 });
  const buyerLines = [
    buyer.name,
    ...addressLines(buyer),
    buyer.orgNumber ? `Org.nr ${buyer.orgNumber}` : '',
    buyer.vatNumber ? `Momsreg.nr ${buyer.vatNumber}` : '',
  ].filter(Boolean);
  buyerLines.forEach((line, index) => {
    w.text(line, MARGIN, { y: factsTop - 13 - index * 12, bold: index === 0, size: index === 0 ? 10 : 9 });
  });
  w.y = Math.min(factsTop - facts.length * 13, factsTop - 13 - buyerLines.length * 12) - 18;

  // ── Referenser ──
  const references: Array<[string, string]> = [
    ['Ordernummer', String(invoice.orderId)],
    ...(buyer.customerNo ? [['Kundnummer', buyer.customerNo] as [string, string]] : []),
    ...(buyer.reference ? [['Er referens', buyer.reference] as [string, string]] : []),
    ...(buyer.purchaseOrder ? [['Ert ordernummer', buyer.purchaseOrder] as [string, string]] : []),
    ...(!credit && invoice.dueDays !== null ? [['Betalningsvillkor', `${invoice.dueDays} dagar netto`] as [string, string]] : []),
  ];
  w.rule(w.y + 8);
  const refWidth = (RIGHT - MARGIN) / Math.max(references.length, 1);
  references.forEach(([label, value], index) => {
    const x = MARGIN + index * refWidth;
    w.text(label, x, { size: 7.5, color: INK_2 });
    w.text(wrap(value, fonts.bold, 9, refWidth - 8)[0], x, { y: w.y - 12, bold: true });
  });
  w.y -= 24;
  w.rule(w.y + 4);
  w.y -= 22;

  // ── Rader ──
  const col = { title: MARGIN, sku: 300, qty: 395, unit: 470, amount: RIGHT };
  const header = () => {
    w.text('Beskrivning', col.title, { size: 8, bold: true, color: INK_2 });
    w.text('Art.nr', col.sku, { size: 8, bold: true, color: INK_2 });
    w.text('Antal', col.qty, { size: 8, bold: true, color: INK_2, align: 'right' });
    w.text('À-pris', col.unit, { size: 8, bold: true, color: INK_2, align: 'right' });
    w.text('Belopp', col.amount, { size: 8, bold: true, color: INK_2, align: 'right' });
    w.y -= 6;
    w.rule();
    w.y -= 14;
  };
  header();
  for (const line of invoice.lines) {
    const titleLines = wrap(line.title, fonts.regular, 9, col.sku - col.title - 12);
    if (w.ensure(titleLines.length * 11 + 6)) header();
    w.text(titleLines[0], col.title);
    w.text(line.sku ?? '', col.sku, { color: INK_2 });
    w.text(String(line.quantity), col.qty, { align: 'right' });
    w.text(money(sign * line.unitAmountMinor), col.unit, { align: 'right' });
    w.text(money(sign * line.amountMinor), col.amount, { align: 'right' });
    for (const extra of titleLines.slice(1)) {
      w.y -= 11;
      w.text(extra, col.title);
    }
    w.y -= 16;
  }
  w.rule(w.y + 8);

  // ── Summor ──
  const totals: Array<[string, number, boolean]> = [
    ['Varor', invoice.goodsMinor, false],
    ...(invoice.discountMinor ? [['Rabatt', -invoice.discountMinor, false] as [string, number, boolean]] : []),
    ...(invoice.shippingMinor ? [['Frakt', invoice.shippingMinor, false] as [string, number, boolean]] : []),
    ['Summa exkl. moms', invoice.netMinor, false],
    [`Moms ${(invoice.vatBps / 100).toLocaleString('sv-SE')} %`, invoice.taxMinor, false],
  ];
  w.ensure(totals.length * 14 + 40);
  w.y -= 6;
  for (const [label, amount] of totals) {
    w.text(label, col.unit, { align: 'right', color: INK_2 });
    w.text(money(sign * amount), col.amount, { align: 'right' });
    w.y -= 14;
  }
  w.y -= 2;
  w.rule(w.y + 10, col.qty - 40);
  const totalText = `${money(sign * invoice.totalMinor)} ${invoice.currency.toUpperCase()}`;
  // Rubriken ställs mot beloppets vänsterkant, så att ett stort belopp aldrig
  // skriver över den.
  const totalWidth = fonts.bold.widthOfTextAtSize(clean(totalText), 11);
  w.text(credit ? 'Att återbetala' : 'Att betala', col.amount - totalWidth - 14, { align: 'right', bold: true, size: 11 });
  w.text(totalText, col.amount, { align: 'right', bold: true, size: 11 });
  w.y -= 30;

  // ── Meddelande ──
  if (invoice.memo) {
    const memoLines = wrap(invoice.memo, fonts.regular, 9, RIGHT - MARGIN);
    w.ensure(memoLines.length * 12 + 10);
    for (const line of memoLines) {
      w.text(line, MARGIN);
      w.y -= 12;
    }
    w.y -= 8;
  }

  // ── Betalning ──
  if (!credit) {
    w.ensure(90);
    const boxHeight = 50;
    w.page.drawRectangle({ x: MARGIN, y: w.y - boxHeight + 12, width: RIGHT - MARGIN, height: boxHeight, color: PANEL });
    const cells: Array<[string, string]> = [
      [seller.bankgiro ? 'Bankgiro' : 'Bankkonto', seller.bankgiro ?? seller.bankAccount ?? ''],
      ['OCR-nummer', invoice.ocr ?? ''],
      ['Förfallodag', invoice.dueOn ?? ''],
      ['Att betala', `${money(invoice.totalMinor)} ${invoice.currency.toUpperCase()}`],
    ];
    const cellWidth = (RIGHT - MARGIN - 20) / cells.length;
    cells.forEach(([label, value], index) => {
      const x = MARGIN + 10 + index * cellWidth;
      w.text(label, x, { size: 7.5, color: INK_2 });
      w.text(value, x, { y: w.y - 18, size: 12, bold: true });
    });
    w.y -= boxHeight + 10;
    const terms = [
      `Ange OCR-numret som referens när ni betalar. Betalningsvillkor ${invoice.dueDays ?? 30} dagar netto från fakturadatum.`,
      'Vid försenad betalning utgår dröjsmålsränta enligt räntelagen (referensränta + 8 procentenheter).',
    ];
    for (const line of terms.flatMap(text => wrap(text, fonts.regular, 8, RIGHT - MARGIN))) {
      w.text(line, MARGIN, { size: 8, color: INK_2 });
      w.y -= 11;
    }
  } else {
    const lines = wrap(
      `Kreditfakturan krediterar faktura ${invoice.creditsNumber ?? ''}. Beloppet betalas tillbaka till ert konto.`,
      fonts.regular,
      8.5,
      RIGHT - MARGIN
    );
    for (const line of lines) {
      w.text(line, MARGIN, { size: 8.5, color: INK_2 });
      w.y -= 11;
    }
  }

  // Sidnummer när fakturan blev längre än en sida.
  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((page, index) => {
      const label = `Sida ${index + 1} av ${pages.length}`;
      page.drawText(label, {
        x: RIGHT - fonts.regular.widthOfTextAtSize(label, 7.5),
        y: 84,
        size: 7.5,
        font: fonts.regular,
        color: INK_2,
      });
    });
  }

  return doc.save({ useObjectStreams: false });
}
