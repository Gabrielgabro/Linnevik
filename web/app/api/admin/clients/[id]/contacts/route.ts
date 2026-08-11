import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { contactName } from '@/lib/clients';
import { InputError, parseContactInput } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { clientContacts, clients } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** Lägg till en kontaktperson på en kund. En kund kan ha hur många som helst. */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const clientId = routeId((await params).id);
  if (clientId === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  let input;
  try {
    input = parseContactInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const [row] = await db
    .insert(clientContacts)
    .values({ ...input, clientId })
    .returning();

  await record(auth.user, 'contact.created', String(row.id), {
    kund: client.name,
    person: contactName(row),
    status: row.status,
  });

  return NextResponse.json({ contact: row }, { status: 201 });
}
