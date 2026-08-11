import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import { listClients } from '@/lib/clientsDb';
import { InputError, parseClientInput } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { clients } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ clients: await listClients() });
}

/** Lägg till en kund. Kundnumret måste vara ledigt. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let input;
  try {
    input = parseClientInput(await readBody(request));
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let row;
  try {
    [row] = await getDb().insert(clients).values(input).returning();
  } catch (error) {
    // Unikt index på kundnummer. Två personer kan lägga till samtidigt, så
    // kollisionen fångas här i stället för med en kontrollfråga före.
    if (String(error).includes('clients_customer_no_key')) {
      return NextResponse.json(
        { error: `Kundnummer ${input.customerNo} används redan.` },
        { status: 409 }
      );
    }
    throw error;
  }

  await record(auth.user, 'client.created', String(row.id), {
    kundnr: row.customerNo,
    kund: row.name,
  });

  return NextResponse.json({ client: row }, { status: 201 });
}
