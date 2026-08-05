import { Metadata } from 'next';
import ResetPasswordClient from './ResetPasswordClient';
import { normalizeLocale, getTranslations } from '@/lib/i18n';
import { noIndexMetadata } from '@/lib/metadata';

// This page must be dynamic - we can't pre-generate all possible reset tokens
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string; id: string; resetToken: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.reset.metadata.title + ' | Linnevik',
        description: t.reset.metadata.description,
        ...noIndexMetadata,
    };
}

export default async function ResetPasswordPage({ params }: Props) {
    const { id, resetToken } = await params;

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16 px-6">
            <div className="w-full max-w-md mx-auto">
                <ResetPasswordClient id={id} resetToken={resetToken} />
            </div>
        </main>
    );
}
