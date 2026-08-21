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
    isOwnedCommerce: true;
    addItem: (variantId: string, quantity: number) => Promise<void>;
    updateItem: (lineId: string, quantity: number) => Promise<void>;
    removeItem: (lineId: string) => Promise<void>;
    refreshCart: () => Promise<void>;
    updateCartCountry: (country: string) => Promise<void>;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const OWNED_CART_STORAGE_KEY = 'linnevik_cart_id';

type OwnedCartLine = {
    id: number;
    variantId: number;
    quantity: number;
    sku: string;
    productHandle: string;
    productTitle: string;
    variantTitle: Array<{ name: string; value: string }>;
    unitAmountMinor: number;
    currency: string;
    imageUrl: string | null;
    imageAlt: string | null;
};

type OwnedCart = {
    id: string;
    currency: string;
    lines: OwnedCartLine[];
    subtotalMinor: number;
    totalMinor: number;
    vatMinor: number;
    totalIncVatMinor: number;
};

function money(minor: number, currency: string) {
    return { amount: (minor / 100).toFixed(2), currencyCode: currency.toUpperCase() };
}

/**
 * Reshapes the owned cart API's response into the same `Cart` contract the
 * storefront already speaks (a retained compatibility shape). Keeps
 * Header, CartClient, ProductForm etc. unaware of which backend answered.
 */
function adaptOwnedCart(owned: OwnedCart): Cart {
    return {
        id: owned.id,
        checkoutUrl: '',
        totalQuantity: owned.lines.reduce((sum, line) => sum + line.quantity, 0),
        cost: {
            // Korgsidan visar "Delsumma exkl. moms" och "Totalt inkl. moms" och
            // räknar momsen som skillnaden mellan de två. Totalen måste därför
            // vara inklusive moms — annars står det "inkl. moms" över ett belopp
            // utan moms, och kassan drar ett högre.
            totalAmount: money(owned.totalIncVatMinor, owned.currency),
            subtotalAmount: money(owned.subtotalMinor, owned.currency),
        },
        lines: {
            edges: owned.lines.map(line => ({
                node: {
                    id: String(line.id),
                    quantity: line.quantity,
                    merchandise: {
                        id: String(line.variantId),
                        title: line.variantTitle.length
                            ? line.variantTitle.map(option => option.value).join(' / ')
                            : 'Default Title',
                        price: money(line.unitAmountMinor, line.currency),
                        product: {
                            id: line.sku,
                            title: line.productTitle,
                            handle: line.productHandle,
                            featuredImage: line.imageUrl ? { url: line.imageUrl, altText: line.imageAlt } : null,
                        },
                    },
                },
            })),
        },
    };
}

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<Cart>(null);
    // Starts true so the cart page renders its loading state instead of
    // flashing "your cart is empty" before the stored cart has been fetched.
    const [isLoading, setIsLoading] = useState(true);

    const storageKey = OWNED_CART_STORAGE_KEY;

    useEffect(() => {
        const loadCart = async () => {
            const cartId = localStorage.getItem(storageKey);
            if (!cartId) {
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/store/cart/${cartId}`);
                if (response.ok) {
                    const data = await response.json();
                    setCart(adaptOwnedCart(data.cart));
                } else if (response.status === 404) {
                    // Expired (30-day TTL) or already checked out — never coming back.
                    localStorage.removeItem(storageKey);
                } else {
                    console.error('Failed to load cart:', await response.text());
                }
            } catch (error) {
                // Network or parse failure — same reasoning, keep the ID.
                console.error('Failed to load cart:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadCart();
        // The storage key is constant for the lifetime of the application.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshCart = async () => {
        const cartId = cart?.id || localStorage.getItem(storageKey);
        if (!cartId) return;

        try {
            const response = await fetch(`/api/store/cart/${cartId}`);
            if (response.ok) {
                const data = await response.json();
                setCart(adaptOwnedCart(data.cart));
            }
        } catch (error) {
            console.error('Failed to refresh cart:', error);
        }
    };

    const addItem = async (variantId: string, quantity: number) => {
        setIsLoading(true);
        try {
            let id: string | null = cart?.id || localStorage.getItem(storageKey);
            if (!id) {
                const createResponse = await fetch('/api/store/cart', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
                });
                const createData = await createResponse.json();
                id = createData.cart?.id ?? null;
                if (id) localStorage.setItem(storageKey, id);
            }
            if (!id || !variantId.startsWith('linnevik:')) throw new Error('Invalid owned cart variant');
            const response = await fetch(`/api/store/cart/${id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variantId: Number(variantId.slice('linnevik:'.length)), quantity,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add item');
            setCart(adaptOwnedCart(data.cart));
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
            const response = await fetch(`/api/store/cart/${cart.id}/items/${lineId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update item');
            setCart(adaptOwnedCart(data.cart));
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
            const response = await fetch(`/api/store/cart/${cart.id}/items/${lineId}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to remove item');
            setCart(adaptOwnedCart(data.cart));
        } catch (error) {
            console.error('Failed to remove item:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const updateCartCountry = async () => {
        // Owned commerce is intentionally Sweden/SEK-only.
    };

    return (
        <CartContext.Provider
            value={{
                cart,
                isLoading,
                isOwnedCommerce: true,
                addItem,
                updateItem,
                removeItem,
                refreshCart,
                updateCartCountry,
            }}
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
