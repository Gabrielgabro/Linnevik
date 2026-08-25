import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { diff } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { deleteProduct, setProductCollections, updateProduct } from '@/lib/productsDb';
import { recordHandleChange } from '@/lib/redirectsDb';
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

  // Handlen är adressen. Byts den lever den gamla kvar i sökmotorer och
  // bokmärken, så bytet skrivs som en omdirigering — annars blir varje
  // omdöpning en tyst 404 för alla som redan har länken.
  if (product && product.handle !== before.handle) {
    await recordHandleChange('product', before.handle, product.handle, auth.user);
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

  let imageUrls: string[];
  try {
    ({ imageUrls } = await deleteProduct(id));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte ta bort produkten.' },
      { status: 409 }
    );
  }

  // Raderna är borta oavsett vad Blob svarar — samma hållning som när en
  // enskild bild tas bort. En kvarglömd fil kostar ören; ett fel här får inte
  // lämna produkten halvraderad.
  for (const url of imageUrls) {
    try {
      await del(url);
    } catch (error) {
      console.error('[admin] kunde inte radera bildfilen:', error);
    }
  }

  await record(auth.user, 'product.deleted', String(id), {
    produkt: before.title,
    handle: before.handle,
    bilder: imageUrls.length,
  });
  return NextResponse.json({ ok: true });
}
