/**
 * §11.3–11.5, §11.7: ett enda företagsregister. Tvätterikund är en tagg som
 * styr ingenting, säljstatusen säger aldrig om företaget är kund, och ett
 * org-nummer hör till högst ett företag (A13, A14, A15).
 */

import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { clientContacts, clients, customers } from '@/lib/db/schema';
import { OrgNumberLockedError, registerCustomer, saveCompanyProfile } from '@/lib/commerceOperations';
import { parseClientInput } from '@/lib/clientsInput';
import { CLIENT_STATUSES } from '@/lib/clients';

// Giltiga svenska org-nummer (kontrollsiffran stämmer).
const ORG_A = '5560160680';
const ORG_B = '5564813318';
const address = { line1: 'Storgatan 1', line2: null, postal_code: '111 20', city: 'Stockholm', state: null, country: 'SE' };

async function accountClient(email: string) {
  const [row] = await getDb()
    .select({ clientId: customers.clientId })
    .from(customers)
    .where(sql`lower(${customers.email}) = ${email}`);
  return row?.clientId ?? null;
}

describe('företagsregistret', () => {
  it('har gjort tvätteriets lista till taggade företag utan kundstatus', async () => {
    const columns = await getDb().execute(sql`
      select column_name from information_schema.columns
       where table_name = 'clients' and column_name in ('kind', 'tags')`);
    expect(columns.rows.map(row => (row as { column_name: string }).column_name)).toEqual(['tags']);

    const statuses = await getDb().execute(sql`select distinct status from clients`);
    for (const { status } of statuses.rows as { status: string }[]) {
      expect(CLIENT_STATUSES as readonly string[]).toContain(status);
    }
    const [laundry] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(sql`'Tvätterikund' = any(${clients.tags})`);
    expect(laundry.n).toBeGreaterThan(0);
  });

  it('sparar taggen från formulärets kryssruta och tar bort den igen', () => {
    const base = { customerNo: '9001', name: 'Hotell Test AB' };
    expect(parseClientInput({ ...base, laundry: '1' }).tags).toEqual(['Tvätterikund']);
    expect(parseClientInput({ ...base, laundry: '0' }).tags).toEqual([]);
    expect(parseClientInput({ ...base, tags: ['Tvätterikund', 'Okänd'] }).tags).toEqual(['Tvätterikund']);
    expect(parseClientInput(base).status).toBe('Prospekt');
  });

  it('tillåter inte två företag med samma org-nummer', async () => {
    await getDb().insert(clients).values({ customerNo: `U${Date.now()}`, name: 'Först AB', orgNumber: `SE${ORG_A}01` });
    await expect(
      getDb().insert(clients).values({ customerNo: `V${Date.now()}`, name: 'Sen AB', orgNumber: `SE${ORG_A}01` })
    ).rejects.toThrow();
  });

  it('kopplar inte ett webbkonto via kontaktpersonens e-post när org-numret är ett annat', async () => {
    const email = `a15-${Date.now()}@test.linnevik.se`;
    const [laundry] = await getDb()
      .insert(clients)
      .values({ customerNo: `L${Date.now()}`, name: 'Tvätterikunden AB', tags: ['Tvätterikund'] })
      .returning();
    await getDb().insert(clientContacts).values({ clientId: laundry.id, firstName: 'Eva', email });

    const result = await registerCustomer({
      email,
      firstName: 'Eva',
      lastName: 'Ek',
      taxId: ORG_B,
      companyName: 'Annat Bolag AB',
      address,
    });
    expect(result.status).toBe('created');

    const clientId = await accountClient(email);
    expect(clientId).not.toBe(laundry.id);
    const [company] = await getDb().select().from(clients).where(eq(clients.id, clientId!));
    expect(company.orgNumber).toBe(`SE${ORG_B}01`);
    // Ett nytt företag från webben får ingen tagg och ingen påhittad status.
    expect(company.tags).toEqual([]);
    expect(company.status).toBe('Prospekt');

    // Den taggade tvätterikunden är orörd.
    const [after] = await getDb().select().from(clients).where(eq(clients.id, laundry.id));
    expect(after.tags).toEqual(['Tvätterikund']);
  });

  it('kopplar två anställda med samma org-nummer till samma företag', async () => {
    const stamp = Date.now();
    await registerCustomer({ email: `a-${stamp}@test.linnevik.se`, firstName: 'A', taxId: `${ORG_B}`, companyName: 'Annat Bolag AB', address });
    await registerCustomer({ email: `b-${stamp}@test.linnevik.se`, firstName: 'B', taxId: `556481-3318`, companyName: 'Annat Bolag AB', address });
    expect(await accountClient(`a-${stamp}@test.linnevik.se`)).toBe(await accountClient(`b-${stamp}@test.linnevik.se`));
  });

  it('låter inte ett webbkonto byta företagets org-nummer', async () => {
    const email = `lås-${Date.now()}@test.linnevik.se`;
    await registerCustomer({ email, firstName: 'C', taxId: ORG_A, companyName: 'Låst AB', address });
    const [account] = await getDb().select().from(customers).where(sql`lower(${customers.email}) = ${email}`);

    await expect(
      saveCompanyProfile(account.id, { companyName: 'Låst AB', organizationNumber: `SE${ORG_B}01`, address })
    ).rejects.toBeInstanceOf(OrgNumberLockedError);

    // Samma nummer går bra, och namn och adress sparas som vanligt.
    await saveCompanyProfile(account.id, { companyName: 'Låst & Co AB', organizationNumber: `SE${ORG_A}01`, address });
    const [company] = await getDb().select().from(clients).where(eq(clients.id, account.clientId));
    expect(company).toMatchObject({ name: 'Låst & Co AB', orgNumber: `SE${ORG_A}01` });
  });
});
