'use client';

import { useActionState } from 'react';
import { handleLogin, type LoginState } from './actions';
import Button from '@/components/Button';
import { useTranslation } from '@/contexts/LocaleContext';
import { LocaleLink } from '@/components/LocaleLink';

const initialState: LoginState = { status: 'idle' };

export default function LoginClient() {
    const [state, formAction] = useActionState(handleLogin, initialState);
    const { t } = useTranslation();

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.login.title}
                    </h1>
                    <p className="text-secondary">
                        {t.login.subtitle}
                    </p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    {state.status === 'error' && state.message && (
                        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                            {state.message}
                        </div>
                    )}

                    {state.status === 'success' && state.message && (
                        <div className="mb-6 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                            {state.message}
                        </div>
                    )}

                    <form action={formAction} className="space-y-5">
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
                                className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                placeholder={t.login.placeholders.email}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block mb-2 text-sm font-medium text-primary">
                                {t.login.fields.password}
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                placeholder={t.login.placeholders.password}
                            />
                        </div>

                        <div className="space-y-3 pt-2">
                            <Button type="submit" variant="primary" className="w-full">
                                {t.login.actions.signIn}
                            </Button>
                            <LocaleLink
                                href="/login/create-account"
                                className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                            >
                                {t.login.actions.create}
                            </LocaleLink>
                        </div>
                    </form>
                </div>

                <p className="mt-6 text-xs text-secondary text-center">
                    {t.login.terms}
                </p>
            </div>
        </main>
    );
}
