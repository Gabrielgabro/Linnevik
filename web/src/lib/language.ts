import { cookies } from 'next/headers';

export type Language = 'sv' | 'en';
export type ShopifyLanguage = 'SV' | 'EN';

/**
 * Läser användarens språkval från cookies (för server components)
 */
export async function getServerLanguage(): Promise<Language> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value as Language | undefined;

  // Default till svenska om ingen cookie finns
  return (locale === 'en' || locale === 'sv') ? locale : 'sv';
}

/**
 * Konverterar till Shopify språkformat (SV/EN)
 */
export function toShopifyLanguage(lang: Language): ShopifyLanguage {
  return lang.toUpperCase() as ShopifyLanguage;
}
