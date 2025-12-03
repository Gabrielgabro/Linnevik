'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  toShopifyLanguage,
  type Language,
  type ShopifyLanguage,
} from '@/lib/languageConfig';

interface LanguageContextType {
  language: Language;
  shopifyLanguage: ShopifyLanguage;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const router = useRouter();


  useEffect(() => {
    const savedLanguage = localStorage.getItem('linnevik:language');
    const cookieMatch = document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]+)/);
    const cookieLanguage = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    const initialLanguage =
      (savedLanguage && isSupportedLanguage(savedLanguage) && savedLanguage) ||
      (cookieLanguage && isSupportedLanguage(cookieLanguage) && cookieLanguage) ||
      DEFAULT_LANGUAGE;

    setLanguageState(initialLanguage);
    localStorage.setItem('linnevik:language', initialLanguage);
    document.cookie = `NEXT_LOCALE=${initialLanguage}; path=/; max-age=31536000; SameSite=Lax`;
  }, []);

  const persistLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('linnevik:language', lang);
    document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  };

  // Spara språk till localStorage och cookie när det ändras
  const setLanguage = (lang: Language) => {
    if (lang === language) return;
    persistLanguage(lang);
    router.refresh();
  };

  const shopifyLanguage = toShopifyLanguage(language);

  return (
    <LanguageContext.Provider value={{ language, shopifyLanguage, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export type { Language, ShopifyLanguage };
