/**
 * Adresser som flyttat.
 *
 * Handlen är adressen. Byter man handle i /admin dör den gamla länken, och den
 * ligger kvar i sökmotorer, nyhetsbrev och bokmärken. Före den här filen fanns
 * bara två handskrivna undantag i `next.config.ts`, som dessutom krävde en
 * deploy för att ändra.
 *
 * Två designval är värda att veta om:
 *
 * 1. **Läses bara vid en miss.** Uppslaget sker där sidan annars hade anropat
 *    `notFound()`, inte i proxyn. En omdirigeringstabell som frågas på varje
 *    sidvisning hade lagt en databasrundtur på varje produktsida för att lösa
 *    ett problem som rör de få adresser som faktiskt bytt.
 * 2. **Kedjor skrivs om, inte staplas.** Byter en produkt handle två gånger
 *    pekas den första omdirigeringen om till det nya målet direkt. Annars blir
 *    det två hopp för besökaren, och sökmotorer följer inte kedjor hur långt
 *    som helst.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export type RedirectKind = 'product' | 'collection';

function pathFor(kind: RedirectKind, handle: string): string {
  return kind === 'product' ? `/products/${handle}` : `/collections/${handle}`;
}

function configured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Skriver omdirigeringen efter ett handle-byte.
 *
 * Sväljer sina egna fel: ett byte som lyckats i databasen ska inte rullas
 * tillbaka för att spåret inte kunde skrivas — då hade produkten fått sin nya
 * handle ändå, och felet bara blivit svårare att förstå.
 */
export async function recordHandleChange(
  kind: RedirectKind,
  fromHandle: string,
  toHandle: string,
  actor?: string
): Promise<void> {
  if (!configured()) return;
  if (!fromHandle || !toHandle || fromHandle === toHandle) return;

  const from = pathFor(kind, fromHandle);
  const to = pathFor(kind, toHandle);

  try {
    await getDb().execute(sql`
      with cleared as (
        -- Den nya adressen får inte samtidigt vara en gammal som pekar bort.
        -- Utan det här hamnar en handle som återanvänds i en slinga.
        delete from url_redirects where from_path = ${to}
      ), rechained as (
        -- a→b när b→c skapas ska bli a→c, inte två hopp.
        update url_redirects set to_path = ${to}
        where to_path = ${from} and from_path <> ${to}
      )
      insert into url_redirects (from_path, to_path, kind, created_by)
      values (${from}, ${to}, ${kind}, ${actor ?? null})
      on conflict (from_path) do update
        set to_path = excluded.to_path,
            created_at = now(),
            created_by = excluded.created_by
    `);
  } catch (error) {
    console.error('[redirects] Kunde inte skriva omdirigeringen:', error);
  }
}

/**
 * Målet för en flyttad adress, eller null.
 *
 * Anropas i 404-läget, så den får kosta en fråga. Räknaren skrivs samtidigt —
 * en omdirigering som aldrig träffas kan städas bort, och en som träffas ofta
 * säger att länken lever någonstans där ute.
 */
export async function resolveRedirect(path: string): Promise<string | null> {
  if (!configured()) return null;
  try {
    const result = await getDb().execute(sql`
      update url_redirects
         set hits = hits + 1, last_hit_at = now()
       where from_path = ${path}
      returning to_path
    `);
    const row = result.rows[0] as { to_path?: string } | undefined;
    return row?.to_path ?? null;
  } catch (error) {
    console.error('[redirects] Kunde inte slå upp omdirigeringen:', error);
    return null;
  }
}

/** Målet för en produkt- eller kategorihandle som inte längre finns. */
export async function resolveHandleRedirect(
  kind: RedirectKind,
  handle: string
): Promise<string | null> {
  return resolveRedirect(pathFor(kind, handle));
}

export type RedirectRow = {
  id: number;
  fromPath: string;
  toPath: string;
  kind: string;
  hits: number;
  lastHitAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

export async function listRedirects(limit = 200): Promise<RedirectRow[]> {
  if (!configured()) return [];
  const result = await getDb().execute(sql`
    select id, from_path, to_path, kind, hits, last_hit_at, created_by, created_at
      from url_redirects
     order by created_at desc
     limit ${limit}
  `);
  return (result.rows as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    fromPath: String(row.from_path),
    toPath: String(row.to_path),
    kind: String(row.kind),
    hits: Number(row.hits),
    lastHitAt: row.last_hit_at ? new Date(row.last_hit_at as string) : null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  }));
}

export async function deleteRedirect(id: number): Promise<boolean> {
  if (!configured()) return false;
  const result = await getDb().execute(sql`
    delete from url_redirects where id = ${id} returning id
  `);
  return result.rows.length > 0;
}
