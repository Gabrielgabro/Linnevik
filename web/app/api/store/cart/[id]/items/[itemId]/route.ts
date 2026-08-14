import { NextRequest, NextResponse } from 'next/server';
import { removeOwnedCartItem, updateOwnedCartItem } from '@/lib/cartDb';
import {
  cartApiError,
  cartId,
  positiveInteger,
  requireOwnedCommerce,
} from '@/lib/storeCartApi';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const params = await context.params;
    const id = cartId(params.id);
    const itemId = positiveInteger(params.itemId, 'itemId');
    const body = (await request.json()) as Record<string, unknown>;
    const quantity = positiveInteger(body.quantity, 'quantity');
    const cart = await updateOwnedCartItem(id, itemId, quantity);
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const unavailable = requireOwnedCommerce();
  if (unavailable) return unavailable;
  try {
    const params = await context.params;
    const id = cartId(params.id);
    const itemId = positiveInteger(params.itemId, 'itemId');
    const cart = await removeOwnedCartItem(id, itemId);
    return NextResponse.json({ cart });
  } catch (error) {
    return cartApiError(error);
  }
}
