// GENERERAD FIL — redigera inte för hand.
// Källa: catalog/beställningar/2026/prisanalys.csv
// Kör: node scripts/build-landed-cost.mjs

export type LandedCostProduct = {
  description: string;
  title: string;
  handle: string;
  skuPrefix: string;
  /** "confirmed" = mappningen mot Shopify är belagd, "likely" = sannolik men overifierad. */
  confidence: string;
  qty: number;
  cbm: number;
  /** Betald varukostnad inkl. andel av bankavgift, SEK per styck. */
  goodsPerPcs: number;
  freightPerPcs: number;
  dutyPerPcs: number;
  /** Landad kostnad för hela raden, SEK. */
  lineTotalSek: number;
};

export const shipment = {
  "goodsInvoiceNo": "HTL26-01",
  "freightInvoiceNo": "145114926002708",
  "bankRef": "14461098825 HC",
  "invoicedUsd": 5244.65,
  "paidUsd": 3671,
  "fx": 9.43055,
  "qty": 821,
  "cbm": 7.79,
  "landedTotalSek": 56867.73,
  "upliftPct": 64
} as const;

export const products: LandedCostProduct[] = [
  {
    "description": "DOWN DUVET",
    "title": "Täcke - Sebastian",
    "handle": "tacke-sebastian",
    "skuPrefix": "TAC-SEB",
    "confidence": "confirmed",
    "qty": 15,
    "cbm": 0.17,
    "goodsPerPcs": 351,
    "freightPerPcs": 26,
    "dutyPerPcs": 43.78,
    "lineTotalSek": 6311.61
  },
  {
    "description": "POLY DUVET",
    "title": "Täcke - Daniel",
    "handle": "tacke-daniel",
    "skuPrefix": "TAC-DAN",
    "confidence": "confirmed",
    "qty": 80,
    "cbm": 1.26,
    "goodsPerPcs": 78.99,
    "freightPerPcs": 36.14,
    "dutyPerPcs": 9.85,
    "lineTotalSek": 9998.86
  },
  {
    "description": "MATTRESS TOPPER",
    "title": "Madrasskydd",
    "handle": "madrasskydd",
    "skuPrefix": "MAD",
    "confidence": "likely",
    "qty": 160,
    "cbm": 1.8,
    "goodsPerPcs": 51.85,
    "freightPerPcs": 25.81,
    "dutyPerPcs": 6.47,
    "lineTotalSek": 13462.42
  },
  {
    "description": "DOWN PILLOW",
    "title": "Kudde Sigrid",
    "handle": "kudde-premium",
    "skuPrefix": "KUD-SIG",
    "confidence": "confirmed",
    "qty": 16,
    "cbm": 0.16,
    "goodsPerPcs": 285.07,
    "freightPerPcs": 22.95,
    "dutyPerPcs": 35.55,
    "lineTotalSek": 5497.21
  },
  {
    "description": "POLY PILLOW",
    "title": "Kudde Eric",
    "handle": "standard-kudde",
    "skuPrefix": "KUD-ERI",
    "confidence": "confirmed",
    "qty": 250,
    "cbm": 4.28,
    "goodsPerPcs": 27.86,
    "freightPerPcs": 39.28,
    "dutyPerPcs": 3.47,
    "lineTotalSek": 17653.16
  },
  {
    "description": "PILLOW SHELL",
    "title": "Kuddskydd",
    "handle": "kuddeskydd",
    "skuPrefix": "KSK",
    "confidence": "likely",
    "qty": 300,
    "cbm": 0.12,
    "goodsPerPcs": 10.88,
    "freightPerPcs": 0.92,
    "dutyPerPcs": 1.36,
    "lineTotalSek": 3944.47
  }
];

export const landedPerPcs = (p: LandedCostProduct) =>
  p.goodsPerPcs + p.freightPerPcs + p.dutyPerPcs;

export const lineTotal = (p: LandedCostProduct) => p.lineTotalSek;
