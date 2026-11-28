/**
 * §11: företag och webbkonton i admin.
 * - En e-postadress har ett webbkonto. En upptagen adress ger ett begripligt
 *   fel och ingen kontaktperson i onödan (plan.md, C2).
 * - Ett företag med obetalda fakturor går inte att radera (§11.11, B6, C3).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

vi.mock('@/lib/mailer', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/mailer')>()),
  mailConfigured: () => true,
  sendEmail: vi.fn(async () => ({ success: true, messageId: 'test' })),
}));

import { getDb } from '@/lib/db';
import { clientContacts, clients } from '@/lib/db/schema';
import { AccountEmailTakenError, createCustomer } from '@/lib/commerceOperations';
import { ClientHasUnpaidInvoicesError, deleteClientsWithAccounts } from '@/lib/clientsDb';
import { createManualInvoice } from '@/lib/manualInvoice';
import { createProduct, createVariant } from '@/lib/productsDb';

let variantId: number;

async function company(name: string) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [row] = await getDb()
    .insert(clients)
    .values({ customerNo: `K${stamp}`, name, addressLine1: 'Gatan 1', postalCode: '111 11', city: 'Stockholm' })
    .returning();
  return row;
}

beforeAll(async () => {
  process.env.INVOICE_BANKGIRO = '5673-8776';
  const product = await createProduct({ title: `Företag ${Date.now()}`, status: 'active' });
  const variant = await createVariant(product.id, {
    sku: `FTG-${Date.now()}`,
    priceMinor: 10_000,
    inventoryTracked: false,
    availableForSale: true,
    optionValues: [{ name: 'Storlek', value: 'En' }],
  });
  variantId = variant.id;
});

describe('webbkonto', () => {
  it('med en upptagen e-post ger ett fel och ingen ny kontaktperson', async () => {
    const email = `upptagen-${Date.now()}@foretag.test`;
    const first = await company('Första AB');
    await createCustomer(first.id, { email, firstName: 'Anna' });

    const second = await company('Andra AB');
    await expect(createCustomer(second.id, { email, firstName: 'Bo' })).rejects.toBeInstanceOf(AccountEmailTakenError);
    const contacts = await getDb().select().from(clientContacts).where(eq(clientContacts.clientId, second.id));
    expect(contacts).toHaveLength(0);
  });
});

describe('radera företag', () => {
  it('vägras när företaget har en obetald faktura', async () => {
    const client = await company('Obetalda AB');
    await createManualInvoice(
      {
        clientId: client.id,
        recipient: {
          email: 'ekonomi@obetalda.test',
          companyName: 'Obetalda AB',
          organizationNumber: '556234-5677',
          address: { line1: 'Gatan 1', line2: '', postalCode: '111 11', city: 'Stockholm' },
        },
        reference: '',
        purchaseOrder: '',
        lines: [{ variantId, quantity: 1, unitAmountMinor: null }],
        shipping: { mode: 'none' },
        daysUntilDue: 30,
        memo: '',
        note: '',
      },
      'Gabriel'
    );
    await expect(deleteClientsWithAccounts([client.id])).rejects.toBeInstanceOf(ClientHasUnpaidInvoicesError);
    const [still] = await getDb().execute(sql`select 1 from clients where id = ${client.id}`).then(r => r.rows);
    expect(still).toBeTruthy();
  });

  it('går när företaget inte har några obetalda fakturor', async () => {
    const client = await company('Skuldfria AB');
    expect((await deleteClientsWithAccounts([client.id])).clients).toBe(1);
  });
});
