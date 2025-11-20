import { cookies } from 'next/headers';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  toShopifyLanguage,
  type Language,
  type ShopifyLanguage,
} from './languageConfig';

/**
 * Läser användarens språkval från cookies (för server components)
 */
export async function getServerLanguage(): Promise<Language> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value;

  if (isSupportedLanguage(locale)) {
    return locale;
  }

  return DEFAULT_LANGUAGE;
}

export { toShopifyLanguage };
export type { Language, ShopifyLanguage };
