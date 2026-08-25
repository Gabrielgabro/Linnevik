import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin, routeId } from '@/lib/adminRoute';
import { stripeConfigured } from '@/lib/stripe';
import { linkProductToStripe } from '@/lib/stripeCatalog';

export const runtime = 'nodejs';

/**
 * Kopplar produkten till Stripe. Motsvarar det `npm run catalog:stripe` gör,
 * men för en produkt och utan terminal — och till skillnad från skriptet utan
 * begränsningen till handles i landed-cost-underlaget.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe är inte konfigurerat.' }, { status: 503 });
  }

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  let result;
  try {
    result = await linkProductToStripe(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte koppla produkten.' },
      { status: 502 }
    );
  }

  await record(auth.user, 'product.updated', String(id), {
    stripe: result.stripeProductId,
    åtgärd: result.created ? 'skapade Stripe-produkten' : 'uppdaterade Stripe-produkten',
  });

  return NextResponse.json(result);
}
