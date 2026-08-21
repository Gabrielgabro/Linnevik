const SUPPORTED_LANGUAGE_DEFINITIONS = [
  { code: 'sv', label: 'Svenska' },
  { code: 'en', label: 'English' },
] as const;

export const SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGE_DEFINITIONS;
export type Language = typeof SUPPORTED_LANGUAGE_DEFINITIONS[number]['code'];

export const DEFAULT_LANGUAGE: Language = SUPPORTED_LANGUAGE_DEFINITIONS[0].code;

type LanguageMap = Record<Language, { label: string }>;

export const languageDetailsMap: LanguageMap = SUPPORTED_LANGUAGE_DEFINITIONS.reduce(
  (acc, lang) => {
    acc[lang.code] = { label: lang.label };
    return acc;
  },
  {} as LanguageMap
);

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in languageDetailsMap;
}

export function getLanguageLabel(lang: Language): string {
  return languageDetailsMap[lang].label;
}
