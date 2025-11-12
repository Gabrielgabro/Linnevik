import { NextRequest, NextResponse } from 'next/server';
import {
    createCart,
    getCart,
    addToCart,
    updateCartLine,
    removeFromCart,
} from '@/lib/shopify';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, cartId, variantId, quantity, lineId, lineIds } = body;

        switch (action) {
            case 'create': {
                const cart = await createCart();
                return NextResponse.json({ cart });
            }

            case 'get': {
                if (!cartId) {
                    return NextResponse.json({ error: 'Cart ID required' }, { status: 400 });
                }
                const cart = await getCart(cartId);
                return NextResponse.json({ cart });
            }

            case 'add': {
                if (!cartId || !variantId || !quantity) {
                    return NextResponse.json(
                        { error: 'Cart ID, variant ID, and quantity required' },
                        { status: 400 }
                    );
                }
                const cart = await addToCart(cartId, variantId, quantity);
                return NextResponse.json({ cart });
            }

            case 'update': {
                if (!cartId || !lineId || quantity === undefined) {
                    return NextResponse.json(
                        { error: 'Cart ID, line ID, and quantity required' },
                        { status: 400 }
                    );
                }
                const cart = await updateCartLine(cartId, lineId, quantity);
                return NextResponse.json({ cart });
            }

            case 'remove': {
                if (!cartId || !lineIds) {
                    return NextResponse.json(
                        { error: 'Cart ID and line IDs required' },
                        { status: 400 }
                    );
                }
                const cart = await removeFromCart(cartId, lineIds);
                return NextResponse.json({ cart });
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        console.error('Cart API error:', error);
        return NextResponse.json(
            { error: 'Cart operation failed' },
            { status: 500 }
        );
    }
}
