import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin, isUniqueViolation } from '@/lib/adminRoute';
import { createDiscountCode, listDiscountCodes } from '@/lib/commerceOperations';
import { CommerceInputError, parseDiscountInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ discounts: await listDiscountCodes() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const input = parseDiscountInput(await readBody(request), true);
    const discount = await createDiscountCode({
      ...input,
      code: input.code!, title: input.title!, kind: input.kind!,
    });
    await record(auth.user, 'discount.created', String(discount.id), { code: discount.code });
    return NextResponse.json({ discount }, { status: 201 });
  } catch (error) {
    if (error instanceof CommerceInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (isUniqueViolation(error, 'discount_codes_code_key')) {
      return NextResponse.json({ error: 'Det finns redan en rabattkod med den koden.' }, { status: 409 });
    }
    console.error('[admin] createDiscountCode failed:', error);
    return NextResponse.json({ error: 'Kunde inte skapa rabattkoden.' }, { status: 500 });
  }
}
