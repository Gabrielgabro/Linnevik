import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { diff } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { productVariants } from '@/lib/db/schema';
import { deleteVariant, updateVariant } from '@/lib/productsDb';
import { InputError, parseVariantInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb()
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Varianten finns inte.' }, { status: 404 });

  let input;
  try {
    input = parseVariantInput(await readBody(request), { partial: true });
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let variant;
  try {
    variant = await updateVariant(id, input);
  } catch (error) {
    if (isUniqueViolation(error, 'product_variants_sku_key')) {
      return NextResponse.json({ error: `SKU ${input.sku} används redan.` }, { status: 409 });
    }
    throw error;
  }

  await record(auth.user, 'variant.updated', String(id), {
    sku: before.sku,
    ändrat: diff(before, { ...input }),
  });

  return NextResponse.json({ variant });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb()
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, id))
    .limit(1);
  if (!before) return NextResponse.json({ error: 'Varianten finns inte.' }, { status: 404 });

  try {
    await deleteVariant(id);
  } catch (error) {
    // En variant som sålts går inte att ta bort. Meddelandet från productsDb
    // säger varför och vad man ska göra i stället.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte ta bort varianten.' },
      { status: 409 }
    );
  }

  await record(auth.user, 'variant.deleted', String(id), { sku: before.sku });
  return NextResponse.json({ ok: true });
}
