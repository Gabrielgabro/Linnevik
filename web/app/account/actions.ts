'use server';

import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { getCustomerVatById, setCustomerVatStatus } from '@/lib/shopifyAdmin';

export type VatState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
    email?: string;
    vatNumber?: string;
    vatProvided?: boolean;
};

const EU_COMPANY_REGEX = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

async function getSessionCustomer() {
    const customer = await getCurrentCustomerFromCookies();
    if (!customer) {
        return null;
    }
    return customer;
}

export async function saveVatStatus(_: VatState, formData: FormData): Promise<VatState> {
    const customer = await getSessionCustomer();

    if (!customer) {
        return {
            status: 'error',
            message: 'Du är inte inloggad. Logga in via kontosidan först.',
        };
    }

    const rawVat = formData.get('vatNumber')?.toString() ?? '';
    const normalizedVat = rawVat.replace(/\s+/g, '').toUpperCase();
    const hasVat = normalizedVat.length > 0;

    if (hasVat && !EU_COMPANY_REGEX.test(normalizedVat)) {
        return {
            status: 'error',
            message: 'Ange ett giltigt VAT-nummer (t.ex. SE123456789).',
            email: customer.email,
            vatNumber: normalizedVat,
        };
    }

    try {
        await setCustomerVatStatus(customer.id, hasVat ? normalizedVat : null, hasVat);

        return {
            status: 'success',
            message: hasVat ? 'VAT-nummer sparat.' : 'VAT är markerat som ej angivet.',
            email: customer.email,
            vatNumber: hasVat ? normalizedVat : undefined,
            vatProvided: hasVat,
        };
    } catch (error) {
        console.error('[account] Failed to save VAT status', error);
        return {
            status: 'error',
            message: 'Kunde inte uppdatera VAT just nu. Försök igen.',
            email: customer.email,
            vatNumber: hasVat ? normalizedVat : undefined,
        };
    }
}

export async function loadVatStatus(_: VatState): Promise<VatState> {
    const customer = await getSessionCustomer();

    if (!customer) {
        return {
            status: 'error',
            message: 'Du är inte inloggad. Logga in via kontosidan först.',
        };
    }

    try {
        const vatInfo = await getCustomerVatById(customer.id);

        return {
            status: 'success',
            message: vatInfo?.vatProvided ? 'VAT är sparat.' : 'Inget VAT-nummer sparat ännu.',
            email: customer.email,
            vatNumber: vatInfo?.vatNumber,
            vatProvided: vatInfo?.vatProvided,
        };
    } catch (error) {
        console.error('[account] Failed to load VAT status', error);
        return {
            status: 'error',
            message: 'Kunde inte hämta VAT-status just nu. Försök igen.',
            email: customer.email,
        };
    }
}
