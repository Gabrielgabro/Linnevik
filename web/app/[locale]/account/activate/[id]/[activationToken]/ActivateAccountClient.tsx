'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/contexts/LocaleContext';
import { activateCustomer } from '../../../actions';
import Button from '@/components/Button';

type Props = {
    id: string;
    activationToken: string;
};

export default function ActivateAccountClient({ id, activationToken }: Props) {
    const { t, locale } = useTranslation();
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
        <div className="w-full max-w-md">
            <div className="mb-8 text-center">
                <h1 className="mb-3 text-3xl font-bold text-primary md:text-4xl">
                    {t.activation.title}
                </h1>
                <p className="text-secondary">
                    {t.activation.subtitle}
                </p>
            </div>

            <div className="rounded-2xl border border-light bg-white dark:bg-[#1f2937] p-8 shadow-sm">
                {error && (
                    <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="password" className="block mb-2 text-sm font-medium text-primary">
                            {t.activation.fields.password}
                        </label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            required
                            className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                            placeholder={t.activation.fields.password}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div>
                        <label htmlFor="confirmPassword" className="block mb-2 text-sm font-medium text-primary">
                            {t.activation.fields.confirmPassword}
                        </label>
                        <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            autoComplete="new-password"
                            required
                            className="w-full rounded-lg border border-light bg-white dark:bg-[#111827] px-4 py-3 text-primary outline-none transition focus:border-[#0B3D2E] dark:focus:border-[#145C45] focus:ring-2 focus:ring-[#0B3D2E]/20 dark:focus:ring-[#145C45]/30"
                            placeholder={t.activation.fields.confirmPassword}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    <div className="pt-2">
                        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                            {loading ? t.activation.actions.submitting : t.activation.actions.submit}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

