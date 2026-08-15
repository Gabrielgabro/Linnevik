'use server';

import { cookies, headers } from 'next/headers';
import { createCustomerAccessToken, customerRecover } from '@/lib/shopify';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/customerSession';
import { registerCustomer } from '@/lib/commerceOperations';
import { requestMagicLink } from '@/lib/magicLink';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';

function clientIp(headerList: Awaited<ReturnType<typeof headers>>): string | null {
    const forwarded = headerList.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || null;
}

type LoginStatus = 'idle' | 'success' | 'error';

export type LoginState = {
    status: LoginStatus;
    message?: string;
};

const COOKIE_NAME = 'shopify_customer_token';

async function getActionTranslations(): Promise<Translations> {
    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value;
    const lang: Language = locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE;
    return getTranslations(lang);
}

export async function handleLogin(_: LoginState, formData: FormData): Promise<LoginState> {
    const t = await getActionTranslations();
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    if (!email || !password) {
        return { status: 'error', message: t.login.messages.missingFields };
    }

    // Basic validation
    if (email.length > 254) {
        return { status: 'error', message: t.login.messages.invalidEmail };
    }

    if (password.length > 128) {
        return { status: 'error', message: t.login.messages.invalidPassword };
    }

    try {
        const token = await createCustomerAccessToken(email, password);

        const expiresDate = new Date(token.expiresAt);

        // Validate token expiry is in the future
        if (expiresDate.getTime() <= Date.now()) {
            console.error('[login] Token already expired');
            return { status: 'error', message: t.login.messages.authFailed };
        }

        const cookieStore = await cookies();
        cookieStore.set(COOKIE_NAME, token.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresDate,
            path: '/',
        });

        return { status: 'success', message: t.login.messages.success };
    } catch (error) {
        let message = t.login.messages.genericError;

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('unidentified') || errorMsg.includes('not found') || errorMsg.includes('invalid')) {
                message = t.login.messages.invalidCredentials;
            }
            console.error('[login] customerAccessTokenCreate failed:', error.message);
        }

        return { status: 'error', message };
    }
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

    const email = formData.get('email')?.toString().trim() ?? '';
    const firstName = formData.get('firstName')?.toString().trim() || undefined;
    const lastName = formData.get('lastName')?.toString().trim() || undefined;
    const companyRegistrationRaw = formData.get('companyRegistrationNumber')?.toString() ?? '';
    const companyRegistrationNumber = companyRegistrationRaw.replace(/\s+/g, '').toUpperCase();
    const EU_COMPANY_REGEX = /^[A-Z]{2}[A-Z0-9]{2,12}$/;
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
    if (!EU_COMPANY_REGEX.test(companyRegistrationNumber)) {
        return {
            status: 'error',
            message: t.register.errors.invalidCompanyNumber,
            fields,
        };
    }

    try {
        console.log('[register] Creating customer for:', email);

        // Kunden skapas direkt i Postgres — det finns inget Shopify-konto att
        // skapa längre. Org-numret sparas i tax_id i stället för en Shopify-
        // metafield, så att kunddata äger ett enda system.
        const result = await registerCustomer({
            email,
            firstName,
            lastName,
            taxId: companyRegistrationNumber,
        });

        if (result.status === 'exists') {
            return {
                status: 'error',
                message: t.register.errors.emailTaken,
                fields,
            };
        }

        console.log('[register] Customer created successfully:', result.id);

        // Skicka en inloggningslänk i stället för Shopifys lösenords-
        // aktiveringsmejl — det är den ersättande mekanismen enligt planen.
        // Får aldrig fälla registreringen: kontot finns redan, och kunden kan
        // alltid begära en ny länk från /login om mejlet uteblir.
        try {
            const headerList = await headers();
            await requestMagicLink({
                email,
                locale: locale && isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE,
                ip: clientIp(headerList),
                userAgent: headerList.get('user-agent'),
            });
            console.log('[register] Login link sent successfully');
        } catch (emailError) {
            console.error('[register] Failed to send login link', emailError);
        }

        console.log('[register] Registration complete.');

        return {
            status: 'success',
            message: t.register.success,
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
        const { userErrors } = await customerRecover(email);
        // Log for ourselves, but never surface whether the email has an
        // account - always answer with the same neutral confirmation.
        if (userErrors.length > 0) {
            console.error('[recover] customerRecover user errors:', userErrors);
        }
    } catch (error) {
        console.error('[recover] customerRecover failed:', error);
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
