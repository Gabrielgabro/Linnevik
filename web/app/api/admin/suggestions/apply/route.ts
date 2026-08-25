import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { record } from '@/lib/adminActivity';
import { readBody, requireAdmin } from '@/lib/adminRoute';
import { getDb } from '@/lib/db';
import { products, productVariants } from '@/lib/db/schema';

export const runtime = 'nodejs';

/**
 * Skriver ett pris från prisbildens grafer till katalogen. Förslagen är per
 * produkt, inte per storlek/fyllning, så samma pris sätts på alla varianter
 * under produkten — till skillnad från /api/admin/variants, som sätter en
 * variant i taget.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  let handle: unknown;
  let priceSek: unknown;
  try {
    const body = await readBody(request);
    handle = body.handle;
    priceSek = body.priceSek;
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa förfrågan.' }, { status: 400 });
  }

  if (typeof handle !== 'string' || !handle.trim()) {
    return NextResponse.json({ error: 'Ogiltig produkt.' }, { status: 400 });
  }
  if (typeof priceSek !== 'number' || !Number.isFinite(priceSek) || priceSek <= 0) {
    return NextResponse.json({ error: 'Ogiltigt pris.' }, { status: 400 });
  }

  const [product] = await getDb().select().from(products).where(eq(products.handle, handle)).limit(1);
  if (!product) {
    return NextResponse.json(
      { error: `Hittade ingen produkt med handle "${handle}" i katalogen.` },
      { status: 404 }
    );
  }

  const priceMinor = Math.round(priceSek * 100);
  const variants = await getDb()
    .update(productVariants)
    .set({ priceMinor, updatedAt: new Date() })
    .where(eq(productVariants.productId, product.id))
    .returning({ id: productVariants.id });

  if (!variants.length) {
    return NextResponse.json(
      { error: `${product.title} har inga varianter att sätta pris på.` },
      { status: 409 }
    );
  }

  await record(auth.user, 'suggestion.applied', String(product.id), {
    produkt: product.title,
    pris: priceSek,
    varianter: variants.length,
  });

  return NextResponse.json({
    ok: true,
    product: { id: product.id, handle: product.handle, title: product.title },
    priceMinor,
    variantCount: variants.length,
  });
}
