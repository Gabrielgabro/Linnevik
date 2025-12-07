import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
import SamplesClient from './SamplesClient';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.samples.hero.title + " | Linnevik",
        description: t.samples.metadata.description,
        alternates: getHreflang('/samples', locale),
    };
}

export default function SamplesPage() {
    return <SamplesClient />;
}
