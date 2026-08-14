import { NextRequest, NextResponse } from 'next/server';
import { getOwnedCart } from '@/lib/cartDb';
import { cartApiError, cartId, requireOwnedCommerce } from '@/lib/storeCartApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const id = cartId((await context.params).id);
    const cart = await getOwnedCart(id);
    if (!cart) return NextResponse.json({ error: 'Korgen finns inte.' }, { status: 404 });
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}
