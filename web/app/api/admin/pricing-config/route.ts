import { NextRequest, NextResponse } from 'next/server';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import {
  PricingConfigInputError,
  getPricingConfigRow,
  parsePricingConfigInput,
  updatePricingConfig,
} from '@/lib/pricingConfigDb';
import { record } from '@/lib/adminActivity';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  return NextResponse.json({ pricingConfig: await getPricingConfigRow() });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  try {
    const input = parsePricingConfigInput(await readBody(request));
    const row = await updatePricingConfig(input, auth.user);
    await record(auth.user, 'pricing_config.updated', 'pricing_config', { strategy: input.strategy });
    return NextResponse.json({ pricingConfig: row });
  } catch (error) {
    const status = error instanceof PricingConfigInputError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte spara prislogiken.' },
      { status }
    );
  }
}
