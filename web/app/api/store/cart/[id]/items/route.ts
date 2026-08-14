import { NextRequest, NextResponse } from 'next/server';
import { setOwnedCartItem } from '@/lib/cartDb';
import {
  cartApiError,
  cartId,
  positiveInteger,
  requireOwnedCommerce,
} from '@/lib/storeCartApi';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const id = cartId((await context.params).id);
    const body = (await request.json()) as Record<string, unknown>;
    const variantId = positiveInteger(body.variantId, 'variantId');
    const quantity = positiveInteger(body.quantity, 'quantity');
    const cart = await setOwnedCartItem(id, variantId, quantity);
    return NextResponse.json({ cart }, { status: 201 });
  } catch (error) {
    return cartApiError(error);
  }
}
