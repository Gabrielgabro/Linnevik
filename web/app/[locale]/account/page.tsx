import type { Metadata } from 'next';
import AccountClient from './AccountClient';
import { getCurrentCustomerFromCookies, getCustomerOrders } from '@/lib/customerAccount';
import { getSampleRequestsForCustomer } from '@/lib/sampleRequestsDb';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, noIndexMetadata } from '@/lib/metadata';


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
        alternates: getHreflang('/account', locale),
        ...noIndexMetadata,
    };
}

export default async function AccountPage({ params }: Props) {
    const customer = await getCurrentCustomerFromCookies();

    const orders = customer ? await getCustomerOrders(10) : [];
    // Provförfrågningar matchas på adressen också, inte bara på kundkopplingen:
    // de flesta ber om prover innan de skaffar konto (se sampleRequestsDb).
    const sampleRequests = customer
        ? await getSampleRequestsForCustomer(
            {
                customerId: customer.source === 'owned' ? Number(customer.id) : null,
                email: customer.email,
            },
            10
        )
        : [];

    return (
        <AccountClient
            initialEmail={customer?.email}
            initialFirstName={customer?.firstName}
            initialLastName={customer?.lastName}
            initialVatNumber={customer?.vatNumber}
            orders={orders}
            sampleRequests={sampleRequests.map(request => ({
                id: request.id,
                status: request.status,
                createdAt: request.createdAt.toISOString(),
                items: request.items.map(item => ({
                    title: item.title,
                    variantLabel: item.variantLabel,
                })),
            }))}
        />
    );
}
