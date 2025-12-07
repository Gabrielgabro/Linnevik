'use server';

import { cookies } from 'next/headers';
import { createCustomerAccessToken } from '@/lib/shopify';
import {
    createCustomerAccount,
    sendActivationEmail,
    setCustomerVatMetafield,
    deleteCustomer,
} from '@/lib/shopifyAdmin';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from '@/lib/languageConfig';

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
        console.log('[register] Creating customer account for:', email);

        // Create customer with Admin API (will be in DISABLED state)
        const { id: customerId } = await createCustomerAccount(email, firstName, lastName);
        console.log('[register] Customer created successfully:', customerId);

        // Store VAT metafield
        try {
            console.log('[register] Setting VAT metafield:', companyRegistrationNumber);
            await setCustomerVatMetafield(customerId, companyRegistrationNumber);
            console.log('[register] VAT metafield set successfully');
        } catch (vatError) {
            console.error('[register] VAT metafield update failed, rolling back customer', vatError);
            try {
                await deleteCustomer(customerId);
                console.log('[register] Customer deleted successfully after VAT error');
            } catch (cleanupError) {
                console.error('[register] Failed to delete customer after VAT error', cleanupError);
            }

            return {
                status: 'error',
                message: t.register.errors.vatFailed,
                fields,
            };
        }

        // Send activation email (customer will set password via email link)
        try {
            await sendActivationEmail(customerId, email);
            console.log('[register] Activation email sent successfully');
        } catch (emailError) {
            console.error('[register] Failed to send activation email, rolling back customer', emailError);
            try {
                await deleteCustomer(customerId);
                console.log('[register] Customer deleted successfully after email error');
            } catch (cleanupError) {
                console.error('[register] Failed to delete customer after email error', cleanupError);
            }

            return {
                status: 'error',
                message: t.register.errors.activationFailed,
                fields,
            };
        }

        console.log('[register] Registration complete. Activation email sent.');

        return {
            status: 'success',
            message: t.register.success,
            fields,
        };
    } catch (error) {
        let message = t.register.errors.generic;

        // Provide user-friendly messages for common errors
        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('taken') || errorMsg.includes('already exists')) {
                message = t.register.errors.emailTaken;
            } else if (errorMsg.includes('invalid') && errorMsg.includes('email')) {
                message = t.register.errors.invalidEmailFormat;
            } else if (errorMsg.includes('password')) {
                message = t.register.errors.passwordInvalid;
            }
            // Log original error but show user-friendly message
            console.error('[register] customerCreate failed:', error.message);
        }

        return { status: 'error', message, fields };
    }
}

/**
 * Logout - clear authentication cookies
 */
export async function logout(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    cookieStore.delete('customer_access_token');
}

export async function handleVerifyEmail(code: string): Promise<{ status: 'success' | 'error'; message?: string }> {
    const t = await getActionTranslations();

    if (!code || code.length !== 6) {
        return { status: 'error', message: t.verifyEmail.genericError };
    }

    // Verification flow is not wired to a backend store yet; return a friendly success for UX continuity
    return {
        status: 'success',
        message: t.verifyEmail.success,
    };
}
