import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, routeId, isUniqueViolation } from '@/lib/adminRoute';
import { updateDiscountCode } from '@/lib/commerceOperations';
import { CommerceInputError, parseDiscountInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });
  try {
    const discount = await updateDiscountCode(id, parseDiscountInput(await readBody(request)));
    if (!discount) return NextResponse.json({ error: 'Rabattkoden finns inte.' }, { status: 404 });
    await record(auth.user, 'discount.updated', String(id), { code: discount.code });
    return NextResponse.json({ discount });
  } catch (error) {
    if (error instanceof CommerceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (isUniqueViolation(error, 'discount_codes_code_key')) {
      return NextResponse.json({ error: 'Det finns redan en rabattkod med den koden.' }, { status: 409 });
    }
    console.error('[admin] updateDiscountCode failed:', error);
    return NextResponse.json({ error: 'Kunde inte spara rabattkoden.' }, { status: 500 });
  }
}
