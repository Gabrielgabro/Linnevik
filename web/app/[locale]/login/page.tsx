import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { isAuthenticated } from '@/lib/auth-helpers';
import { getHreflang } from '@/lib/metadata';


import { getStaticLocaleParams } from '@/lib/staticParams';

export async function generateStaticParams() {
    return getStaticLocaleParams();
}

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
        redirect(`/${locale}/account`);
    }

    return <LoginClient />;
}

