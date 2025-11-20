// web/src/components/FeaturedGrid.tsx
import { getFeaturedProducts } from '@/lib/shopify';
import FeaturedGridClient from './FeaturedGridClient';
import { getServerLanguage, toShopifyLanguage } from '@/lib/language';

export default async function FeaturedGrid() {
    const language = await getServerLanguage();
    const shopifyLang = toShopifyLanguage(language);
    const products = await getFeaturedProducts(6, shopifyLang);
    return <FeaturedGridClient products={products} />;
}