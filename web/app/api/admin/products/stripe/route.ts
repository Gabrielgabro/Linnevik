import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin } from '@/lib/adminRoute';
import { stripeConfigured } from '@/lib/stripe';
import { linkAllProductsToStripe } from '@/lib/stripeCatalog';

export const runtime = 'nodejs';

/**
 * Kopplar hela den aktiva katalogen till Stripe, med den nyckel som gäller i
 * den här miljön. Det är vägen in i skarpt läge: produkter som skapats med en
 * testnyckel finns inte för live-nyckeln, och live-nyckeln går inte att ta ut
 * ur Vercel för att köra skriptet lokalt.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Stripe är inte konfigurerat.' }, { status: 503 });
  }

  const summary = await linkAllProductsToStripe();
  await record(auth.user, 'product.updated', 'alla', {
    stripe: `${summary.created} skapade, ${summary.updated} uppdaterade, ${summary.failed.length} misslyckades`,
  });

  return NextResponse.json(summary, { status: summary.failed.length ? 207 : 200 });
}
