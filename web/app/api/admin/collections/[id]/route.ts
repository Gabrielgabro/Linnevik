import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { diff } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { collections } from '@/lib/db/schema';
import { deleteCollection, updateCollection } from '@/lib/productsDb';
import { InputError, parseCollectionInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb().select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Kategorin finns inte.' }, { status: 404 });

  let input;
  try {
    input = parseCollectionInput(await readBody(request), { partial: true });
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // updateCollection kontrollerar cykler. En rundgång i trädet hade inte
    // gett något fel — den hade tyst huggit av varje brödsmula under sig.
    await updateCollection(id, input);
  } catch (error) {
    if (isUniqueViolation(error, 'collections_handle_key')) {
      return NextResponse.json({ error: 'Den handlen används redan.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Kunde inte spara kategorin.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await record(auth.user, 'collection.updated', String(id), {
    kategori: before.titleSv,
    ändrat: diff(before, { ...input }),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  const [before] = await getDb().select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Kategorin finns inte.' }, { status: 404 });

  try {
    await deleteCollection(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte ta bort kategorin.' },
      { status: 409 }
    );
  }

  await record(auth.user, 'collection.deleted', String(id), { kategori: before.titleSv });
  return NextResponse.json({ ok: true });
}
