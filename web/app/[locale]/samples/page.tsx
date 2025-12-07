import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
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
        description: "Beställ tygprover gratis för att känna på kvaliteten innan du bestämmer dig.",
        alternates: {
            languages: {
                'sv': 'https://linnevik.se/sv/samples',
                'en': 'https://linnevik.se/en/samples',
            },
        },
    };
}

export default function SamplesPage() {
    return <SamplesClient />;
}
