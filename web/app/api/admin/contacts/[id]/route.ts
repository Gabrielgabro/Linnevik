import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { contactName } from '@/lib/clients';
import { diff, InputError, parseContactInput } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { clientContacts, clients } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Kunden som personen sitter på — behövs för att loggraden ska säga något. */
async function loadWithClient(id: number) {
  const [row] = await getDb()
    .select({ contact: clientContacts, clientName: clients.name })
    .from(clientContacts)
    .innerJoin(clients, eq(clients.id, clientContacts.clientId))
    .where(eq(clientContacts.id, id))
    .limit(1);
  return row ?? null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kontaktperson.' }, { status: 404 });

  let input;
  try {
    input = parseContactInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const existing = await loadWithClient(id);
  if (!existing) return NextResponse.json({ error: 'Okänd kontaktperson.' }, { status: 404 });

  const changes = diff(existing.contact, input);
  if (changes.length === 0) {
    return NextResponse.json({ contact: existing.contact, changed: [] });
  }

  const [row] = await getDb()
    .update(clientContacts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clientContacts.id, id))
    .returning();

  await record(auth.user, 'contact.updated', String(row.id), {
    kund: existing.clientName,
    person: contactName(row),
    ändrat: changes.join(', '),
  });

  return NextResponse.json({ contact: row, changed: changes });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kontaktperson.' }, { status: 404 });

  const existing = await loadWithClient(id);
  if (!existing) return NextResponse.json({ error: 'Okänd kontaktperson.' }, { status: 404 });

  await getDb().delete(clientContacts).where(eq(clientContacts.id, id));

  await record(auth.user, 'contact.deleted', String(id), {
    kund: existing.clientName,
    person: contactName(existing.contact),
  });

  return NextResponse.json({ ok: true });
}
