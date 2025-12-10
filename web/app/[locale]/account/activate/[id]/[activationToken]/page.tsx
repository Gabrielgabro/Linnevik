
import { Metadata } from 'next';
import ActivateAccountClient from './ActivateAccountClient';
import { normalizeLocale, getTranslations } from '@/lib/i18n';

// This page must be dynamic - we can't pre-generate all possible activation tokens
export const dynamic = 'force-dynamic';

type Props = {
    params: Promise<{ locale: string; id: string; activationToken: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.activation.metadata.title + ' | Linnevik',
        description: t.activation.metadata.description,
    };
}

export default async function ActivateAccountPage({ params }: Props) {
    const { id, activationToken } = await params;

    return (
        <main className="min-h-screen bg-white dark:bg-[#111827] pt-28 pb-16 px-6">
            <div className="w-full max-w-md mx-auto">
                <ActivateAccountClient id={id} activationToken={activationToken} />
            </div>
        </main>
    );
}
