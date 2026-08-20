import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { CommerceInputError, parseCustomerInput } from '@/lib/commerceInput';
import { updateCustomer } from '@/lib/commerceOperations';
import { getDb } from '@/lib/db';
import { customers } from '@/lib/db/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; customerId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const values = await params;
  const clientId = routeId(values.id);
  const customerId = routeId(values.customerId);
  if (clientId === null || customerId === null) {
    return NextResponse.json({ error: 'Okänt webbkonto.' }, { status: 404 });
  }

  const [existing] = await getDb()
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.clientId, clientId)))
    .limit(1);
  if (!existing) return NextResponse.json({ error: 'Okänt webbkonto.' }, { status: 404 });

  try {
    const customer = await updateCustomer(customerId, parseCustomerInput(await readBody(request)));
    if (!customer) return NextResponse.json({ error: 'Okänt webbkonto.' }, { status: 404 });
    await record(auth.user, 'customer.updated', String(clientId), {
      epost: customer.email,
      webbkonto: String(customer.id),
    });
    return NextResponse.json({ customer });
  } catch (error) {
    const status = error instanceof CommerceInputError ? 400 : 409;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte spara webbkontot.' },
      { status }
    );
  }
}
