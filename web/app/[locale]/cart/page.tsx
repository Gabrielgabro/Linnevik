import { Metadata } from 'next';
import { getTranslations, normalizeLocale } from '@/lib/i18n';
import { getHreflang, noIndexMetadata } from '@/lib/metadata';
import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import {
    isValidCompanyRegistrationNumber,
    normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';
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
    // Samma spärrar som fakturarutten sätter, och av samma skäl: ett vilande
    // konto eller ett konto utan giltigt organisationsnummer fick tidigare
    // fylla i hela formuläret och först därefter ett nej. Företagsnamn och
    // adress prövas inte här — dem får kunden skriva i formuläret.
    const invoiceEligible =
        customer?.status === 'active' &&
        Boolean(customer.email) &&
        isValidCompanyRegistrationNumber(normalizeCompanyRegistrationNumber(customer.vatNumber));
    return (
        <CartClient
            invoiceEligible={invoiceEligible}
            invoicePrefill={{
                companyName: customer?.company ?? '',
                // "Er referens" förifylls med personen på kontot. Det är hen som
                // beställer, och fakturan behöver en människa att sorteras på.
                reference: [customer?.firstName, customer?.lastName].filter(Boolean).join(' '),
                line1: address?.line1 ?? '',
                line2: address?.line2 ?? '',
                city: address?.city ?? '',
                postalCode: address?.postal_code ?? '',
            }}
        />
    );
}
