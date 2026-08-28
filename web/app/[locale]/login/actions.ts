'use server';

import { cookies, headers } from 'next/headers';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/customerSession';
import { registerCustomer } from '@/lib/commerceOperations';
import { requestMagicLink } from '@/lib/magicLink';
import { getTranslations, type Translations } from '@/lib/getTranslations';
import { getServerLanguage } from '@/lib/language';
import { checkRateLimit, clientIp } from '@/lib/rateLimit';
import {
    isSwedishSoleTrader,
    isValidCompanyRegistrationNumber,
    normalizeCompanyRegistrationNumber,
} from '@/lib/companyRegistration';
import {
    addressIsComplete,
    isValidCompanyName,
    normalizeAddress,
    normalizeCompanyName,
} from '@/lib/companyProfile';

const COOKIE_NAME = 'shopify_customer_token';
const REGISTER_RATE_PER_IP = 10;
const REGISTER_RATE_PER_EMAIL = 5;
const REGISTER_RATE_WINDOW_SECONDS = 60 * 60;

async function getActionTranslations(): Promise<Translations> {
    return getTranslations(await getServerLanguage());
}

type RegisterFields = {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    phone?: string;
    companyRegistrationNumber?: string;
    companyName?: string;
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    city?: string;
};

export type RegisterState = {
    status: 'idle' | 'success' | 'error';
    message?: string;
    fields?: RegisterFields;
};

export async function handleRegister(_: RegisterState, formData: FormData): Promise<RegisterState> {
    const t = await getActionTranslations();

    // Adressen först, kakan sedan: en besökare som kommer rakt in på /en har
    // ingen NEXT_LOCALE, och fick då svenska felmeddelanden och en svensk
    // inloggningslänk under ett engelskt gränssnitt.
    const locale = await getServerLanguage();

    const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
    // Kontaktpersonen är obligatorisk: kundregistret listar företag, men en
    // faktura går till en människa, och "Er referens" hämtas härifrån. Utan
    // namn blev kontakten döpt efter mejladressens första del.
    const firstName = formData.get('firstName')?.toString().trim() || '';
    const lastName = formData.get('lastName')?.toString().trim() || '';
    // Roll och telefon är frivilliga — de gör kontakten användbar, men ingen
    // registrering ska falla på dem.
    const role = formData.get('role')?.toString().trim() || undefined;
    const phone = formData.get('phone')?.toString().trim() || undefined;
    const companyRegistrationNumber = normalizeCompanyRegistrationNumber(
        formData.get('companyRegistrationNumber')
    );
    // Företagsnamn och faktureringsadress frågas efter redan här. De behövs för
    // att kunna skicka en faktura, och ett konto som saknar dem stoppas först i
    // kassan — där kunden har en korg och ingen lust att fylla i ett formulär.
    const companyName = normalizeCompanyName(formData.get('companyName'));
    const address = normalizeAddress({
        line1: formData.get('addressLine1'),
        line2: formData.get('addressLine2'),
        postalCode: formData.get('postalCode'),
        city: formData.get('city'),
    });
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const fields: RegisterFields = {
        email,
        firstName,
        lastName,
        role,
        phone,
        companyRegistrationNumber,
        companyName,
        // Fälten ekas tillbaka i den form kunden skrev dem, inte i den
        // normaliserade — annars ser ett postnummer som inte gick att tyda ut
        // som om formuläret hade ätit upp det.
        addressLine1: formData.get('addressLine1')?.toString() ?? '',
        addressLine2: formData.get('addressLine2')?.toString() ?? '',
        postalCode: formData.get('postalCode')?.toString() ?? '',
        city: formData.get('city')?.toString() ?? '',
    };

    // Validation: required fields
    if (!email || !firstName || !lastName || !companyRegistrationNumber || !companyName || !address) {
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
    if (firstName.length > 100) {
        return {
            status: 'error',
            message: t.register.errors.firstNameInvalid,
            fields,
        };
    }

    if (lastName.length > 100) {
        return {
            status: 'error',
            message: t.register.errors.lastNameInvalid,
            fields,
        };
    }

    if (role && role.length > 120) {
        return { status: 'error', message: t.register.errors.roleInvalid, fields };
    }

    if (phone && phone.length > 40) {
        return { status: 'error', message: t.register.errors.phoneInvalid, fields };
    }

    // Validation: company registration number format
    if (!isValidCompanyRegistrationNumber(companyRegistrationNumber)) {
        return {
            status: 'error',
            message: t.register.errors.invalidCompanyNumber,
            fields,
        };
    }

    if (!isValidCompanyName(companyName)) {
        return {
            status: 'error',
            message: t.register.errors.invalidCompanyName,
            fields,
        };
    }

    // Fakturan ställs ut på företaget och kontaktpersonen står som "Er
    // referens" — de två får alltså inte vara samma namn. Fångas här och inte
    // först i kassan, där kunden har en korg och fakturarutten hade avvisat
    // registreringen ändå. Enskild firma undantas: den heter sin innehavare.
    if (
        companyName.toLowerCase() === `${firstName} ${lastName}`.toLowerCase() &&
        !isSwedishSoleTrader(companyRegistrationNumber)
    ) {
        return {
            status: 'error',
            message: t.register.errors.companyNameIsPerson,
            fields,
        };
    }

    // Adressen kontrolleras som en helhet: en gatuadress utan postnummer går
    // inte att fakturera på, hur välskriven den än är.
    if (!addressIsComplete(address)) {
        return {
            status: 'error',
            message: t.register.errors.invalidAddress,
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
            role,
            phone,
            taxId: companyRegistrationNumber,
            companyName,
            address,
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
                locale,
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
        const locale = await getServerLanguage();
        const headerList = await headers();
        await requestMagicLink({
            email,
            locale,
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
