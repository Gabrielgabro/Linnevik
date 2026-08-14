import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { updateCustomer } from '@/lib/commerceOperations';
import { CommerceInputError, parseCustomerInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  try {
    const customer = await updateCustomer(id, parseCustomerInput(await readBody(request)));
    if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    await record(auth.user, 'customer.updated', String(id), { email: customer.email });
    return NextResponse.json({ customer });
  } catch (error) {
    const status = error instanceof CommerceInputError ? 400 : 409;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update customer.' }, { status });
  }
}
