import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { updateShippingRule } from '@/lib/commerceOperations';
import { parseShippingInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  try {
    const shippingRule = await updateShippingRule(id, parseShippingInput(await readBody(request)));
    if (!shippingRule) return NextResponse.json({ error: 'Shipping rule not found.' }, { status: 404 });
    await record(auth.user, 'shipping.updated', String(id), { name: shippingRule.name });
    return NextResponse.json({ shippingRule });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update shipping rule.' }, { status: 400 });
  }
}
