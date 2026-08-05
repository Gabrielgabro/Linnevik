import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';
import AboutClient from './AboutClient';

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
        title: t.about.hero.heading + " | Linnevik",
        description: t.about.metadata.description,
        metadataBase: new URL(SITE_URL),
        alternates: getHreflang('/about', locale),
    };
}

export default function AboutPage() {
    return <AboutClient />;
}
