'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'sv' | 'en';
export type ShopifyLanguage = 'SV' | 'EN';

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
  const [language, setLanguageState] = useState<Language>('sv');

  // Ladda språk från localStorage vid mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('linnevik:language') as Language | null;
    if (savedLanguage && (savedLanguage === 'sv' || savedLanguage === 'en')) {
      setLanguageState(savedLanguage);
    }
  }, []);

  // Spara språk till localStorage och cookie när det ändras
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('linnevik:language', lang);
    // Sätt cookie så server components kan läsa språket
    document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    // Reload sidan för att server components ska hämta data på rätt språk
    window.location.reload();
  };

  // Konvertera till Shopify format (SV/EN)
  const shopifyLanguage: ShopifyLanguage = language.toUpperCase() as ShopifyLanguage;

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
