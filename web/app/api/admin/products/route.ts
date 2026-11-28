import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, isUniqueViolation } from '@/lib/adminRoute';
import { createProduct, listProductsForAdmin } from '@/lib/productsDb';
import { InputError, parseProductInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ products: await listProductsForAdmin() });
}

/**
 * Skapa en produkt. Ingen Shopify inblandad — det är hela poängen: en produkt
 * som föds här har inget shopify_product_id och behöver inget.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let input;
  try {
    input = parseProductInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let product;
  try {
    // En ny produkt är ett utkast tills den har variant, pris, bild och
    // engelsk text (§1.11). Den publiceras på produktsidan.
    product = await createProduct({ ...input, title: input.title!, status: input.status ?? 'draft' });
  } catch (error) {
    if (isUniqueViolation(error, 'products_handle_key')) {
      return NextResponse.json({ error: 'Den svenska adressen används redan.' }, { status: 409 });
    }
    if (isUniqueViolation(error, 'products_handle_en_key')) {
      return NextResponse.json({ error: 'Den engelska adressen används redan.' }, { status: 409 });
    }
    throw error;
  }

  await record(auth.user, 'product.created', String(product.id), {
    produkt: product.title,
    handle: product.handle,
  });

  return NextResponse.json({ product }, { status: 201 });
}
