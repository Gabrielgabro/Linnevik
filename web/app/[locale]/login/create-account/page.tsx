import type { Metadata } from 'next';
import CreateAccountClient from './CreateAccountClient';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
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
        title: t.register.metadata.title,
        description: t.register.metadata.description,
        alternates: getHreflang('/login/create-account', locale),
    };
}

export default async function CreateAccountPage({ params }: Props) {
    return <CreateAccountClient />;
}
