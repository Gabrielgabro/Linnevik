/**
 * Email Verification System
 * Generates and manages verification codes for new customer accounts
 *
 * ---------------------------------------------------------------------------
 * STATUS: modulen är inte i drift, och ska inte tas i drift som den ser ut.
 *
 * Ingenting utfärdar koder. Registreringen (login/actions.ts handleRegister)
 * går via Shopifys aktiveringsmejl, och sidan /login/verify-email har ingen
 * inlänk. sendVerificationEmail nedan skickar riktig post, men det finns inget
 * flöde som anropar den.
 *
 * Två saker måste lösas innan den kan användas:
 *
 * 1. Kodlagringen håller inte. storeVerificationCode lägger koden i klartext i
 *    en cookie hos samma användare som ska bevisa att hen äger inkorgen.
 *    httpOnly hindrar JavaScript, men inte användaren: koden går att läsa i
 *    webbläsarens utvecklarverktyg utan att mejlet någonsin öppnas. Det gör
 *    verifieringen meningslös. Koden hör hemma i databasen, hashad, knuten till
 *    e-postadressen och med ett försöksräknare-tak.
 *
 * 2. Sexsiffriga koder är inte den planerade lösningen. Enligt migrationsplanen
 *    ska Shopify-inloggningen ersättas med signerade, engångs-, utgående
 *    magiclinks. Den här modulen är ett spår från ett annat upplägg och bör
 *    antagligen skrotas snarare än kopplas in.
 * ---------------------------------------------------------------------------
 */

import { cookies } from 'next/headers';
import { setCustomerMetafield } from './shopifyAdmin';
import { mailConfigured, sendEmail } from './mailer';
import { verificationEmail } from './emailTemplates';

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
 * Skickar verifieringskoden. Går via den egna SMTP-leverantören som allt annat
 * utgående — se lib/mailer.ts för varför avsändaren måste ligga på linnevik.se.
 *
 * @param email Customer email
 * @param code Verification code
 * @param name Customer name
 */
export async function sendVerificationEmail(
    email: string,
    code: string,
    name?: string
): Promise<{ success: boolean; error?: string }> {
    if (!mailConfigured()) {
        // Utan SMTP i miljön skrivs koden i loggen i stället, så att lokal
        // registrering går att testa. Aldrig i produktion: en kod i en logg är
        // en kod någon annan kan läsa.
        if (process.env.NODE_ENV === 'production') {
            console.error('[email-verification] SMTP saknas — ingen kod skickad till', email);
            return { success: false, error: 'E-post är inte konfigurerad.' };
        }
        console.log(
            `[email-verification] SMTP saknas. Kod för ${email}: ${code} ` +
            `(giltig i ${VERIFICATION_EXPIRY_MINUTES} min)`
        );
        return { success: true };
    }

    const message = verificationEmail(code, name);
    const result = await sendEmail({ to: email, subject: message.subject, html: message.html });
    if (!result.success) {
        console.error('[email-verification] Kunde inte skicka koden till', email);
        return { success: false, error: result.error };
    }
    return { success: true };
}
