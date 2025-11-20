'use client';

import sv from '@/translations/sv.json';
import en from '@/translations/en.json';
import { useLanguage } from '@/contexts/LanguageContext';

export function useTranslation() {
  const { language, shopifyLanguage } = useLanguage();

  const translations = {
    sv,
    en,
  };

  const t = translations[language];

  return {
    t,
    language,
    shopifyLanguage,
  };
}
