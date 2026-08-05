import type { Metadata } from 'next';
import ForgotPasswordClient from './ForgotPasswordClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, noIndexMetadata } from '@/lib/metadata';
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
        title: t.forgot.metadata.title + ' | Linnevik',
        description: t.forgot.metadata.description,
        alternates: getHreflang('/login/forgot', locale),
        ...noIndexMetadata,
    };
}

export default function ForgotPasswordPage() {
    return <ForgotPasswordClient />;
}
