'use client';

import { useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export default function LoginClient() {
    const { t } = useTranslation();

    const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
    const accountUrl = useMemo(
        () => (storeDomain ? `https://${storeDomain}/account` : '/'),
        [storeDomain]
    );

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16">
            <div className="mx-auto max-w-xl px-6">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.login.title}
                    </h1>
                    <p className="text-secondary">
                        {t.login.subtitle}
                    </p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm space-y-4">
                    <p className="text-secondary text-sm md:text-base">
                        Vi har flyttat till Shopifys nya kundkonton. Använd knappen nedan för att logga in eller hantera ditt konto.
                    </p>

                    <a
                        href={accountUrl}
                        className="inline-flex w-full items-center justify-center px-6 py-3 font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ring-custom bg-accent-primary text-white text-center"
                    >
                        {t.login.actions.signIn}
                    </a>

                    <p className="text-xs text-secondary text-center">
                        Behöver du återställa lösenordet? Du kan göra det från Shopifys kontosida efter att du klickat på "{t.login.actions.signIn}".
                    </p>
                </div>
            </div>
        </main>
    );
}
