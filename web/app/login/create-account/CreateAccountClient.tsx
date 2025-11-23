'use client';

import { useActionState } from 'react';
import { handleRegister, type RegisterState } from '../actions';
import { useTranslation } from '@/hooks/useTranslation';
import Button from '@/components/Button';

const initialState: RegisterState = { status: 'idle' };

export default function CreateAccountClient() {
    const { t } = useTranslation();
    const [state, formAction] = useActionState(handleRegister, initialState);
    const formKey = state.fields ? JSON.stringify(state.fields) : 'initial';

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16">
            <div className="mx-auto max-w-md px-6">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.login.actions.create}
                    </h1>
                    <p className="text-secondary">{t.register.title}</p>
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

                    <form key={formKey} action={formAction} className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="firstName" className="block mb-2 text-sm font-medium text-primary">
                                    First name
                                </label>
                                <input
                                    id="firstName"
                                    name="firstName"
                                    type="text"
                                    autoComplete="given-name"
                                    maxLength={100}
                                    className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                    placeholder="Alex"
                                    defaultValue={state.fields?.firstName ?? ''}
                                />
                            </div>

                            <div>
                                <label htmlFor="lastName" className="block mb-2 text-sm font-medium text-primary">
                                    Last name
                                </label>
                                <input
                                    id="lastName"
                                    name="lastName"
                                    type="text"
                                    autoComplete="family-name"
                                    maxLength={100}
                                    className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                    placeholder="Johansson"
                                    defaultValue={state.fields?.lastName ?? ''}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="companyRegistrationNumber" className="block mb-2 text-sm font-medium text-primary">
                                {t.register.companyLabel}
                            </label>
                            <input
                                id="companyRegistrationNumber"
                                name="companyRegistrationNumber"
                                type="text"
                                autoComplete="organization"
                                required
                                pattern="[A-Za-z]{2}[A-Za-z0-9]{2,12}"
                                className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                placeholder={t.register.companyPlaceholder}
                                title={t.register.companyHelper}
                                defaultValue={state.fields?.companyRegistrationNumber ?? ''}
                            />
                            <p className="mt-2 text-sm text-secondary">{t.register.companyHelper}</p>
                        </div>

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
                                className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                placeholder="you@example.com"
                                defaultValue={state.fields?.email ?? ''}
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
                                autoComplete="new-password"
                                required
                                minLength={8}
                                maxLength={128}
                                className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                placeholder="••••••••"
                            />
                            <p className="mt-1 text-xs text-secondary">Minimum 8 characters</p>
                        </div>

                        <div className="space-y-3 pt-2">
                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full text-center"
                                disabled={state.status === 'success'}
                            >
                                {t.login.actions.create}
                            </Button>
                            <a
                                href="/login"
                                className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a]"
                            >
                                {t.register.backToLogin}
                            </a>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}
