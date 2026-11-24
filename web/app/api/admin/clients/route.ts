import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { isUniqueViolation, readBody, requireAdmin } from '@/lib/adminRoute';
import { listClients } from '@/lib/clientsDb';
import { InputError, parseClientInput } from '@/lib/clientsInput';
import { getDb } from '@/lib/db';
import { clients, type ClientKind } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const kind = request.nextUrl.searchParams.get('kind');
  return NextResponse.json({
    clients: await listClients(kind === 'lead' || kind === 'customer' ? kind : undefined),
  });
}

/** Lägg till en kund. Kundnumret måste vara ledigt. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let input;
  let kind: ClientKind;
  try {
    const body = await readBody(request);
    input = parseClientInput(body);
    // Vilket register posten läggs i: Kunder (som kan faktureras) eller
    // ringlistan Tvätterikunder. Ringlistan är förvalet, som förut.
    kind = body.kind === 'customer' ? 'customer' : 'lead';
  } catch (error) {
    const message = error instanceof InputError ? error.message : 'Kunde inte läsa förfrågan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let row;
  try {
    [row] = await getDb()
      .insert(clients)
      .values({ ...input, kind, ...(kind === 'customer' && input.status === 'Tvätterikund' ? { status: 'Aktiv kund' } : {}) })
      .returning();
  } catch (error) {
    // Unikt index på kundnummer. Två personer kan lägga till samtidigt, så
    // kollisionen fångas här i stället för med en kontrollfråga före.
    // isUniqueViolation och inte String(error): drizzle lindar in databasfelet,
    // så indexnamnet står inte i strängen — kollisionen blev ett tyst 500 där
    // svaret skulle ha varit ett 409.
    if (isUniqueViolation(error, 'clients_customer_no_key')) {
      return NextResponse.json(
        { error: `Kundnummer ${input.customerNo} används redan.` },
        { status: 409 }
      );
    }
    if (isUniqueViolation(error, 'clients_org_number_key')) {
      return NextResponse.json(
        { error: `Organisationsnummer ${input.orgNumber} finns redan på en annan kund.` },
        { status: 409 }
      );
    }
    throw error;
  }

  await record(auth.user, 'client.created', String(row.id), {
    kundnr: row.customerNo,
    kund: row.name,
    register: kind === 'customer' ? 'Kunder' : 'Tvätterikunder',
  });

  return NextResponse.json({ client: row }, { status: 201 });
}
