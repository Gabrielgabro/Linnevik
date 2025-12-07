'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Language, ShopifyLanguage } from '@/lib/languageConfig';
import { toShopifyLanguage } from '@/lib/languageConfig';
import sv from '@/translations/sv.json';
import en from '@/translations/en.json';

const translations: Record<Language, typeof sv> = {
  sv,
  en,
};

type LocaleContextValue = {
  locale: Language;
  language: Language; // Alias for backwards compatibility
  t: typeof sv;
  shopifyLanguage: ShopifyLanguage;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = {
  children: ReactNode;
  locale: Language;
};

export function LocaleProvider({ children, locale }: LocaleProviderProps) {
  const t = translations[locale];
  const shopifyLanguage = toShopifyLanguage(locale);

  return (
    <LocaleContext.Provider value={{ locale, language: locale, t, shopifyLanguage }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
}

// Alias for backwards compatibility during migration
export const useTranslation = useLocale;
