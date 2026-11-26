/**
 * §3.8: en lagerförd variant utan säljbart lager visas som slutsåld. Kunden
 * ska inte kunna trycka på en köpknapp som servern sedan säger nej till (A21).
 */

import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';
import { getCatalogProduct } from '@/lib/catalogDb';
import { createProduct, createVariant } from '@/lib/productsDb';

async function variantOnPage(handle: string) {
  const product = await getCatalogProduct(handle, 'sv');
  return product?.variants.edges[0]?.node;
}

describe('slutsåld variant', () => {
  it('följer det säljbara lagret och det minsta antalet', async () => {
    const product = await createProduct({ title: `A21 ${Date.now()}`, status: 'active' });
    const variant = await createVariant(product.id, {
      sku: `A21-${Date.now()}`,
      priceMinor: 10_000,
      inventoryTracked: true,
      inventoryQuantity: 0,
      minimumOrderQuantity: 5,
      availableForSale: true,
      optionValues: [{ name: 'Storlek', value: 'En' }],
    });

    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: false, soldOut: true });

    // Fyra i lager räcker inte när minsta antalet är fem.
    await getDb().update(productVariants).set({ inventoryQuantity: 4 }).where(eq(productVariants.id, variant.id));
    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: false, soldOut: true });

    // Reserverat lager är inte säljbart.
    await getDb()
      .update(productVariants)
      .set({ inventoryQuantity: 6, inventoryReserved: 2 })
      .where(eq(productVariants.id, variant.id));
    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: false, soldOut: true });

    await getDb().update(productVariants).set({ inventoryReserved: 1 }).where(eq(productVariants.id, variant.id));
    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: true, soldOut: false });
  });

  it('gäller inte en variant utan lagerföring', async () => {
    const product = await createProduct({ title: `A21 fri ${Date.now()}`, status: 'active' });
    await createVariant(product.id, {
      sku: `A21F-${Date.now()}`,
      priceMinor: 10_000,
      inventoryTracked: false,
      inventoryQuantity: 0,
      availableForSale: true,
      optionValues: [{ name: 'Storlek', value: 'En' }],
    });
    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: true, soldOut: false });
  });

  it('visar en variant som inte får beställas som ej beställbar, inte slutsåld', async () => {
    const product = await createProduct({ title: `A21 av ${Date.now()}`, status: 'active' });
    await createVariant(product.id, {
      sku: `A21A-${Date.now()}`,
      priceMinor: 10_000,
      inventoryTracked: true,
      inventoryQuantity: 0,
      availableForSale: false,
      optionValues: [{ name: 'Storlek', value: 'En' }],
    });
    expect(await variantOnPage(product.handle)).toMatchObject({ availableForSale: false, soldOut: false });
  });
});
