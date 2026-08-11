import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { diff, InputError, parseClientInput } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { clients } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Ändra en kund. Loggar vilka fält som faktiskt ändrades. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  let input;
  try {
    input = parseClientInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = getDb();
  const [before] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!before) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const changes = diff(before, input);
  if (changes.length === 0) {
    return NextResponse.json({ client: before, changed: [] });
  }

  let row;
  try {
    [row] = await db
      .update(clients)
      .set({
        ...input,
        // Ett redigerat namn är per definition inte längre det kapade.
        nameTruncated: input.name === before.name ? before.nameTruncated : false,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();
  } catch (error) {
    if (String(error).includes('clients_customer_no_key')) {
      return NextResponse.json(
        { error: `Kundnummer ${input.customerNo} används redan.` },
        { status: 409 }
      );
    }
    throw error;
  }

  await record(auth.user, 'client.updated', String(row.id), {
    kund: row.name,
    ändrat: changes.join(', '),
  });

  return NextResponse.json({ client: row, changed: changes });
}

/** Ta bort en kund. Kontaktpersonerna följer med via cascade i schemat. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const db = getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  await db.delete(clients).where(eq(clients.id, id));

  await record(auth.user, 'client.deleted', String(id), {
    kundnr: existing.customerNo,
    kund: existing.name,
  });

  return NextResponse.json({ ok: true });
}
