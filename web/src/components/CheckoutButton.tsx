'use client';

/**
 * Kassaknappen öppnar Stripe från en servervaliderad, ägd korg.
 */

import { useState } from 'react';

/**
 * Turn an API failure into something the buyer can read *in their language*.
 *
 * The response carries a stable `code`; the `error` string alongside it is for
 * the log, not the page. Rendering it directly showed English sentences to
 * Swedish buyers and Swedish ones to English buyers depending on which layer
 * had raised the error.
 */
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
    const hasContent = Boolean(cartId) && !disabled;

    async function startCheckout() {
        if (isPending || !hasContent) return;
        setIsPending(true);
        setError(null);

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
