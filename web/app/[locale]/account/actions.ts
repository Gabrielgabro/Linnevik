'use server';

import { getCurrentCustomerFromCookies } from '@/lib/customerAccount';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';
import { getDb } from '@/lib/db';
import { customers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

async function getOwnedCustomerVat(customerId: number): Promise<{ vatNumber?: string; vatProvided: boolean } | null> {
    const db = getDb();
    const [row] = await db.select({ taxId: customers.taxId }).from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!row) return null;
    return { vatNumber: row.taxId || undefined, vatProvided: Boolean(row.taxId) };
}

async function setOwnedCustomerVat(customerId: number, vatNumber: string | null): Promise<void> {
    const db = getDb();
    await db.update(customers).set({ taxId: vatNumber, updatedAt: new Date() }).where(eq(customers.id, customerId));
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
        await setOwnedCustomerVat(Number(customer.id), hasVat ? normalizedVat : null);

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

export async function loadVatStatus(previousState: VatState): Promise<VatState> {
    void previousState;
    const t = await getActionTranslations();
    const customer = await getSessionCustomer();

    if (!customer) {
        return {
            status: 'error',
            message: t.vatStatus.notLoggedIn,
        };
    }

    try {
        const vatInfo = await getOwnedCustomerVat(Number(customer.id));

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
