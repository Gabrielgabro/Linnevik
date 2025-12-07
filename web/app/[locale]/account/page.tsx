import type { Metadata } from 'next';
import AccountClient from './AccountClient';
import { getCurrentCustomerFromCookies, getCustomerOrders } from '@/lib/customerAccount';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang } from '@/lib/metadata';


type Props = {
    params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale: localeParam } = await params;
    const locale = normalizeLocale(localeParam);
    const t = getTranslations(locale);

    return {
        title: t.account.metadata.title,
        description: t.account.metadata.description,
        alternates: getHreflang('/account'),
    };
}

export default async function AccountPage({ params }: Props) {
    const customer = await getCurrentCustomerFromCookies();

    const orders = customer ? await getCustomerOrders(10) : [];

    return (
        <AccountClient
            initialEmail={customer?.email}
            initialFirstName={customer?.firstName}
            initialLastName={customer?.lastName}
            initialVatNumber={customer?.vatNumber}
            orders={orders}
        />
    );
}
