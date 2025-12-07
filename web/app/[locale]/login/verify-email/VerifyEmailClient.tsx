'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/Button';
import { handleVerifyEmail } from '../actions';
import { useTranslation } from '@/contexts/LocaleContext';

export default function VerifyEmailClient() {
    const router = useRouter();
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await handleVerifyEmail(code);

            if (result.status === 'success') {
                setSuccess(true);
                // Redirect to login after 2 seconds
                setTimeout(() => {
                    router.push('/login');
                }, 2000);
            } else {
                setError(result.message ?? t.verifyEmail.genericError);
            }
        } catch (err) {
            setError(t.verifyEmail.genericError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                        {t.verifyEmail.title}
                    </h1>
                    <p className="text-secondary">
                        {t.verifyEmail.subtitle}
                    </p>
                </div>

                <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                    {error && (
                        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                            {t.verifyEmail.success}
                        </div>
                    )}

                    {!success && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="code" className="block mb-2 text-sm font-medium text-primary">
                                    {t.verifyEmail.codeLabel}
                                </label>
                                <input
                                    id="code"
                                    name="code"
                                    type="text"
                                    autoComplete="one-time-code"
                                    required
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary text-center text-2xl tracking-widest outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                                    placeholder={t.verifyEmail.codePlaceholder}
                                    disabled={loading}
                                    autoFocus
                                />
                                <p className="mt-2 text-xs text-secondary text-center">
                                    {t.verifyEmail.codeHelper}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <Button
                                    type="submit"
                                    variant="primary"
                                    className="w-full"
                                    disabled={loading || code.length !== 6}
                                >
                                    {loading ? t.verifyEmail.submitting : t.verifyEmail.submit}
                                </Button>

                                <a
                                    href="/login/create-account"
                                    className="inline-flex w-full items-center justify-center rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-2.5 font-medium text-primary transition hover:bg-[#f4f4f5] dark:hover:bg-[#27272a] text-sm"
                                >
                                    {t.verifyEmail.backToRegister}
                                </a>
                            </div>

                            <div className="text-center pt-2">
                                <p className="text-xs text-secondary">
                                    {t.verifyEmail.codeInfo}
                                </p>
                            </div>
                        </form>
                    )}
                </div>

                <p className="mt-6 text-xs text-secondary text-center">
                    {t.verifyEmail.footer}
                </p>
            </div>
        </main>
    );
}
