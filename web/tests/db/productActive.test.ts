/**
 * §1.9: en produkt har en enda inställning, status. `active` är en kopia som
 * aldrig får säga något annat (A20). Kolumnen räknas av databasen (0045).
 */

import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { createProduct, updateProduct } from '@/lib/productsDb';
import { parseProductInput } from '@/lib/productsInput';

async function state(id: number) {
  const [row] = await getDb()
    .select({ status: products.status, active: products.active })
    .from(products)
    .where(eq(products.id, id));
  return row;
}

describe('produktens status och active', () => {
  it('följs åt genom hela livet', async () => {
    const created = await createProduct({ title: `A20 ${Date.now()}`, status: 'draft' });
    expect(await state(created.id)).toEqual({ status: 'draft', active: false });

    await updateProduct(created.id, { status: 'active' });
    expect(await state(created.id)).toEqual({ status: 'active', active: true });

    await updateProduct(created.id, { status: 'archived' });
    expect(await state(created.id)).toEqual({ status: 'archived', active: false });
  });

  it('gör ett äldre anrop med bara active till en statusändring', async () => {
    const created = await createProduct({ title: `A20 äldre ${Date.now()}` });
    expect(await state(created.id)).toEqual({ status: 'active', active: true });

    await updateProduct(created.id, parseProductInput({ active: false }, { partial: true }));
    expect(await state(created.id)).toEqual({ status: 'draft', active: false });
  });

  it('går inte att skriva för sig', async () => {
    const created = await createProduct({ title: `A20 direkt ${Date.now()}` });
    await expect(
      getDb().execute(sql`update products set active = false where id = ${created.id}`)
    ).rejects.toThrow();
    expect(await state(created.id)).toEqual({ status: 'active', active: true });
  });
});
