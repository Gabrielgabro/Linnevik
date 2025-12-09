'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type CartLine = {
    id: string;
    quantity: number;
    merchandise: {
        id: string;
        title: string;
        price: { amount: string; currencyCode: string };
        product: {
            id: string;
            title: string;
            handle: string;
            featuredImage?: { url: string; altText?: string | null } | null;
        };
    };
};

type Cart = {
    id: string;
    checkoutUrl: string;
    totalQuantity: number;
    cost: {
        totalAmount: { amount: string; currencyCode: string };
        subtotalAmount: { amount: string; currencyCode: string };
    };
    lines: { edges: { node: CartLine }[] };
} | null;

type CartContextType = {
    cart: Cart;
    isLoading: boolean;
    addItem: (variantId: string, quantity: number) => Promise<void>;
    updateItem: (lineId: string, quantity: number) => Promise<void>;
    removeItem: (lineId: string) => Promise<void>;
    refreshCart: () => Promise<void>;
    updateCartCountry: (country: string) => Promise<void>;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<Cart>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Load cart from localStorage on mount
    useEffect(() => {
        const loadCart = async () => {
            const cartId = localStorage.getItem('shopify_cart_id');
            if (cartId) {
                try {
                    const response = await fetch('/api/cart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'get', cartId }),
                    });
                    const data = await response.json();
                    if (data.cart) {
                        setCart(data.cart);
                    } else {
                        // Cart not found, clear localStorage
                        localStorage.removeItem('shopify_cart_id');
                    }
                } catch (error) {
                    console.error('Failed to load cart:', error);
                    localStorage.removeItem('shopify_cart_id');
                }
            }
        };
        loadCart();
    }, []);

    const refreshCart = async () => {
        const cartId = cart?.id || localStorage.getItem('shopify_cart_id');
        if (!cartId) return;

        try {
            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'get', cartId }),
            });
            const data = await response.json();
            if (data.cart) {
                setCart(data.cart);
            }
        } catch (error) {
            console.error('Failed to refresh cart:', error);
        }
    };

    const addItem = async (variantId: string, quantity: number) => {
        setIsLoading(true);
        try {
            let cartId: string | null = cart?.id || localStorage.getItem('shopify_cart_id');

            // Create cart if it doesn't exist
            if (!cartId) {
                const createResponse = await fetch('/api/cart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create' }),
                });
                const createData = await createResponse.json();
                cartId = createData.cart.id;
                if (cartId) {
                    localStorage.setItem('shopify_cart_id', cartId);
                }
                setCart(createData.cart);
            }

            // Add item to cart (only if cartId exists)
            if (!cartId) {
                throw new Error('Failed to create cart');
            }

            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add',
                    cartId,
                    variantId,
                    quantity,
                }),
            });
            const data = await response.json();
            setCart(data.cart);
        } catch (error) {
            console.error('Failed to add item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const updateItem = async (lineId: string, quantity: number) => {
        if (!cart?.id) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    cartId: cart.id,
                    lineId,
                    quantity,
                }),
            });
            const data = await response.json();
            setCart(data.cart);
        } catch (error) {
            console.error('Failed to update item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const removeItem = async (lineId: string) => {
        if (!cart?.id) return;
        setIsLoading(true);
        try {
            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'remove',
                    cartId: cart.id,
                    lineIds: [lineId],
                }),
            });
            const data = await response.json();
            setCart(data.cart);
        } catch (error) {
            console.error('Failed to remove item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const updateCartCountry = async (country: string) => {
        const cartId = cart?.id || localStorage.getItem('shopify_cart_id');
        if (!cartId) return; // No cart to update

        try {
            const response = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'updateBuyerIdentity', cartId, country }),
            });
            const data = await response.json();
            if (data.cart) {
                setCart(data.cart);
            }
        } catch (error) {
            console.error('Failed to update cart country:', error);
        }
    };

    return (
        <CartContext.Provider
            value={{ cart, isLoading, addItem, updateItem, removeItem, refreshCart, updateCartCountry }}
        >
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
}
