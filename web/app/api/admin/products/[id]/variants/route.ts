import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { createVariant } from '@/lib/productsDb';
import { InputError, parseVariantInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const productId = routeId((await params).id);
  if (productId === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  let input;
  try {
    input = parseVariantInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let variant;
  try {
    variant = await createVariant(productId, {
      ...input,
      sku: input.sku!,
      priceMinor: input.priceMinor!,
    });
  } catch (error) {
    // SKU:n är unik över hela katalogen, inte bara inom produkten — den är vår
    // beständiga identitet och det är den pricing.ts slår upp på.
    if (isUniqueViolation(error, 'product_variants_sku_key')) {
      return NextResponse.json({ error: `SKU ${input.sku} används redan.` }, { status: 409 });
    }
    throw error;
  }

  await record(auth.user, 'variant.created', String(variant.id), {
    sku: variant.sku,
    pris: variant.priceMinor / 100,
  });

  return NextResponse.json({ variant }, { status: 201 });
}
