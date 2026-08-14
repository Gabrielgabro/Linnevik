import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import { createCustomer, listCustomers } from '@/lib/commerceOperations';
import { CommerceInputError, parseCustomerInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ customers: await listCustomers() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const input = parseCustomerInput(await readBody(request), true);
    const customer = await createCustomer({ ...input, email: input.email! });
    await record(auth.user, 'customer.created', String(customer.id), { email: customer.email });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    const status = error instanceof CommerceInputError ? 400 : 409;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create customer.' }, { status });
  }
}
