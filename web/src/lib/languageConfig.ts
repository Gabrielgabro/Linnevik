const SUPPORTED_LANGUAGE_DEFINITIONS = [
  { code: 'sv', shopifyCode: 'SV', label: 'Svenska' },
  { code: 'en', shopifyCode: 'EN', label: 'English' },
] as const;

export const SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGE_DEFINITIONS;
export type Language = typeof SUPPORTED_LANGUAGE_DEFINITIONS[number]['code'];
export type ShopifyLanguage = typeof SUPPORTED_LANGUAGE_DEFINITIONS[number]['shopifyCode'];

export const DEFAULT_LANGUAGE: Language = SUPPORTED_LANGUAGE_DEFINITIONS[0].code;

type LanguageMap = Record<Language, { shopifyCode: ShopifyLanguage; label: string }>;

export const languageDetailsMap: LanguageMap = SUPPORTED_LANGUAGE_DEFINITIONS.reduce(
  (acc, lang) => {
    acc[lang.code] = { shopifyCode: lang.shopifyCode, label: lang.label };
    return acc;
  },
  {} as LanguageMap
);

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in languageDetailsMap;
}

export function toShopifyLanguage(lang: Language): ShopifyLanguage {
  return languageDetailsMap[lang].shopifyCode;
}

export function getLanguageLabel(lang: Language): string {
  return languageDetailsMap[lang].label;
}
