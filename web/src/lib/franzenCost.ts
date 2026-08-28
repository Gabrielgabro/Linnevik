/**
 * Vilket inköpspris en Franzén-variant räknas mot.
 *
 * Det finns två tal, och de är inte utbytbara. Artikelfilen
 * (`src/data/franzenArticles.ts`) bär priset vi fick när filen togs emot — ett
 * listat pris, samma för alla. Det verkliga priset är det vi förhandlat fram,
 * och det ligger bara bakom Franzéns inloggning: det går inte att generera hit,
 * utan skrivs in för hand per variant i /admin/franzen och sparas på raden.
 *
 * Regeln är därför enkel: finns ett handskrivet pris gäller det, annars
 * artikelfilens. Marginalen ska räknas mot vad varan faktiskt kostar oss, inte
 * mot vad den kostade i den senast mottagna prislistan.
 */

import { articleForSku } from '@/data/franzenArticles';

type CostBearing = { sku: string; supplierCostMinor: number | null };

/** Artikelfilens listade inköpspris i SEK/st, eller null för en obelagd variant. */
export const listCostOf = (sku: string): number | null => articleForSku(sku)?.inköpspris ?? null;

/** Det förhandlade priset i SEK/st, eller null när inget är angivet. */
export const negotiatedCostOf = (variant: CostBearing): number | null =>
  variant.supplierCostMinor === null ? null : variant.supplierCostMinor / 100;

/** Priset marginalen mäts mot: det förhandlade om det finns, annars artikelfilens. */
export const costOf = (variant: CostBearing): number | null =>
  negotiatedCostOf(variant) ?? listCostOf(variant.sku);
