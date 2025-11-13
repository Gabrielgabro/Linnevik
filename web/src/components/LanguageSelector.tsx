'use client';

import { useState } from 'react';

interface LanguageSelectorProps {
  variant?: 'header' | 'footer';
}

const FlagSE = () => (
  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="15" fill="#005293"/>
    <rect x="6" width="3" height="15" fill="#FECB00"/>
    <rect y="6" width="20" height="3" fill="#FECB00"/>
  </svg>
);

const FlagGB = () => (
  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="15" fill="#012169"/>
    <path d="M0 0L20 15M20 0L0 15" stroke="white" strokeWidth="3"/>
    <path d="M0 0L20 15M20 0L0 15" stroke="#C8102E" strokeWidth="2"/>
    <path d="M10 0V15M0 7.5H20" stroke="white" strokeWidth="5"/>
    <path d="M10 0V15M0 7.5H20" stroke="#C8102E" strokeWidth="3"/>
  </svg>
);

export default function LanguageSelector({ variant = 'header' }: LanguageSelectorProps) {
  const [currentLang, setCurrentLang] = useState('sv');

  const languages = [
    { code: 'sv', label: 'Svenska', flag: FlagSE },
    { code: 'en', label: 'English', flag: FlagGB }
  ];

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode);
    // TODO: Implement actual language switching logic
  };

  const currentLanguage = languages.find(lang => lang.code === currentLang);

  if (variant === 'footer') {
    return (
      <div className="flex items-center justify-center gap-3">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`text-sm transition-all ${
              currentLang === lang.code
                ? 'text-primary font-medium'
                : 'text-secondary hover:text-primary'
            }`}
          >
            {lang.label}
          </button>
        ))}
      </div>
    );
  }

  const CurrentFlag = currentLanguage?.flag;

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-full text-secondary hover-surface focus:outline-none transition-colors"
        aria-label="Change language"
      >
        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {CurrentFlag && <CurrentFlag />}
        </span>
        <span className="text-sm font-medium">{currentLanguage?.code.toUpperCase()}</span>
      </button>

      <div className="absolute right-0 mt-1 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-black/5 dark:ring-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 min-w-[140px]">
        {languages.map((lang) => {
          const Flag = lang.flag;
          return (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors ${
                currentLang === lang.code
                  ? 'bg-gray-50 dark:bg-gray-700 text-primary font-medium'
                  : 'text-secondary hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Flag />
              <span>{lang.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
