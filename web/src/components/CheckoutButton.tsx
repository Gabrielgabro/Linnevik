'use client';

/**
 * Kassaknappen öppnar Stripe från en servervaliderad, ägd korg.
 */

import { useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useCart } from '@/contexts/CartContext';

/**
 * Turn an API failure into something the buyer can read *in their language*.
 *
 * The response carries a stable `code`; the `error` string alongside it is for
 * the log, not the page. Rendering it directly showed English sentences to
 * Swedish buyers and Swedish ones to English buyers depending on which layer
 * had raised the error.
 */
/**
 * Svar som betyder att korgen på servern inte längre är den som visas:
 * lagret, priserna eller korgen själv har ändrats. Då läses korgen om, så att
 * kunden ser det som felet talar om (plan.md, H7).
 */
export const CART_CHANGED_CODES = new Set([
    'STOCK_CHANGED', 'CART_INVALID', 'CART_REPRICED', 'INSUFFICIENT_STOCK', 'NOT_FOR_SALE',
    'BELOW_MINIMUM', 'INVALID_INCREMENT', 'INVALID_QUANTITY', 'CART_NOT_FOUND', 'CHECKOUT_IN_PROGRESS',
]);

export function messageForCode(
    data: { code?: unknown; error?: unknown },
    messages: Record<string, string>,
    fallback: string
): string {
    if (typeof data.code === 'string' && messages[data.code]) return messages[data.code];
    // Cart-rule rejections have no fixed wording: they name the SKU and what
    // is wrong with it, which is worth more to the buyer than a generic line.
    // They are Swedish-only for now — the rule library builds the sentence.
    if (typeof data.error === 'string' && data.error) return data.error;
    return fallback;
}

type Props = {
    cartId?: string;
    label: string;
    pendingLabel: string;
    errorLabel: string;
    discountCode?: string;
    disabled?: boolean;
    errorMessages: Record<string, string>;
};

export default function CheckoutButton({
    cartId,
    label,
    pendingLabel,
    errorLabel,
    discountCode,
    disabled = false,
    errorMessages,
}: Props) {
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Proxyn ligger inte framför /api, så språket i adressen når inte rutten
    // av sig självt. Utan det öppnades Stripe-kassan på svenska för en köpare
    // som läste sidan på engelska.
    const { locale } = useLocale();
    const { refreshCart } = useCart();
    const hasContent = Boolean(cartId) && !disabled;

    async function startCheckout() {
        if (isPending || !hasContent) return;
        setIsPending(true);
        setError(null);

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-linnevik-locale': locale },
                body: JSON.stringify({ cartId, discountCode }),
            });
            const data = await response.json();

            if (response.ok && data.url) {
                window.location.href = data.url;
                return;
            }

            console.error('[Checkout]', data.code, data.error);
            setError(messageForCode(data, errorMessages, errorLabel));
            setIsPending(false);
            if (CART_CHANGED_CODES.has(data.code)) await refreshCart().catch(() => {});
        } catch (error) {
            console.error('[Checkout]', error);
            setError(errorLabel);
            setIsPending(false);
        }
    }

    return (
        <div className="mt-6">
            <button
                type="button"
                onClick={startCheckout}
                disabled={isPending || !hasContent}
                className="block w-full py-3 px-6 text-center rounded-full bg-accent text-color-accent-primary font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
                {isPending ? pendingLabel : label}
            </button>
            {error && (
                <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {error}
                </p>
            )}
        </div>
    );
}
