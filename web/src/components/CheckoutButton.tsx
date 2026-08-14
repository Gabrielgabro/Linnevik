'use client';

/**
 * Kassaknappen. Försöker Stripe först och faller tillbaka på Shopifys kassa
 * om vår egen inte är konfigurerad eller svarar med fel — butiken ska aldrig
 * bli oköpbar för att migreringen är halvvägs.
 */

import { useState } from 'react';

type CheckoutLine = {
    shopifyVariantId: string;
    quantity: number;
};

type Props = {
    lines: CheckoutLine[];
    /** Shopifys kassa, som reserv. */
    fallbackUrl?: string | null;
    label: string;
    pendingLabel: string;
    errorLabel: string;
};

export default function CheckoutButton({
    lines,
    fallbackUrl,
    label,
    pendingLabel,
    errorLabel,
}: Props) {
    const [isPending, setIsPending] = useState(false);
    const [hasError, setHasError] = useState(false);

    async function startCheckout() {
        if (isPending || !lines.length) return;
        setIsPending(true);
        setHasError(false);

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines }),
            });
            const data = await response.json();

            if (response.ok && data.url) {
                window.location.href = data.url;
                return;
            }

            // 503 betyder att Stripe inte är påslaget ännu. Då är Shopify inte
            // ett fel utan det normala läget.
            if (fallbackUrl) {
                window.location.href = fallbackUrl;
                return;
            }
            throw new Error(data.error ?? 'Checkout failed.');
        } catch (error) {
            console.error('[Checkout]', error);
            if (fallbackUrl) {
                window.location.href = fallbackUrl;
                return;
            }
            setHasError(true);
            setIsPending(false);
        }
    }

    return (
        <div className="mt-6">
            <button
                type="button"
                onClick={startCheckout}
                disabled={isPending || !lines.length}
                className="block w-full py-3 px-6 text-center rounded-full bg-accent text-color-accent-primary font-semibold hover:bg-accent/90 transition-colors disabled:opacity-60"
            >
                {isPending ? pendingLabel : label}
            </button>
            {hasError && (
                <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {errorLabel}
                </p>
            )}
        </div>
    );
}
