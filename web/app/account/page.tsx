import type { Metadata } from 'next';
import AccountClient from './AccountClient';
import { getCurrentCustomerFromCookies, getCustomerOrders } from '@/lib/customerAccount';
import { getTranslations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE } from '@/lib/languageConfig';

const t = getTranslations(DEFAULT_LANGUAGE);

export const metadata: Metadata = {
    title: t.account.metadata.title,
    description: t.account.metadata.description,
};

export default async function AccountPage() {
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
