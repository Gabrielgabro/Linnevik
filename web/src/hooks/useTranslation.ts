'use client';

import sv from '@/translations/sv.json';
import en from '@/translations/en.json';
import { useLanguage } from '@/contexts/LanguageContext';
import { DEFAULT_LANGUAGE, type Language } from '@/lib/languageConfig';

const translations: Record<Language, typeof sv> = {
  sv,
  en,
};

export function useTranslation() {
  const { language, shopifyLanguage } = useLanguage();
  const fallback = translations[DEFAULT_LANGUAGE];
  const t = translations[language] ?? fallback;

  return {
    t,
    language,
    shopifyLanguage,
  };
}
