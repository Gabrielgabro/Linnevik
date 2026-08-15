import { NextRequest, NextResponse } from 'next/server';
import { CartError, resolveVariantIdByShopifyId, setOwnedCartItem } from '@/lib/cartDb';
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
    const quantity = positiveInteger(body.quantity, 'quantity');

    // Produktsidorna skickar fortfarande Shopifys variant-id (se
    // cartDb.ts#resolveVariantIdByShopifyId) tills katalogläsningen flyttas
    // över. Ett explicit numeriskt variantId tas emot direkt, i första hand
    // för admin/interna anrop.
    let variantId: number;
    if (typeof body.shopifyVariantId === 'string' && body.shopifyVariantId) {
      const resolved = await resolveVariantIdByShopifyId(body.shopifyVariantId);
      if (!resolved) throw new CartError('Varianten finns inte.', 404);
      variantId = resolved;
    } else {
      variantId = positiveInteger(body.variantId, 'variantId');
    }

    const cart = await setOwnedCartItem(id, variantId, quantity);
    return NextResponse.json({ cart }, { status: 201 });
  } catch (error) {
    return cartApiError(error);
  }
}
