/**
 * Databasfrågorna för säljregistret. Skilt från clients.ts därför att den
 * filen importeras av klientkomponenter — låg den här skulle Neon-drivrutinen
 * följa med ut i webbläsarpaketet.
 */

import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { ClientWithCounts } from '@/lib/clients';
import type { PortalAccount } from '@/lib/portalAccounts';
import {
  clientContacts,
  clients,
  customerLoginTokens,
  customers,
  orders,
  type ClientContactRow,
  type ClientRow,
  type CustomerRow,
  type OrderRow,
} from '@/lib/db/schema';

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
      commerceCustomerCount: sql<number>`(
        select count(*)::int from ${customers} c where c.client_id = ${clients.id}
      )`,
      orderCount: sql<number>`(
        select count(*)::int from ${orders} o
        inner join ${customers} c on c.id = o.customer_id
        where c.client_id = ${clients.id}
      )`,
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
    commerceCustomerCount: r.commerceCustomerCount,
    orderCount: r.orderCount,
    lastContactedAt: r.lastContactedAt,
  }));
}

export async function getClient(
  id: number
): Promise<{
  client: ClientRow;
  contacts: ClientContactRow[];
  commerceCustomers: CustomerRow[];
  orders: OrderRow[];
} | null> {
  if (!clientsConfigured()) return null;
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) return null;
  const [contacts, commerceCustomers, clientOrders] = await Promise.all([
    db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, id))
      .orderBy(asc(clientContacts.id)),
    db.select().from(customers).where(eq(customers.clientId, id)).orderBy(asc(customers.email)),
    db
      .select({ order: orders })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(customers.clientId, id))
      .orderBy(desc(orders.createdAt)),
  ]);
  return { client, contacts, commerceCustomers, orders: clientOrders.map(row => row.order) };
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

/**
 * Alla konton i inloggningsportalen. Ordnade på nyast först — det är den nya
 * registreringen man kommer hit för att titta på, inte den äldsta.
 *
 * Ordersiffrorna och senaste inloggningen räknas som underfrågor i stället för
 * joins: en join mot både ordrar och tokens skulle multiplicera raderna med
 * varandra, och listan är i storleksordningen hundratals konton.
 */
export async function listPortalAccounts(): Promise<PortalAccount[]> {
  if (!clientsConfigured()) return [];
  const rows = await getDb()
    .select({
      id: customers.id,
      email: customers.email,
      firstName: customers.firstName,
      lastName: customers.lastName,
      company: customers.company,
      phone: customers.phone,
      taxId: customers.taxId,
      status: customers.status,
      createdAt: sql<string>`${customers.createdAt}::text`,
      clientId: customers.clientId,
      clientName: clients.name,
      customerNo: customers.customerNo,
      stripeCustomerId: customers.stripeCustomerId,
      shopifyCustomerId: customers.shopifyCustomerId,
      orderCount: sql<number>`(
        select count(*)::int from ${orders} o where o.customer_id = ${customers.id}
      )`,
      spendMinor: sql<number>`(
        select coalesce(sum(o.total_minor), 0)::int from ${orders} o
        where o.customer_id = ${customers.id}
      )`,
      lastOrderAt: sql<string | null>`(
        select max(o.created_at)::text from ${orders} o where o.customer_id = ${customers.id}
      )`,
      lastLoginAt: sql<string | null>`(
        select max(t.consumed_at)::text from ${customerLoginTokens} t
        where t.customer_id = ${customers.id} and t.consumed_at is not null
      )`,
    })
    .from(customers)
    .innerJoin(clients, eq(clients.id, customers.clientId))
    .orderBy(desc(customers.createdAt));

  return rows;
}

/**
 * Tar bort kunder ur båda registren: företagsposten och de webbkonton som
 * hänger på den.
 *
 * Webbkontona måste raderas i ett eget steg — främmande nyckeln
 * customers.client_id är RESTRICT, och den kontrollen går inte att komma runt
 * genom att radera båda i samma sats. De två satserna körs som en batch, vilket
 * neon kör i en transaktion: antingen försvinner företaget med sina konton,
 * eller ingenting.
 *
 * Ordrarna står kvar. Order-raden pekar på kunden med ON DELETE SET NULL och
 * bär köparens namn, adress och org-nummer som de såg ut vid köpet — en
 * bokförd order får inte försvinna för att någon städar i kundregistret.
 * Detsamma gäller provbeställningar och rabattinlösen; inloggningslänkarna
 * däremot följer med kontot (CASCADE), och det är just det som är "nollställ
 * inloggningen".
 */
export async function deleteClientsWithAccounts(
  ids: number[]
): Promise<{ clients: number; accounts: number }> {
  if (!clientsConfigured() || ids.length === 0) return { clients: 0, accounts: 0 };
  const db = getDb();
  const [removedAccounts, removedClients] = await db.batch([
    db.delete(customers).where(inArray(customers.clientId, ids)).returning({ id: customers.id }),
    db.delete(clients).where(inArray(clients.id, ids)).returning({ id: clients.id }),
  ]);
  return { clients: removedClients.length, accounts: removedAccounts.length };
}

/**
 * Tar bort ett enskilt webbkonto. Företaget står kvar i tvätterikundregistret
 * — kontot är inloggningen, inte kunden.
 */
export async function deletePortalAccount(id: number): Promise<CustomerRow | null> {
  if (!clientsConfigured()) return null;
  const [row] = await getDb().delete(customers).where(eq(customers.id, id)).returning();
  return row ?? null;
}
