import type { Metadata } from 'next';
import VerifyEmailClient from './VerifyEmailClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.verifyEmail.metadata.title,
        description: t.verifyEmail.metadata.description,
        alternates: getHreflang('/login/verify-email'),
    };
}

export default async function VerifyEmailPage({ params }: Props) {
    return <VerifyEmailClient />;
}
