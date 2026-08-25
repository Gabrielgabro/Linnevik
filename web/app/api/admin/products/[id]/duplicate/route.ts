import { NextRequest, NextResponse } from 'next/server';
import { record } from '@/lib/adminActivity';
import { requireAdmin, routeId } from '@/lib/adminRoute';
import { duplicateProduct } from '@/lib/productsDb';

export const runtime = 'nodejs';

/** Kopierar produkten som ett utkast och svarar med den nya handlen. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;

  const id = routeId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Ogiltigt id.' }, { status: 400 });

  let product;
  try {
    product = await duplicateProduct(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde inte kopiera produkten.' },
      { status: 409 }
    );
  }

  await record(auth.user, 'product.created', String(product.id), {
    produkt: product.title,
    handle: product.handle,
    kopia_av: id,
  });

  return NextResponse.json({ product }, { status: 201 });
}
