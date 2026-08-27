'use server';

import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';
import { loadCompanyProfile, saveCompanyProfile } from '@/lib/commerceOperations';
import { resolveCompanyProfile, type CompanyProfileGap } from '@/lib/companyProfile';

export type CompanyFields = {
    companyName: string;
    organizationNumber: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
};

export type CompanyProfileState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
    fields?: CompanyFields;
    /** Sant när uppgifterna räcker för att skapa en faktura i kassan. */
    invoiceReady?: boolean;
};

async function getActionTranslations(): Promise<Translations> {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value;
    const lang: Language = locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE;
    return getTranslations(lang);
}

function readFields(formData: FormData): CompanyFields {
    const value = (key: string) => formData.get(key)?.toString() ?? '';
    return {
        companyName: value('companyName'),
        organizationNumber: value('organizationNumber'),
        addressLine1: value('addressLine1'),
        addressLine2: value('addressLine2'),
        postalCode: value('postalCode'),
        city: value('city'),
    };
}

/** Ett meddelande per sak som fattas, så att kunden vet vilket fält som är fel. */
function gapMessage(t: Translations, gap: CompanyProfileGap): string {
    const messages = t.account.company.errors;
    switch (gap) {
        case 'companyName':
            return messages.companyName;
        case 'organizationNumber':
            return messages.organizationNumber;
        case 'address':
            return messages.address;
        case 'country':
            return messages.country;
        case 'email':
            return messages.notLoggedIn;
    }
}

/**
 * Sparar företagsuppgifterna från kontosidan.
 *
 * Kontrollen är exakt densamma som fakturarutten gör — `resolveCompanyProfile`
 * anropas av båda. Så länge den här sidan hade egna, lösare regler kunde den
 * spara uppgifter som kassan sedan avvisade med "komplettera ditt konto", och
 * det här är den enda sidan som kan komplettera det.
 */
export async function saveCompanyDetails(
    _: CompanyProfileState,
    formData: FormData
): Promise<CompanyProfileState> {
    const t = await getActionTranslations();
    const customer = await getCurrentCustomerFromCookies();
    const fields = readFields(formData);

    if (!customer) {
        return { status: 'error', message: t.account.company.errors.notLoggedIn, fields };
    }

    const resolved = resolveCompanyProfile({
        email: customer.email,
        companyName: fields.companyName,
        organizationNumber: fields.organizationNumber,
        address: {
            line1: fields.addressLine1,
            line2: fields.addressLine2,
            postalCode: fields.postalCode,
            city: fields.city,
        },
    });

    if (!resolved.ok) {
        return { status: 'error', message: gapMessage(t, resolved.missing), fields };
    }

    try {
        await saveCompanyProfile(Number(customer.id), {
            companyName: resolved.profile.companyName,
            organizationNumber: resolved.profile.organizationNumber,
            address: resolved.profile.address,
        });
    } catch (error) {
        console.error('[account] Failed to save company profile', error);
        return { status: 'error', message: t.account.company.errors.saveFailed, fields };
    }

    return {
        status: 'success',
        message: t.account.company.saved,
        invoiceReady: true,
        // Det sparade, normaliserade värdet ekas tillbaka så att formuläret
        // visar postnumret i samma form som fakturan kommer att göra.
        fields: {
            companyName: resolved.profile.companyName,
            organizationNumber: resolved.profile.organizationNumber,
            addressLine1: resolved.profile.address.line1,
            addressLine2: resolved.profile.address.line2 ?? '',
            postalCode: resolved.profile.address.postal_code,
            city: resolved.profile.address.city,
        },
    };
}

/** Uppgifterna som de ligger sparade, för att förifylla formuläret. */
export async function loadCompanyDetails(): Promise<CompanyProfileState> {
    const t = await getActionTranslations();
    const customer = await getCurrentCustomerFromCookies();
    if (!customer) {
        return { status: 'error', message: t.account.company.errors.notLoggedIn };
    }

    try {
        const profile = await loadCompanyProfile(Number(customer.id));
        if (!profile) {
            return { status: 'error', message: t.account.company.errors.notLoggedIn };
        }
        return {
            status: 'idle',
            invoiceReady: profile.invoiceReady,
            fields: {
                companyName: profile.companyName,
                organizationNumber: profile.organizationNumber,
                addressLine1: profile.address?.line1 ?? '',
                addressLine2: profile.address?.line2 ?? '',
                postalCode: profile.address?.postal_code ?? '',
                city: profile.address?.city ?? '',
            },
        };
    } catch (error) {
        console.error('[account] Failed to load company profile', error);
        return { status: 'error', message: t.account.company.errors.loadFailed };
    }
}
