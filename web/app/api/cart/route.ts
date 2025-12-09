import { NextRequest, NextResponse } from 'next/server';
import {
    createCart,
    getCart,
    addToCart,
    updateCartLine,
    removeFromCart,
    updateCartBuyerIdentity,
} from '@/lib/shopify';
import { getServerLanguage, toShopifyLanguage } from '@/lib/language';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, cartId, variantId, quantity, lineId, lineIds } = body;
        const language = await getServerLanguage();
        const shopifyLanguage = toShopifyLanguage(language);
        const cookieStore = await cookies();
        const country = cookieStore.get('SHOP_COUNTRY')?.value;

        switch (action) {
            case 'create': {
                console.log('[Cart API] Creating cart with country:', country, 'language:', shopifyLanguage);
                const cart = await createCart(shopifyLanguage, country);
                console.log('[Cart API] Cart created:', cart?.id);
                return NextResponse.json({ cart });
            }

            case 'get': {
                if (!cartId) {
                    return NextResponse.json({ error: 'Cart ID required' }, { status: 400 });
                }
                const cart = await getCart(cartId, shopifyLanguage, country);
                return NextResponse.json({ cart });
            }

            case 'add': {
                if (!cartId || !variantId || !quantity) {
                    return NextResponse.json(
                        { error: 'Cart ID, variant ID, and quantity required' },
                        { status: 400 }
                    );
                }
                console.log('[Cart API] Adding to cart:', { cartId, variantId, quantity, language: shopifyLanguage });
                const cart = await addToCart(cartId, variantId, quantity, shopifyLanguage, country);
                console.log('[Cart API] Item added, cart total quantity:', cart?.totalQuantity);
                return NextResponse.json({ cart });
            }

            case 'update': {
                if (!cartId || !lineId || quantity === undefined) {
                    return NextResponse.json(
                        { error: 'Cart ID, line ID, and quantity required' },
                        { status: 400 }
                    );
                }
                const cart = await updateCartLine(cartId, lineId, quantity, shopifyLanguage, country);
                return NextResponse.json({ cart });
            }

            case 'remove': {
                if (!cartId || !lineIds) {
                    return NextResponse.json(
                        { error: 'Cart ID and line IDs required' },
                        { status: 400 }
                    );
                }
                const cart = await removeFromCart(cartId, lineIds, shopifyLanguage, country);
                return NextResponse.json({ cart });
            }

            case 'updateBuyerIdentity': {
                if (!cartId || !body.country) {
                    return NextResponse.json(
                        { error: 'Cart ID and country required' },
                        { status: 400 }
                    );
                }
                const cart = await updateCartBuyerIdentity(cartId, body.country, shopifyLanguage);
                return NextResponse.json({ cart });
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Cart operation failed';
        console.error('Cart API error:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
