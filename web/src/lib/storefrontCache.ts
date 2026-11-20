/**
 * Cachen för butikens sidor.
 *
 * Butikens sidor förrenderas och ligger i Vercels cache (ISR). Katalogdata som
 * används av dynamiska sidor, till exempel kategorisidorna som läser
 * `?page=`, cachas med `unstable_cache` under taggen `catalog`.
 *
 * Priser och texter ska slå igenom direkt när de ändras i /admin. Därför tömmer
 * varje ändring i admin som syns i butiken hela butikens cache. Det är grovt,
 * men katalogen ändras sällan och en tom cache fylls på vid nästa besök.
 * Tömningen körs från `record()` i adminActivity.ts, som varje sådan ändring
 * redan passerar.
 */

import { revalidatePath, revalidateTag } from 'next/cache';

export const CATALOG_TAG = 'catalog';

/** Töm butikens sidor och katalogdata. Nästa besök renderar om med färsk data. */
export function revalidateStorefront(): void {
  try {
    // Alla sidor under butikens rot-layout, plus sitemapen.
    revalidatePath('/[locale]', 'layout');
    revalidatePath('/sitemap.xml');
    // `expire: 0` betyder att datan kastas direkt. Med 'max' skulle nästa
    // besökare först få den gamla versionen (stale-while-revalidate), och det
    // vill vi inte ha för priser.
    revalidateTag(CATALOG_TAG, { expire: 0 });
  } catch (error) {
    // Anropet görs efter att ändringen redan är sparad, så det får inte göra om
    // en lyckad ändring till ett fel. Om det misslyckas byggs sidorna ändå om
    // inom 60 sekunder (se `revalidate` i app/[locale]/layout.tsx).
    console.error('Kunde inte tömma butikens cache:', error);
  }
}
