import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import CartClient from './CartClient';

type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.cart.title + " | Linnevik",
        description: "Din varukorg hos Linnevik.",
        metadataBase: new URL('https://linnevik.se'),
        alternates: {
            canonical: `https://linnevik.se/${locale}/cart`,
            languages: {
                'sv': 'https://linnevik.se/sv/cart',
                'en': 'https://linnevik.se/en/cart',
            },
        },
    };
}

export default function CartPage() {
    return <CartClient />;
}
