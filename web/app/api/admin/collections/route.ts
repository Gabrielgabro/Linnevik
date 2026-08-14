import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, isUniqueViolation } from '@/lib/adminRoute';
import { assertNoCycle, createCollection, listCollectionsForAdmin } from '@/lib/productsDb';
import { InputError, parseCollectionInput } from '@/lib/productsInput';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ collections: await listCollectionsForAdmin() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let input;
  try {
    input = parseCollectionInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let row;
  try {
    // En ny kategori kan inte stänga en cykel eftersom den inte har några barn,
    // men föräldern måste finnas — FK-felet därifrån säger inget begripligt.
    if (input.parentId != null) await assertNoCycle(0, input.parentId);
    row = await createCollection({ ...input, titleSv: input.titleSv!, titleEn: input.titleEn! });
  } catch (error) {
    if (isUniqueViolation(error, 'collections_handle_key')) {
      return NextResponse.json({ error: 'Den handlen används redan.' }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Kunde inte skapa kategorin.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await record(auth.user, 'collection.created', String(row.id), { kategori: input.titleSv });
  return NextResponse.json({ collection: row }, { status: 201 });
}
