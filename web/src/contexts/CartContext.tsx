'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

type CartLine = {
    id: string;
    quantity: number;
    /** Beställningsreglerna servern validerar mot, så korgen kan stega rätt. */
    minimumOrderQuantity: number;
    orderIncrement: number;
    /** `null` när lagret inte följs — då finns inget tak. */
    availableQuantity: number | null;
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
    vatPercent: number;
    cost: {
        totalAmount: { amount: string; currencyCode: string };
        subtotalAmount: { amount: string; currencyCode: string };
    };
    lines: { edges: { node: CartLine }[] };
} | null;

type CartContextType = {
    cart: Cart;
    isLoading: boolean;
    /** Line ids with an update/remove request currently in flight. */
    pendingLineIds: string[];
    /** Senaste felet från en korgändring, redan översatt av servern. */
    error: string | null;
    clearError: () => void;
    isOwnedCommerce: true;
    addItem: (variantId: string, quantity: number) => Promise<void>;
    updateItem: (lineId: string, quantity: number) => Promise<void>;
    removeItem: (lineId: string) => Promise<void>;
    refreshCart: () => Promise<void>;
    updateCartCountry: (country: string) => Promise<void>;
};

/**
 * Räknar om summorna från raderna efter en optimistisk ändring så att
 * sammanfattningen uppdateras direkt. Momsen räknas på samma procentsats
 * servern angav; nästa svar skriver ändå över med exakta belopp.
 */
function recostCart(current: NonNullable<Cart>): NonNullable<Cart> {
    const subtotal = current.lines.edges.reduce(
        (sum, { node }) => sum + parseFloat(node.merchandise.price.amount) * node.quantity,
        0,
    );
    return {
        ...current,
        totalQuantity: current.lines.edges.reduce((sum, { node }) => sum + node.quantity, 0),
        cost: {
            subtotalAmount: { ...current.cost.subtotalAmount, amount: subtotal.toFixed(2) },
            totalAmount: {
                ...current.cost.totalAmount,
                amount: (subtotal * (1 + current.vatPercent / 100)).toFixed(2),
            },
        },
    };
}

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
    minimumOrderQuantity: number;
    orderIncrement: number;
    availableQuantity: number | null;
};

type OwnedCart = {
    id: string;
    currency: string;
    lines: OwnedCartLine[];
    subtotalMinor: number;
    totalMinor: number;
    vatMinor: number;
    totalIncVatMinor: number;
    vatPercent: number;
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
        vatPercent: owned.vatPercent ?? 0,
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
                    minimumOrderQuantity: line.minimumOrderQuantity ?? 1,
                    orderIncrement: line.orderIncrement ?? 1,
                    availableQuantity: line.availableQuantity ?? null,
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
    const [pendingLineIds, setPendingLineIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const storageKey = OWNED_CART_STORAGE_KEY;

    const beginLine = (lineId: string) =>
        setPendingLineIds(current => (current.includes(lineId) ? current : [...current, lineId]));
    const endLine = (lineId: string) =>
        setPendingLineIds(current => current.filter(id => id !== lineId));
    const clearError = useCallback(() => setError(null), []);

    // Servern skyddar korgen med ett versionslås: två ändringar som skickas
    // samtidigt läser samma version och den ena nekas med 409. Alla ändringar
    // körs därför i en kö, en i taget, så snabba klick aldrig krockar med
    // varandra. Kön ligger i en ref eftersom den överlever omritningar.
    const mutationQueue = useRef<Promise<unknown>>(Promise.resolve());

    // Kön kör uppgifter som köades innan den senaste omritningen, så deras
    // stängning kan peka på en gammal korg. Refen är därför korgens sanning
    // för kön och skrivs i samma andetag som tillståndet: en uppgift kan
    // starta i samma mikrotask som den föregåendes `setCart`, alltså innan
    // React hunnit rita om, och måste ändå se det senaste svaret.
    const latestCart = useRef<Cart>(null);

    const applyCart = useCallback((next: Cart) => {
        latestCart.current = next;
        setCart(next);
    }, []);

    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const next = mutationQueue.current.then(task, task);
        // Kedjan får aldrig fastna i ett avvisat löfte — felet hanteras i
        // uppgiften själv, det här håller bara kön vid liv.
        mutationQueue.current = next.catch(() => undefined);
        return next;
    }

    /** En korg som hunnit gå ut eller checkats ut kommer aldrig tillbaka. */
    function forgetStaleCart() {
        localStorage.removeItem(storageKey);
        applyCart(null);
    }

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
                    applyCart(adaptOwnedCart(data.cart));
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
        const cartId = latestCart.current?.id || localStorage.getItem(storageKey);
        if (!cartId) return;

        try {
            const response = await fetch(`/api/store/cart/${cartId}`);
            if (response.ok) {
                const data = await response.json();
                applyCart(adaptOwnedCart(data.cart));
            } else if (response.status === 404) {
                forgetStaleCart();
            }
        } catch (caught) {
            console.error('Failed to refresh cart:', caught);
        }
    };

    const addItem = (variantId: string, quantity: number) =>
        enqueue(async () => {
            setIsLoading(true);
            setError(null);
            try {
                let id: string | null = latestCart.current?.id || localStorage.getItem(storageKey);
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
                const data = await response.json().catch(() => ({}));
                if (response.status === 404 || response.status === 409) {
                    // Korgen kan ha gått ut, checkats ut eller ändrats i en
                    // annan flik. Vad som gäller vet bara servern, så vi läser
                    // om den — `refreshCart` glömmer korgen om den är borta.
                    await refreshCart();
                }
                if (!response.ok) throw new Error(data.error || 'Kunde inte lägga till varan.');
                applyCart(adaptOwnedCart(data.cart));
            } catch (caught) {
                console.error('Failed to add item:', caught);
                setError(caught instanceof Error ? caught.message : 'Kunde inte lägga till varan.');
                throw caught;
            } finally {
                setIsLoading(false);
            }
        });

    /**
     * Ändringar på en rad läggs på direkt i gränssnittet och rullas tillbaka
     * om servern nekar. De rör aldrig den globala `isLoading`-flaggan: korgsidan
     * visar en helsidesladdning när den är satt, vilket skulle plocka bort
     * raden — och knappen mitt i klicket. I stället markeras raden som pågående.
     */
    function mutateLine(
        lineId: string,
        optimistic: (current: NonNullable<Cart>) => NonNullable<Cart>,
        request: (cartId: string) => Promise<Response>,
        fallbackMessage: string,
    ) {
        return enqueue(async () => {
            // Läses ur kön, inte ur stängningen: en tidigare ändring i kön kan
            // redan ha bytt ut korgen sedan klicket gjordes.
            const previous = latestCart.current;
            if (!previous?.id) return;
            if (!previous.lines.edges.some(edge => edge.node.id === lineId)) return;

            setError(null);
            applyCart(recostCart(optimistic(previous)));
            beginLine(lineId);
            try {
                const response = await request(previous.id);
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    // 404 kan lika gärna betyda att raden redan är borta som
                    // att korgen är det, och 409 att en annan flik hann före.
                    // Servern är enda källan — läs om i stället för att gissa.
                    if (response.status === 404 || response.status === 409) {
                        setError(data.error || fallbackMessage);
                        await refreshCart();
                        return;
                    }
                    throw new Error(data.error || fallbackMessage);
                }
                applyCart(adaptOwnedCart(data.cart));
            } catch (caught) {
                console.error('Cart mutation failed:', caught);
                setError(caught instanceof Error ? caught.message : fallbackMessage);
                applyCart(previous);
            } finally {
                endLine(lineId);
            }
        });
    }

    const updateItem = (lineId: string, quantity: number) =>
        mutateLine(
            lineId,
            current => ({
                ...current,
                lines: {
                    edges: current.lines.edges.map(edge =>
                        edge.node.id === lineId ? { node: { ...edge.node, quantity } } : edge,
                    ),
                },
            }),
            cartId =>
                fetch(`/api/store/cart/${cartId}/items/${lineId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ quantity }),
                }),
            'Antalet kunde inte uppdateras.',
        );

    const removeItem = (lineId: string) =>
        mutateLine(
            lineId,
            current => ({
                ...current,
                lines: { edges: current.lines.edges.filter(edge => edge.node.id !== lineId) },
            }),
            cartId => fetch(`/api/store/cart/${cartId}/items/${lineId}`, { method: 'DELETE' }),
            'Varan kunde inte tas bort.',
        );

    const updateCartCountry = async () => {
        // Owned commerce is intentionally Sweden/SEK-only.
    };

    return (
        <CartContext.Provider
            value={{
                cart,
                isLoading,
                pendingLineIds,
                error,
                clearError,
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
