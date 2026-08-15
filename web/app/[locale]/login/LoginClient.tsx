'use client';

import { useState } from 'react';
import Button from '@/components/Button';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

type Status = 'idle' | 'sending' | 'sent';

export default function LoginClient() {
    const { t, locale } = useTranslation();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<Status>('idle');

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (status === 'sending') return;
        setStatus('sending');
        try {
            await fetch('/api/auth/magic-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, locale }),
            });
        } finally {
            // Samma neutrala bekräftelse oavsett vad anropet svarade eller om
            // det misslyckades i nätverket — se api/auth/magic-link/route.ts.
            setStatus('sent');
        }
    };

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16 px-6">
            <div className="w-full max-w-md mx-auto">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.login.title}
                    </h1>
                    <p className="text-secondary">
                        {t.login.subtitle}
                    </p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    {status === 'sent' ? (
                        <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                            {t.login.magicLink.sent}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <p className="text-sm text-secondary">{t.login.formSubtitle}</p>

                            <div>
                                <label htmlFor="email" className="block mb-2 text-sm font-medium text-primary">
                                    {t.login.fields.email}
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    maxLength={254}
                                    value={email}
                                    onChange={event => setEmail(event.target.value)}
                                    className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                    placeholder={t.login.placeholders.email}
                                />
                            </div>

                            <div className="space-y-3 pt-2">
                                <Button type="submit" variant="primary" className="w-full" disabled={status === 'sending'}>
                                    {status === 'sending' ? t.login.magicLink.sending : t.login.magicLink.cta}
                                </Button>
                                <LocaleLink
                                    href="/login/create-account"
                                    className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                                >
                                    {t.login.actions.create}
                                </LocaleLink>
                            </div>
                        </form>
                    )}
                </div>

                <p className="mt-6 text-xs text-secondary text-center">
                    {t.login.terms}
                </p>
            </div>
        </main>
    );
}
