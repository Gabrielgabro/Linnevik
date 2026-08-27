'use client';

/**
 * Kassaknappen öppnar Stripe från en servervaliderad, ägd korg.
 */

import { useState } from 'react';

type Props = {
    cartId?: string;
    label: string;
    pendingLabel: string;
    errorLabel: string;
    discountCode?: string;
    disabled?: boolean;
};

export default function CheckoutButton({
    cartId,
    label,
    pendingLabel,
    errorLabel,
    discountCode,
    disabled = false,
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

            throw new Error(data.error ?? 'Checkout failed.');
        } catch (error) {
            console.error('[Checkout]', error);
            setError(error instanceof Error ? error.message : errorLabel);
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
