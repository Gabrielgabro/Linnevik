'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation, useLocale } from '@/contexts/LocaleContext';
import { activateCustomer } from '../../../actions';

type Props = {
    id: string;
    activationToken: string;
};

export default function ActivateAccountClient({ id, activationToken }: Props) {
    const { t } = useTranslation();
    const locale = useLocale();
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError(t.activation.errors.passwordMismatch);
            return;
        }

        if (password.length < 5) {
            setError(t.activation.errors.passwordTooShort);
            return;
        }

        setLoading(true);

        try {
            const result = await activateCustomer(id, activationToken, password);
            if (result?.error) {
                setError(result.error);
            } else {
                // Success - redirect to account page
                router.push(`/${locale}/account`);
            }
        } catch (err) {
            setError(t.activation.errors.unexpectedError);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto w-full space-y-8">
            <div className="text-center">
                <h2 className="mt-8 text-3xl font-extrabold text-primary">
                    {t.activation.title}
                </h2>
                <p className="mt-2 text-sm text-secondary">
                    {t.activation.subtitle}
                </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div className="rounded-md shadow-sm -space-y-px">
                    <div className="mb-4">
                        <label htmlFor="password" className="sr-only">{t.activation.fields.password}</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                            placeholder={t.activation.fields.password}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="confirmPassword" className="sr-only">{t.activation.fields.confirmPassword}</label>
                        <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            required
                            className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                            placeholder={t.activation.fields.confirmPassword}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                </div>

                {error && (
                    <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
                        {error}
                    </div>
                )}

                <div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                    >
                        {loading ? t.activation.actions.submitting : t.activation.actions.submit}
                    </button>
                </div>
            </form>
        </div>
    );
}

