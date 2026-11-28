import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { normalizeLocale } from './i18n';
import type { Language } from './languageConfig';
import { getCurrentCustomerFromCookies } from './customerAccount';

/**
 * Get the user's current locale from cookies or URL
 */
export async function getCurrentLocale(): Promise<Language> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'sv';
  return normalizeLocale(locale);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  // Ett giltigt kakvärde räcker inte: kontot kan vara inaktivt eller raderat.
  // Förr skickade /login då vidare till /account, som visade ett tomt konto,
  // och kunden kom inte ur slingan (plan.md, H10).
  return Boolean(await getCurrentCustomerFromCookies());
}

/**
 * Redirect to login page, preserving locale
 */
export async function redirectToLogin(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}/login`);
}

/**
 * Redirect to account page, preserving locale
 */
export async function redirectToAccount(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}/account`);
}

/**
 * Redirect to home page, preserving locale
 */
export async function redirectToHome(locale?: Language) {
  const currentLocale = locale || await getCurrentLocale();
  redirect(`/${currentLocale}`);
}
