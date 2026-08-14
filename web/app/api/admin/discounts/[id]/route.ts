import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId } from '@/lib/adminRoute';
import { updateDiscountCode } from '@/lib/commerceOperations';
import { parseDiscountInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  try {
    const discount = await updateDiscountCode(id, parseDiscountInput(await readBody(request)));
    if (!discount) return NextResponse.json({ error: 'Discount not found.' }, { status: 404 });
    await record(auth.user, 'discount.updated', String(id), { code: discount.code });
    return NextResponse.json({ discount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update discount.' }, { status: 400 });
  }
}
