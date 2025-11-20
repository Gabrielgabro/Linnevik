import sv from '@/translations/sv.json' assert { type: 'json' };
import en from '@/translations/en.json' assert { type: 'json' };
import { DEFAULT_LANGUAGE, type Language } from './languageConfig';

const TRANSLATIONS: Record<Language, typeof sv> = {
  sv,
  en,
};

export type Translations = typeof sv;

export function getTranslations(language: Language): Translations {
  return TRANSLATIONS[language] ?? TRANSLATIONS[DEFAULT_LANGUAGE];
}
