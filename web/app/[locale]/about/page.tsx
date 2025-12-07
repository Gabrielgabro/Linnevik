import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, getCanonicalUrl } from '@/lib/metadata';
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
        description: "Läs mer om Linnevik och våra hållbara textilier för hotell och offentlig miljö.",
        metadataBase: new URL('https://linnevik.se'),
        alternates: {
            canonical: getCanonicalUrl(locale, '/about'),
            ...getHreflang('/about'),
        },
    };
}

export default function AboutPage() {
    return <AboutClient />;
}
