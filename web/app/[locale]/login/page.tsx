import type { Metadata } from 'next';
import LoginClient from './LoginClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { isAuthenticated, redirectToAccount } from '@/lib/auth-helpers';
import { getHreflang } from '@/lib/metadata';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.login.metadata.title,
        description: t.login.metadata.description,
    };
}

export default async function LoginPage({ params }: Props) {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);

    // Check if already logged in - redirect to account in same locale
    if (await isAuthenticated()) {
        redirectToAccount(locale);
    }

    return <LoginClient />;
}
