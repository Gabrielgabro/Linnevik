/**
 * Databasfrågorna för säljregistret. Skilt från clients.ts därför att den
 * filen importeras av klientkomponenter — låg den här skulle Neon-drivrutinen
 * följa med ut i webbläsarpaketet.
 */

import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ClientWithCounts } from '@/lib/clients';
import { clientContacts, clients, type ClientContactRow, type ClientRow } from '@/lib/db/schema';

export function clientsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Hela listan med sammanräknade kontaktsiffror. Aggregatet görs i databasen
 * i stället för med en fråga per kund — listan är ett par hundra rader och
 * ska renderas i ett svep.
 */
export async function listClients(): Promise<ClientWithCounts[]> {
  if (!clientsConfigured()) return [];
  const rows = await getDb()
    .select({
      client: clients,
      contactCount: sql<number>`count(${clientContacts.id})::int`,
      workedCount: sql<number>`count(${clientContacts.id}) filter (where ${clientContacts.status} <> 'Ej kontaktad')::int`,
      lastContactedAt: sql<string | null>`max(${clientContacts.lastContactedAt})::text`,
    })
    .from(clients)
    .leftJoin(clientContacts, eq(clientContacts.clientId, clients.id))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  return rows.map(r => ({
    ...r.client,
    contactCount: r.contactCount,
    workedCount: r.workedCount,
    lastContactedAt: r.lastContactedAt,
  }));
}

export async function getClient(
  id: number
): Promise<{ client: ClientRow; contacts: ClientContactRow[] } | null> {
  if (!clientsConfigured()) return null;
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) return null;
  const contacts = await db
    .select()
    .from(clientContacts)
    .where(eq(clientContacts.clientId, id))
    .orderBy(asc(clientContacts.id));
  return { client, contacts };
}

/** Kundnummer för nya kunder som inte kommer ur arkivlistan. */
export async function nextCustomerNo(): Promise<string> {
  if (!clientsConfigured()) return '1000';
  const [row] = await getDb()
    .select({
      // Bara rent numeriska kundnummer räknas — arkivlistan innehöll även
      // sådant som "XTEST", och de ska inte kunna dra numreringen med sig.
      max: sql<number | null>`max(case when ${clients.customerNo} ~ '^[0-9]+$'
        then ${clients.customerNo}::bigint end)`,
    })
    .from(clients);
  return String(Math.max(Number(row?.max ?? 0), 1000) + 1);
}
