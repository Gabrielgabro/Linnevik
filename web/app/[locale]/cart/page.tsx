import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, noIndexMetadata } from '@/lib/metadata';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
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
        alternates: getHreflang('/cart', locale),
        ...noIndexMetadata,
    };
}

export default async function CartPage() {
    // Invoicing is offered only to signed-in company accounts; the API enforces
    // this too. This just decides whether to render the form or a sign-in link.
    const customer = await getCurrentCustomerFromCookies();
    const address = customer?.billingAddress ?? null;
    return (
        <CartClient
            invoiceEligible={Boolean(customer?.email)}
            invoicePrefill={{
                companyName: customer?.company ?? '',
                line1: address?.line1 ?? '',
                line2: address?.line2 ?? '',
                city: address?.city ?? '',
                postalCode: address?.postal_code ?? '',
            }}
        />
    );
}
