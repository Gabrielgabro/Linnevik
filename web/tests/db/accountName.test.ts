/**
 * §7.3: webbkontots namn är personens namn och skrivs aldrig över med
 * firmanamnet. Tidigare gjorde varje fakturaköp personen till "firman", och
 * nästa fakturaköp stoppades av §7.2 (A1).
 */

import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { upsertCustomerFromCheckout } from '@/lib/commerceOperations';

const ORG = '5564813318';

async function accountName(id: number) {
  const result = await getDb().execute(sql`select first_name, last_name from customers where id = ${id}`);
  return result.rows[0] as { first_name: string | null; last_name: string | null };
}

describe('webbkontots namn', () => {
  it('står kvar när fakturavägarna skickar firmanamnet', async () => {
    const email = `a1-${Date.now()}@test.linnevik.se`;

    // Kortköpet: Stripe ger personens namn.
    const id = (await upsertCustomerFromCheckout({
      email,
      name: 'Anna Svensson',
      taxId: { type: 'eu_vat', value: ORG },
    })) as number;
    expect(await accountName(id)).toEqual({ first_name: 'Anna', last_name: 'Svensson' });

    // Fakturaköpet och betalningen av fakturan skickar firmanamnet som namn.
    for (let purchase = 0; purchase < 2; purchase += 1) {
      const again = await upsertCustomerFromCheckout({
        email,
        name: 'Hotell Testviken AB',
        taxId: { type: 'eu_vat', value: ORG },
      });
      expect(again).toBe(id);
      expect(await accountName(id)).toEqual({ first_name: 'Anna', last_name: 'Svensson' });
    }
  });

  it('fylls i när kontot saknar namn', async () => {
    const email = `a1-tomt-${Date.now()}@test.linnevik.se`;
    const id = (await upsertCustomerFromCheckout({ email, name: null })) as number;
    expect(await accountName(id)).toEqual({ first_name: null, last_name: null });

    await upsertCustomerFromCheckout({ email, name: 'Bo Ek' });
    expect(await accountName(id)).toEqual({ first_name: 'Bo', last_name: 'Ek' });
  });
});
