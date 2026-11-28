/**
 * §1.11: en produkt och en kategori har en adress på svenska och en på
 * engelska. Förr fick det som skapades i admin ingen engelsk adress och gav
 * 404 på /en. Byts en adress pekar den gamla vidare, på båda språken.
 */

import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/adminRoute', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/adminRoute')>()),
  requireAdmin: vi.fn(async () => ({ user: 'Gabriel' })),
}));

import { getCatalogProduct } from '@/lib/catalogDb';
import { createCollection, createProduct, duplicateProduct } from '@/lib/productsDb';
import { resolveHandleRedirect } from '@/lib/redirectsDb';
import { PATCH as patchProduct } from '../../app/api/admin/products/[id]/route';

function patch(id: number, body: object) {
  return patchProduct(
    new NextRequest(`http://localhost/api/admin/products/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) }
  );
}

describe('engelsk adress', () => {
  it('får en ny produkt, en kopia och en ny kategori', async () => {
    const product = await createProduct({ title: `Engelska ${Date.now()}`, status: 'active' });
    expect(product.handleEn).toBe(product.handle);
    expect(await getCatalogProduct(product.handleEn!, 'en')).not.toBeNull();

    const copy = await duplicateProduct(product.id);
    expect(copy.handleEn).toBe(copy.handle);

    const stamp = Date.now();
    const collection = await createCollection({ titleSv: `Kategori ${stamp}`, titleEn: `Category ${stamp}` });
    expect(collection.id).toBeGreaterThan(0);
  });

  it('går att byta, och den gamla engelska adressen pekar vidare bara på engelska', async () => {
    const product = await createProduct({ title: `Byte ${Date.now()}`, status: 'active' });
    const english = `${product.handle}-en`;
    const response = await patch(product.id, { handleEn: english });
    expect(response.status).toBe(200);

    expect(await getCatalogProduct(english, 'en')).not.toBeNull();
    expect(await resolveHandleRedirect('product', product.handle, 'en')).toBe(`/products/${english}`);
    // Den svenska adressen är oförändrad och ska inte skickas vidare.
    expect(await resolveHandleRedirect('product', product.handle, 'sv')).toBeNull();
    expect(await getCatalogProduct(product.handle, 'sv')).not.toBeNull();
  });
});
