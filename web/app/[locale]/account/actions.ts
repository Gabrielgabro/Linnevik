'use server';

import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { getCustomerVatById, setCustomerVatStatus } from '@/lib/shopifyAdmin';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';

export type VatState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
    email?: string;
    vatNumber?: string;
    vatProvided?: boolean;
};

const EU_COMPANY_REGEX = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

async function getActionTranslations(): Promise<Translations> {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value;
    const lang: Language = locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE;
    return getTranslations(lang);
}

async function getSessionCustomer() {
    const customer = await getCurrentCustomerFromCookies();
    if (!customer) {
        return null;
    }
    return customer;
}

export async function saveVatStatus(_: VatState, formData: FormData): Promise<VatState> {
    const t = await getActionTranslations();
    const customer = await getSessionCustomer();

    if (!customer) {
        return {
            status: 'error',
            message: t.vatStatus.notLoggedIn,
        };
    }

    const rawVat = formData.get('vatNumber')?.toString() ?? '';
    const normalizedVat = rawVat.replace(/\s+/g, '').toUpperCase();
    const hasVat = normalizedVat.length > 0;

    if (hasVat && !EU_COMPANY_REGEX.test(normalizedVat)) {
        return {
            status: 'error',
            message: t.vatStatus.invalidFormat,
            email: customer.email,
            vatNumber: normalizedVat,
        };
    }

    try {
        await setCustomerVatStatus(customer.id, hasVat ? normalizedVat : null, hasVat);

        return {
            status: 'success',
            message: hasVat ? t.vatStatus.saved : t.vatStatus.notProvided,
            email: customer.email,
            vatNumber: hasVat ? normalizedVat : undefined,
            vatProvided: hasVat,
        };
    } catch (error) {
        console.error('[account] Failed to save VAT status', error);
        return {
            status: 'error',
            message: t.vatStatus.updateFailed,
            email: customer.email,
            vatNumber: hasVat ? normalizedVat : undefined,
        };
    }
}

export async function loadVatStatus(_: VatState): Promise<VatState> {
    const t = await getActionTranslations();
    const customer = await getSessionCustomer();

    if (!customer) {
        return {
            status: 'error',
            message: t.vatStatus.notLoggedIn,
        };
    }

    try {
        const vatInfo = await getCustomerVatById(customer.id);

        return {
            status: 'success',
            message: vatInfo?.vatProvided ? t.vatStatus.isSaved : t.vatStatus.noVatYet,
            email: customer.email,
            vatNumber: vatInfo?.vatNumber,
            vatProvided: vatInfo?.vatProvided,
        };
    } catch (error) {
        console.error('[account] Failed to load VAT status', error);
        return {
            status: 'error',
            message: t.vatStatus.loadFailed,
            email: customer.email,
        };
    }
}

import { customerActivate } from '@/lib/shopify';
import { createSession } from '@/lib/customerAccountAuth';

export async function activateCustomer(id: string, activationToken: string, password: string) {
    const t = await getActionTranslations();
    try {
        // Convert numeric ID to GID format if needed
        // Shopify activation URLs use numeric IDs (e.g., "24337163977030")
        // but the Storefront API customerActivate mutation requires GID format
        const customerId = id.startsWith('gid://')
            ? id
            : `gid://shopify/Customer/${id}`;

        console.log('[activateCustomer] Activating with ID:', customerId);

        const { customerAccessToken, userErrors } = await customerActivate(customerId, activationToken, password);

        if (userErrors.length > 0) {
            console.error('[activateCustomer] User errors:', userErrors);
            return { error: userErrors[0].message };
        }

        // Create session
        await createSession(customerAccessToken.accessToken, customerAccessToken.expiresAt);

        return { success: true };
    } catch (error) {
        console.error('Activation failed:', error);
        return { error: t.activation.errors.activationFailed };
    }
}

