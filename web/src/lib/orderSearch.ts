/**
 * Sökningen i orderlistan, som ren funktion.
 *
 * Det man har framför sig när man letar efter en order är oftast något ur
 * bankens kontoutdrag — ett OCR-nummer som "1248" — eller ett namn, en
 * e-postadress eller ett organisationsnummer. En sifferföljd kan vara både
 * ett ordernummer och ett OCR-nummer (1248 är OCR för order 12, men kanske
 * också order 1248), så båda kandidaterna tas med och listan visar vilken
 * som träffade på OCR.
 */

import { orderIdFromOcr } from '@/lib/invoicePayment';

export type OrderSearch = {
  /** Texten som den skrevs, trimmad — för fritextsökning och för att visa. */
  text: string;
  /** Ordernummer att träffa exakt: siffrorna som ordernummer och/eller som OCR. */
  ids: number[];
  /** Ordern som sökningen pekar ut som OCR-nummer, om den gör det. */
  ocrOrderId: number | null;
  /** Mönster för ILIKE, med %, _ och \ escapade. */
  pattern: string;
};

/** Största id som ryms i en Postgres `integer`. */
const MAX_ORDER_ID = 2_147_483_647;

export function parseOrderSearch(raw: string | string[] | undefined | null): OrderSearch | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const text = (value ?? '').trim().slice(0, 100);
  if (!text) return null;

  const ids = new Set<number>();
  let ocrOrderId: number | null = null;
  // "#12", "12", "1248", "12 48" och "12-48" räknas som siffror.
  const digits = text.replace(/^#/, '').replace(/[\s-]/g, '');
  if (/^\d{1,25}$/.test(digits)) {
    const asId = Number(digits);
    if (Number.isSafeInteger(asId) && asId >= 1 && asId <= MAX_ORDER_ID) ids.add(asId);
    ocrOrderId = orderIdFromOcr(digits);
    if (ocrOrderId !== null && ocrOrderId <= MAX_ORDER_ID) ids.add(ocrOrderId);
    else ocrOrderId = null;
  }

  return {
    text,
    ids: [...ids],
    ocrOrderId,
    pattern: `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`,
  };
}
