'use server';

import { cookies } from 'next/headers';
import { createCustomerAccessToken, createCustomerAccount } from '@/lib/shopify';
import { setCustomerVatMetafield, deleteCustomer } from '@/lib/shopifyAdmin';

type LoginStatus = 'idle' | 'success' | 'error';

export type LoginState = {
    status: LoginStatus;
    message?: string;
};

const COOKIE_NAME = 'shopify_customer_token';

export async function handleLogin(_: LoginState, formData: FormData): Promise<LoginState> {
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    if (!email || !password) {
        return { status: 'error', message: 'Please enter both email and password.' };
    }

    // Basic validation
    if (email.length > 254) {
        return { status: 'error', message: 'Invalid email address.' };
    }

    if (password.length > 128) {
        return { status: 'error', message: 'Invalid password.' };
    }

    try {
        const token = await createCustomerAccessToken(email, password);

        const expiresDate = new Date(token.expiresAt);

        // Validate token expiry is in the future
        if (expiresDate.getTime() <= Date.now()) {
            console.error('[login] Token already expired');
            return { status: 'error', message: 'Authentication failed. Please try again.' };
        }

        const cookieStore = await cookies();
        cookieStore.set(COOKIE_NAME, token.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresDate,
            path: '/',
        });

        return { status: 'success', message: 'Logged in successfully.' };
    } catch (error) {
        let message = 'Login failed. Please check your credentials and try again.';

        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('unidentified') || errorMsg.includes('not found') || errorMsg.includes('invalid')) {
                message = 'Invalid email or password.';
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
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';
    const firstName = formData.get('firstName')?.toString().trim() || undefined;
    const lastName = formData.get('lastName')?.toString().trim() || undefined;
    const companyRegistrationRaw = formData.get('companyRegistrationNumber')?.toString() ?? '';
    const companyRegistrationNumber = companyRegistrationRaw.replace(/\s+/g, '').toUpperCase();
    const EU_COMPANY_REGEX = /^[A-Z]{2}[A-Z0-9]{2,12}$/;
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const fields: RegisterFields = { email, firstName, lastName, companyRegistrationNumber };

    // Validation: required fields
    if (!email || !password || !companyRegistrationNumber) {
        return {
            status: 'error',
            message: 'Please enter email, password, and company registration number.',
            fields,
        };
    }

    // Validation: email format
    if (!EMAIL_REGEX.test(email)) {
        return {
            status: 'error',
            message: 'Please enter a valid email address.',
            fields,
        };
    }

    // Validation: email length (max 254 chars per RFC 5321)
    if (email.length > 254) {
        return {
            status: 'error',
            message: 'Email address is too long.',
            fields,
        };
    }

    // Validation: password strength
    if (password.length < 8) {
        return {
            status: 'error',
            message: 'Password must be at least 8 characters long.',
            fields,
        };
    }

    if (password.length > 128) {
        return {
            status: 'error',
            message: 'Password is too long (max 128 characters).',
            fields,
        };
    }

    // Validation: name lengths and characters
    if (firstName && (firstName.length > 100 || firstName.length < 1)) {
        return {
            status: 'error',
            message: 'First name must be between 1 and 100 characters.',
            fields,
        };
    }

    if (lastName && (lastName.length > 100 || lastName.length < 1)) {
        return {
            status: 'error',
            message: 'Last name must be between 1 and 100 characters.',
            fields,
        };
    }

    // Validation: company registration number format
    if (!EU_COMPANY_REGEX.test(companyRegistrationNumber)) {
        return {
            status: 'error',
            message: 'Enter a valid registration number starting with the country code (e.g., SE123456789).',
            fields,
        };
    }

    try {
        const customerId = await createCustomerAccount({ email, password, firstName, lastName });

        try {
            await setCustomerVatMetafield(customerId, companyRegistrationNumber);
        } catch (vatError) {
            console.error('[register] VAT metafield update failed, rolling back customer', vatError);
            try {
                await deleteCustomer(customerId);
            } catch (cleanupError) {
                console.error('[register] Failed to delete customer after VAT error', cleanupError);
            }

            return {
                status: 'error',
                message: 'We could not complete your registration right now. Please try again.',
                fields,
            };
        }

        let token: { accessToken: string; expiresAt: string } | null = null;
        try {
            token = await createCustomerAccessToken(email, password);
        } catch (tokenError) {
            console.error('[register] customerAccessTokenCreate failed', tokenError);
            // Non-fatal: account was created successfully, user can log in manually
        }

        if (token) {
            try {
                const expiresDate = new Date(token.expiresAt);

                // Validate token expiry is in the future
                if (expiresDate.getTime() <= Date.now()) {
                    console.error('[register] Token already expired');
                    return { status: 'success', message: 'Account created. Please log in to continue.' };
                }

                const cookieStore = await cookies();
                cookieStore.set(COOKIE_NAME, token.accessToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    expires: expiresDate,
                    path: '/',
                });

                return { status: 'success', message: 'Account created and you are now signed in.' };
            } catch (cookieError) {
                console.error('[register] Failed to set authentication cookie', cookieError);
                // Non-fatal: account exists, they can log in manually
                return { status: 'success', message: 'Account created. Please log in to continue.' };
            }
        }

        return { status: 'success', message: 'Account created. Please log in to continue.' };
    } catch (error) {
        let message = 'Account creation failed. Please try again.';

        // Provide user-friendly messages for common errors
        if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase();
            if (errorMsg.includes('taken') || errorMsg.includes('already exists')) {
                message = 'An account with this email already exists. Please log in instead.';
            } else if (errorMsg.includes('invalid') && errorMsg.includes('email')) {
                message = 'Please enter a valid email address.';
            } else if (errorMsg.includes('password')) {
                message = 'Password does not meet requirements. Please try a different password.';
            }
            // Log original error but show user-friendly message
            console.error('[register] customerCreate failed:', error.message);
        }

        return { status: 'error', message, fields };
    }
}
