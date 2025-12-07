import { DEFAULT_LANGUAGE, isSupportedLanguage, type Language } from './languageConfig';
import sv from '@/translations/sv.json';
import en from '@/translations/en.json';

const translations: Record<Language, typeof sv> = {
  sv,
  en,
};

/**
 * Get translations for a specific locale
 * Server-side safe version of useTranslation
 */
export function getTranslations(locale: string) {
  const lang = isSupportedLanguage(locale) ? locale : DEFAULT_LANGUAGE;
  return translations[lang];
}

/**
 * Validate and normalize locale parameter
 */
export function normalizeLocale(locale: string | undefined): Language {
  if (!locale || !isSupportedLanguage(locale)) {
    return DEFAULT_LANGUAGE;
  }
  return locale;
}
