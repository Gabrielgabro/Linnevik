import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
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
        description: t.samplesCheckout.metadata.description,
        alternates: getHreflang('/samples/checkout'),
    };
}

export default function SamplesCheckoutPage() {
    return <CheckoutClient />;
}
