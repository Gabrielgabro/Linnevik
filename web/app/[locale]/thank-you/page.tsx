import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
import ThankYouClient from './ThankYouClient';


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
        title: t.thankYou.title + " | Linnevik",
        description: t.thankYou.message,
        alternates: getHreflang('/thank-you', locale),
    };
}

export default function ThankYouPage() {
    return <ThankYouClient />;
}
