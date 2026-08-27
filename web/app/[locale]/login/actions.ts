'use server';

import { cookies, headers } from 'next/headers';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/customerSession';
import { registerCustomer } from '@/lib/commerceOperations';
import { requestMagicLink } from '@/lib/magicLink';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
    isValidCompanyRegistrationNumber,
    normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';

const COOKIE_NAME = 'shopify_customer_token';
const REGISTER_RATE_PER_IP = 10;
const REGISTER_RATE_PER_EMAIL = 5;
const REGISTER_RATE_WINDOW_SECONDS = 60 * 60;

async function getActionTranslations(): Promise<Translations> {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value;
    const lang: Language = locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE;
    return getTranslations(lang);
}

type RegisterFields = {
    email?: string;
    firstName?: string;
    lastName?: string;
    companyRegistrationNumber?: string;
};

export type RegisterState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
    fields?: RegisterFields;
};

export async function handleRegister(_: RegisterState, formData: FormData): Promise<RegisterState> {
    const t = await getActionTranslations();

    // Get current locale from cookie
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value;

    const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
    const firstName = formData.get('firstName')?.toString().trim() || undefined;
    const lastName = formData.get('lastName')?.toString().trim() || undefined;
    const companyRegistrationNumber = normalizeCompanyRegistrationNumber(
        formData.get('companyRegistrationNumber')
    );
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const fields: RegisterFields = { email, firstName, lastName, companyRegistrationNumber };

    // Validation: required fields
    if (!email || !companyRegistrationNumber) {
        return {
            status: 'error',
            message: t.register.errors.missingFields,
            fields,
        };
    }

    // Validation: email format
    if (!EMAIL_REGEX.test(email)) {
        return {
            status: 'error',
            message: t.register.errors.invalidEmailFormat,
            fields,
        };
    }

    // Validation: email length (max 254 chars per RFC 5321)
    if (email.length > 254) {
        return {
            status: 'error',
            message: t.register.errors.emailTooLong,
            fields,
        };
    }

    // Validation: name lengths and characters
    if (firstName && (firstName.length > 100 || firstName.length < 1)) {
        return {
            status: 'error',
            message: t.register.errors.firstNameInvalid,
            fields,
        };
    }

    if (lastName && (lastName.length > 100 || lastName.length < 1)) {
        return {
            status: 'error',
            message: t.register.errors.lastNameInvalid,
            fields,
        };
    }

    // Validation: company registration number format
    if (!isValidCompanyRegistrationNumber(companyRegistrationNumber)) {
        return {
            status: 'error',
            message: t.register.errors.invalidCompanyNumber,
            fields,
        };
    }

    const headerList = await headers();
    const [ipLimit, emailLimit] = await Promise.all([
        checkRateLimit({
            scope: 'register',
            identity: clientIp(headerList),
            limit: REGISTER_RATE_PER_IP,
            windowSeconds: REGISTER_RATE_WINDOW_SECONDS,
        }),
        checkRateLimit({
            scope: 'register_email',
            identity: email,
            limit: REGISTER_RATE_PER_EMAIL,
            windowSeconds: REGISTER_RATE_WINDOW_SECONDS,
        }),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
        return { status: 'error', message: t.register.errors.rateLimited, fields };
    }

    try {
        // Kunden skapas direkt i Postgres — det finns inget Shopify-konto att
        // skapa längre. Org-numret sparas i tax_id i stället för en Shopify-
        // metafield, så att kunddata äger ett enda system.
        const result = await registerCustomer({
            email,
            firstName,
            lastName,
            taxId: companyRegistrationNumber,
        });

        if (result.status === 'created') {
            console.log('[register] Customer created successfully:', result.id);
        }

        // Skicka en inloggningslänk i stället för Shopifys lösenords-
        // aktiveringsmejl — det är den ersättande mekanismen enligt planen.
        // Får aldrig fälla registreringen: kontot finns redan, och kunden kan
        // alltid begära en ny länk från /login om mejlet uteblir.
        let linkSent = false;
        try {
            linkSent = await requestMagicLink({
                email,
                locale: locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE,
                ip: clientIp(headerList),
                userAgent: headerList.get('user-agent'),
            });
        } catch (emailError) {
            console.error('[register] Failed to send login link', emailError);
        }

        // Existing and newly created addresses get the same response. Besides
        // avoiding account enumeration, this gives an existing buyer a fresh
        // login link instead of making registration a dead end.
        console.log('[register] Registration complete.');

        return {
            status: 'success',
            message: linkSent ? t.register.success : t.register.emailDeliveryFailed,
            fields,
        };
    } catch (error) {
        console.error('[register] Registration failed:', error);
        return { status: 'error', message: t.register.errors.generic, fields };
    }
}

export type RecoverState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
};

export async function handleRecover(_: RecoverState, formData: FormData): Promise<RecoverState> {
    const t = await getActionTranslations();
    const email = formData.get('email')?.toString().trim() ?? '';
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
        return { status: 'error', message: t.forgot.errors.invalidEmail };
    }

    try {
        const cookieStore = await cookies();
        const locale = cookieStore.get('NEXT_LOCALE')?.value;
        const headerList = await headers();
        await requestMagicLink({
            email,
            locale: locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE,
            ip: clientIp(headerList),
            userAgent: headerList.get('user-agent'),
        });
    } catch (error) {
        // Neutral response prevents account enumeration and the user can retry.
        console.error('[recover] Magic-link request failed:', error);
    }

    return { status: 'success', message: t.forgot.confirmation };
}

/**
 * Logout - clear authentication cookies
 */
export async function logout(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    cookieStore.delete('customer_access_token');
    // Rensar även e-postlänkssessionen (lib/customerSession.ts). Ofarligt att
    // göra villkorslöst — kakan finns bara om kunden loggat in via länken.
    cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}
