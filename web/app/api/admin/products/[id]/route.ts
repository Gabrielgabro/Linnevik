import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { diff } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteProduct, setProductCollections, updateProduct } from '@/lib/productsDb';
import {
  InputError,
  parseIdList,
  parsePrimaryCollectionId,
  parseProductInput,
} from '@/lib/productsInput';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb().select().from(products).where(eq(products.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Produkten finns inte.' }, { status: 404 });

  let body;
  let input;
  try {
    body = await readBody(request);
    input = parseProductInput(body, { partial: true });
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let product;
  try {
    product = await updateProduct(id, input);
  } catch (error) {
    if (isUniqueViolation(error, 'products_handle_key')) {
      return NextResponse.json({ error: 'Den handlen används redan.' }, { status: 409 });
    }
    throw error;
  }

  // Kategorikopplingarna kommer i samma anrop som fälten, men skrivs för sig:
  // de ligger i en egen tabell och ska inte röras när formuläret inte skickat
  // med dem.
  if (body.collectionIds !== undefined) {
    try {
      const collectionIds = parseIdList(body, 'collectionIds');
      const primary = parsePrimaryCollectionId(body, collectionIds);
      await setProductCollections(id, collectionIds, primary);
    } catch (error) {
      const message = error instanceof InputError ? error.message : 'Kunde inte spara kategorierna.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  await record(auth.user, 'product.updated', String(id), {
    produkt: before.title,
    ändrat: diff(before, { ...input }),
  });

  return NextResponse.json({ product });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb().select().from(products).where(eq(products.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Produkten finns inte.' }, { status: 404 });

  try {
    await deleteProduct(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte ta bort produkten.' },
      { status: 409 }
    );
  }

  await record(auth.user, 'product.deleted', String(id), { produkt: before.title });
  return NextResponse.json({ ok: true });
}
