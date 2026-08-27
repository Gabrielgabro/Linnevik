import { NextRequest, NextResponse } from 'next/server';
import { createOwnedCart, getOwnedCart } from '@/lib/cartDb';
import { cartApiError, cartId, requireOwnedCommerce } from '@/lib/storeCartApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const id = cartId(request.nextUrl.searchParams.get('id'));
    const cart = await getOwnedCart(id);
    if (!cart) return NextResponse.json({ error: 'Korgen finns inte.' }, { status: 404 });
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const locale = body.locale === 'en' ? 'en' : 'sv';
    // Customer identity is never accepted from a public request. If account-
    // specific pricing is introduced, derive it from the signed session.
    const cart = await createOwnedCart({ locale, currency: 'sek' });
    return NextResponse.json({ cart }, { status: 201 });
  } catch (error) {
    return cartApiError(error);
  }
}
