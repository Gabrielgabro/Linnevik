'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { LocaleLink } from '@/components/LocaleLink';
import { useTranslation } from '@/contexts/LocaleContext';

type Status = 'idle' | 'confirming' | 'success' | 'invalid' | 'expired' | 'error';

export default function VerifyClient({ token }: { token: string | null }) {
    const router = useRouter();
    const { t, locale } = useTranslation();
    const [status, setStatus] = useState<Status>(token ? 'idle' : 'invalid');

    // Ett riktigt klick — inte sidladdningen — är det som får lov att lösa in
    // token. Se page.tsx och lib/magicLink.ts för varför.
    const confirm = async () => {
        if (!token) return;
        setStatus('confirming');
        try {
            const response = await fetch('/api/auth/magic-link/consume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            if (response.ok) {
                setStatus('success');
                setTimeout(() => {
                    router.push(`/${locale}/account`);
                    router.refresh();
                }, 1200);
                return;
            }
            const data = await response.json().catch(() => ({}));
            setStatus(data.error === 'expired' ? 'expired' : 'invalid');
        } catch {
            setStatus('error');
        }
    };

    const errorMessage =
        status === 'invalid'
            ? (token ? t.magicLinkVerify.invalid : t.magicLinkVerify.missingToken)
            : status === 'expired'
                ? t.magicLinkVerify.expired
                : status === 'error'
                    ? t.magicLinkVerify.genericError
                    : null;

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.magicLinkVerify.title}
                    </h1>
                    <p className="text-secondary">{t.magicLinkVerify.subtitle}</p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    {status === 'success' && (
                        <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                            {t.magicLinkVerify.success}
                        </div>
                    )}

                    {errorMessage && (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                                {errorMessage}
                            </div>
                            <LocaleLink
                                href="/login"
                                className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] text-sm"
                            >
                                {t.magicLinkVerify.requestNew}
                            </LocaleLink>
                        </div>
                    )}

                    {(status === 'idle' || status === 'confirming') && (
                        <Button
                            type="button"
                            variant="primary"
                            className="w-full"
                            disabled={status === 'confirming'}
                            onClick={confirm}
                        >
                            {status === 'confirming' ? t.magicLinkVerify.confirming : t.magicLinkVerify.confirm}
                        </Button>
                    )}
                </div>
            </div>
        </main>
    );
}
