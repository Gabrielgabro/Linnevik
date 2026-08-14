import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import { createShippingRule, listShippingRules } from '@/lib/commerceOperations';
import { parseShippingInput } from '@/lib/commerceInput';
import { record } from '@/lib/adminActivity';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ shippingRules: await listShippingRules() });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const input = parseShippingInput(await readBody(request), true);
    const shippingRule = await createShippingRule({ ...input, name: input.name! });
    await record(auth.user, 'shipping.created', String(shippingRule.id), { name: shippingRule.name });
    return NextResponse.json({ shippingRule }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create shipping rule.' }, { status: 400 });
  }
}
