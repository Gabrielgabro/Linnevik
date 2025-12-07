// web/src/components/FeaturedGrid.tsx
import { getFeaturedProducts } from '@/lib/shopify';
import FeaturedGridClient from './FeaturedGridClient';
import { toShopifyLanguage } from '@/lib/language';

import { normalizeLocale } from "@/lib/i18n";

export default async function FeaturedGrid({ locale }: { locale: string }) {
    // const language = await getServerLanguage();
    const language = normalizeLocale(locale);
    const shopifyLang = toShopifyLanguage(language);
    const products = await getFeaturedProducts(6, shopifyLang);
    return <FeaturedGridClient products={products} />;
}