/**
 * Email Verification System
 * Generates and manages verification codes for new customer accounts
 */

import { cookies } from 'next/headers';
import { setCustomerMetafield } from './shopifyAdmin';

const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_EXPIRY_MINUTES = 15;

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store verification code in cookie (temporary storage)
 * In production, you might want to use a database or Redis
 */
export async function storeVerificationCode(email: string, code: string): Promise<void> {
    const cookieStore = await cookies();
    const data = JSON.stringify({
        email,
        code,
        expiresAt: Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000,
    });

    cookieStore.set('email_verification_pending', data, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: VERIFICATION_EXPIRY_MINUTES * 60,
        path: '/',
    });
}

/**
 * Get stored verification data
 */
export async function getVerificationData(): Promise<{
    email: string;
    code: string;
    expiresAt: number;
} | null> {
    const cookieStore = await cookies();
    const data = cookieStore.get('email_verification_pending')?.value;

    if (!data) {
        return null;
    }

    try {
        const parsed = JSON.parse(data);

        // Check if expired
        if (parsed.expiresAt < Date.now()) {
            cookieStore.delete('email_verification_pending');
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

/**
 * Verify the code matches what was sent
 */
export async function verifyCode(inputCode: string): Promise<{
    success: boolean;
    email?: string;
    error?: string;
}> {
    const data = await getVerificationData();

    if (!data) {
        return {
            success: false,
            error: 'Verification session expired. Please register again.',
        };
    }

    if (data.code !== inputCode) {
        return {
            success: false,
            error: 'Invalid verification code. Please try again.',
        };
    }

    // Clear verification cookie
    const cookieStore = await cookies();
    cookieStore.delete('email_verification_pending');

    return {
        success: true,
        email: data.email,
    };
}

/**
 * Mark customer as email verified in Shopify metafield
 */
export async function markCustomerAsVerified(customerId: string): Promise<void> {
    await setCustomerMetafield(customerId, 'email_verified', 'true', 'custom');
}

/**
 * Send verification email (placeholder - you'll implement with your email service)
 * @param email Customer email
 * @param code Verification code
 * @param name Customer name
 */
export async function sendVerificationEmail(
    email: string,
    code: string,
    name?: string
): Promise<void> {
    // TODO: Implement with your email service (SendGrid, Resend, AWS SES, etc.)
    console.log('[email-verification] Sending verification code to:', email);
    console.log('[email-verification] Code:', code);
    console.log('[email-verification] Name:', name);

    // Example implementation with SendGrid:
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
        to: email,
        from: 'noreply@linnevik.com',
        subject: 'Verify your Linnevik account',
        text: `Your verification code is: ${code}`,
        html: `
            <h1>Welcome to Linnevik!</h1>
            <p>Your verification code is:</p>
            <h2 style="font-size: 32px; letter-spacing: 5px;">${code}</h2>
            <p>This code will expire in 15 minutes.</p>
        `,
    };

    await sgMail.send(msg);
    */

    // For now, just log (you'll implement email sending)
    console.log(`
========================================
Email Verification Code
========================================
To: ${email}
Name: ${name || 'Customer'}
Code: ${code}
Expires: ${VERIFICATION_EXPIRY_MINUTES} minutes
========================================
    `);
}
