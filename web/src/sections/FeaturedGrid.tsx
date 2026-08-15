// web/src/components/FeaturedGrid.tsx
import { getFeaturedProducts } from '@/lib/shopify';
import FeaturedGridClient from './FeaturedGridClient';
import { toShopifyLanguage } from '@/lib/language';
import { filterPurchasableHandles } from '@/lib/catalogDb';

import { normalizeLocale } from "@/lib/i18n";

export default async function FeaturedGrid({ locale }: { locale: string }) {
    // const language = await getServerLanguage();
    const language = normalizeLocale(locale);
    const shopifyLang = toShopifyLanguage(language);
    const products = await getFeaturedProducts(6, shopifyLang);

    // Priset kommer från Shopify, men om vi inte säljer varan får det inte
    // stå här — kassan hade nekat den. Samma villkor som produktsidan och
    // kategorilistorna går efter.
    const purchasable = await filterPurchasableHandles(products.map(product => product.handle));
    const shown = products.map(product =>
        purchasable.has(product.handle) ? product : { ...product, priceRange: undefined }
    );

    return <FeaturedGridClient products={shown} />;
}