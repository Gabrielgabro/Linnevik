import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import CheckoutClient from './CheckoutClient';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.samplesCheckout.header.title + " | Linnevik",
        description: "Fyll i dina uppgifter för att få dina tygprover skickade till dig.",
        alternates: {
            languages: {
                'sv': 'https://linnevik.se/sv/samples/checkout',
                'en': 'https://linnevik.se/en/samples/checkout',
            },
        },
    };
}

export default function SamplesCheckoutPage() {
    return <CheckoutClient />;
}
