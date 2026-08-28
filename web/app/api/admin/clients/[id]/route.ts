import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { isUniqueViolation, readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { diff, InputError, parseClientInput } from '@/lib/clientsInput';
import { deleteClientsWithAccounts } from '@/lib/clientsDb';
import { getDb } from '@/lib/db';
import { clients, customers } from '@/lib/db/schema';

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
    // Företagsnamn och kundnummer ägs av Kunder. Webbkontona speglar dem så
    // att checkout, orderhistorik och kundvyn aldrig visar en gammal kopia.
    await db
      .update(customers)
      .set({ customerNo: row.customerNo, company: row.name, updatedAt: new Date() })
      .where(eq(customers.clientId, row.id));
  } catch (error) {
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

  await record(auth.user, 'client.updated', String(row.id), {
    kund: row.name,
    ändrat: changes.join(', '),
  });

  return NextResponse.json({ client: row, changed: changes });
}

/**
 * Ta bort en kund ur båda registren. Kontaktpersonerna följer med via cascade i
 * schemat, webbkontona raderas av deleteClientsWithAccounts. Ordrarna står kvar
 * — se den funktionen för varför.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const db = getDb();
  const [existing] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const removed = await deleteClientsWithAccounts([id]);

  await record(auth.user, 'client.deleted', String(id), {
    kundnr: existing.customerNo,
    kund: existing.name,
    webbkonton: String(removed.accounts),
  });

  return NextResponse.json({ ok: true, accounts: removed.accounts });
}
