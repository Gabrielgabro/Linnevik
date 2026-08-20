import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { CommerceInputError, parseCustomerInput } from '@/lib/commerceInput';
import { createCustomer } from '@/lib/commerceOperations';
import { getDb } from '@/lib/db';
import { clients } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const clientId = routeId((await params).id);
  if (clientId === null) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  const [client] = await getDb().select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ error: 'Okänd kund.' }, { status: 404 });

  try {
    const input = parseCustomerInput(await readBody(request), true);
    const customer = await createCustomer(clientId, { ...input, email: input.email! });
    await record(auth.user, 'customer.created', String(clientId), {
      kund: client.name,
      epost: customer.email,
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    const status = error instanceof CommerceInputError ? 400 : 409;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte skapa webbkontot.' },
      { status }
    );
  }
}
