import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import ThankYouClient from './ThankYouClient';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.thankYou.title + " | Linnevik",
        description: "Tack för att du beställde prover från Linnevik.",
        alternates: {
            languages: {
                'sv': 'https://linnevik.se/sv/thank-you',
                'en': 'https://linnevik.se/en/thank-you',
            },
        },
    };
}

export default function ThankYouPage() {
    return <ThankYouClient />;
}
