import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';
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
        description: t.cart.metadata.description,
        alternates: getHreflang('/cart'),
    };
}

export default function CartPage() {
    return <CartClient />;
}
